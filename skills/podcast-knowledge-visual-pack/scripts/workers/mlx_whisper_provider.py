"""Local-only MLX Whisper provider with atomic per-segment checkpoints."""
import argparse
import json
import os
import resource
import sys
import time
from pathlib import Path

import av
import mlx_whisper
import numpy as np
from asr_progress import ProgressReporter


def write_atomic(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def decode_clip(audio_path, start_ms, end_ms):
    container = av.open(audio_path)
    stream = container.streams.audio[0]
    container.seek(int(start_ms * stream.rate / 1000), stream=stream, backward=True)
    resampler = av.audio.resampler.AudioResampler(format="flt", layout="mono", rate=16000)
    chunks = []
    start, end = start_ms / 1000, end_ms / 1000
    for frame in container.decode(stream):
        frame_start = float(frame.pts * stream.time_base) if frame.pts is not None else 0.0
        frame_end = frame_start + frame.samples / frame.sample_rate
        if frame_end <= start:
            continue
        if frame_start >= end:
            break
        for output in resampler.resample(frame):
            data = output.to_ndarray().reshape(-1)
            left = max(0, round((start - frame_start) * 16000))
            right = min(data.size, round((end - frame_start) * 16000))
            if right > left:
                chunks.append(data[left:right])
    container.close()
    if not chunks:
        raise RuntimeError("decoder produced no samples")
    return np.concatenate(chunks).astype(np.float32)


def decode_full_audio(audio_path):
    container = av.open(audio_path)
    stream = container.streams.audio[0]
    resampler = av.audio.resampler.AudioResampler(format="flt", layout="mono", rate=16000)
    chunks = []
    for frame in container.decode(stream):
        for output in resampler.resample(frame):
            chunks.append(output.to_ndarray().reshape(-1))
    container.close()
    if not chunks:
        raise RuntimeError("decoder produced no samples")
    return np.concatenate(chunks).astype(np.float32)


def probe(audio_path):
    container = av.open(audio_path)
    streams, duration_ms, silent_seconds = [], 0, []
    for stream in container.streams.audio:
        streams.append({"codec": stream.codec_context.name, "channels": stream.channels, "sample_rate": stream.rate, "bit_rate": stream.bit_rate})
        if stream.duration is not None:
            duration_ms = max(duration_ms, round(float(stream.duration * stream.time_base) * 1000))
        resampler = av.audio.resampler.AudioResampler(format="flt", layout="mono", rate=16000)
        pending, second = np.array([], dtype=np.float32), 0
        for frame in container.decode(stream):
            for output in resampler.resample(frame):
                pending = np.concatenate((pending, output.to_ndarray().reshape(-1)))
                while pending.size >= 16000:
                    sample, pending = pending[:16000], pending[16000:]
                    if float(np.sqrt(np.mean(sample * sample))) < 0.003:
                        silent_seconds.append(second)
                    second += 1
        break
    container.close()
    intervals = []
    for second in silent_seconds:
        if not intervals or second > intervals[-1]["end_second"] + 1:
            intervals.append({"start_second": second, "end_second": second})
        else:
            intervals[-1]["end_second"] = second
    return {"tool": {"id": "pyav", "version": av.__version__}, "duration_ms": duration_ms, "decode_ok": True, "streams": streams, "silence": {"ratio": round(len(silent_seconds) / max(second, 1), 6), "intervals": intervals}, "warnings": []}


def checkpoint_base(request, item):
    return {
        "schema_version": "1.0",
        "checkpoint_id": f"{request['asr_key']}:{item['id']}",
        "asr_key": request["asr_key"],
        "source_identity": request["source_identity"],
        "audio": request["audio"],
        "provider": request["provider"],
        "segment": item,
    }


def update_progress(path, request, item, status, details=None):
    payload = {
        "asr_key": request["asr_key"],
        "status": status,
        "current_segment_id": item["id"],
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "heartbeat": {"actor": "mlx-whisper-provider", "pid": os.getpid()},
    }
    if details:
        payload["details"] = details
    write_atomic(path, payload)


def update_run_state(request, current_segment_id, completed, failed=0, status="running"):
    state = {
        "schema_version": "1.0",
        "asr_key": request["asr_key"],
        "status": status,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "current_segment_id": current_segment_id,
        "last_completed_segment_id": request.get("last_completed_segment_id"),
        "total_segments": request["run_state"]["total_segments"],
        "completed_segments": completed,
        "failed_segments": failed,
        "pending_segments": request["run_state"]["total_segments"] - completed,
        "heartbeat": {"actor": "mlx-whisper-provider", "pid": os.getpid()},
    }
    write_atomic(request["run_state"]["path"], state)


def transcribe_item(request, item, progress_path):
    started = time.monotonic()
    update_progress(progress_path, request, item, "decoding")
    waveform = decode_clip(request["audio_path"], item["context_start_ms"], item["context_end_ms"])
    update_progress(progress_path, request, item, "transcribing", {"decoded_samples": int(waveform.size)})
    response = mlx_whisper.transcribe(
        waveform,
        path_or_hf_repo=request["model"],
        language="zh",
        word_timestamps=True,
        condition_on_previous_text=False,
        initial_prompt=request.get("initial_prompt"),
        verbose=None,
    )
    results = []
    for index, segment in enumerate(response.get("segments", [])):
        text = segment.get("text", "").strip()
        if not text:
            continue
        start_ms = item["context_start_ms"] + round(float(segment["start"]) * 1000)
        end_ms = item["context_start_ms"] + round(float(segment["end"]) * 1000)
        midpoint = (start_ms + end_ms) // 2
        if not (item["core_start_ms"] <= midpoint < item["core_end_ms"]):
            continue
        words = [{"start_ms": item["context_start_ms"] + round(float(word["start"]) * 1000), "end_ms": item["context_start_ms"] + round(float(word["end"]) * 1000), "text": word.get("word", ""), "probability": word.get("probability")} for word in segment.get("words", [])]
        results.append({"id": f"raw_{item['id']}_{index:03d}", "source_segment_id": item["id"], "global_start_ms": start_ms, "global_end_ms": end_ms, "text": text, "speaker_label": None, "confidence": segment.get("avg_logprob"), "flags": ["provider_no_diarization"], "provenance": {"provider_result_id": item["id"], "received_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, "words": words, "metrics": {"no_speech_prob": segment.get("no_speech_prob"), "compression_ratio": segment.get("compression_ratio"), "elapsed_seconds": round(time.monotonic() - started, 3)}})
    return {"segments": results, "resource": {"max_rss": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, "elapsed_seconds": round(time.monotonic() - started, 3)}}


def transcribe(args):
    request = json.loads(Path(args.request).read_text(encoding="utf-8"))
    failures = []
    completed = request["run_state"]["initial_completed_segments"]
    for item in request["segments"]:
        checkpoint_path = Path(args.checkpoint_dir) / f"{item['id']}.json"
        update_progress(args.progress_path, request, item, "running")
        try:
            result = transcribe_item(request, item, args.progress_path)
            checkpoint = checkpoint_base(request, item)
            checkpoint.update({"status": "completed", "completion": {"state": "completed", "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, "result": result})
            write_atomic(checkpoint_path, checkpoint)
            completed += 1
            request["last_completed_segment_id"] = item["id"]
            update_run_state(request, None, completed, len(failures), "running")
            update_progress(args.progress_path, request, item, "completed", {"checkpoint": str(checkpoint_path), "result_segments": len(result["segments"])})
        except Exception as error:
            checkpoint = checkpoint_base(request, item)
            checkpoint.update({"status": "failed", "completion": {"state": "failed", "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "error": {"kind": "provider_error", "message": str(error)}}, "result": {"segments": []}})
            write_atomic(checkpoint_path, checkpoint)
            update_run_state(request, item["id"], completed, len(failures) + 1, "failed")
            update_progress(args.progress_path, request, item, "failed", {"error_kind": "provider_error", "message": str(error)})
            failures.append(item["id"])
    if failures:
        print(json.dumps({"status": "failed", "failed_segment_ids": failures}), file=sys.stderr)
        sys.exit(2)


def direct_result(request, waveform):
    started = time.monotonic()
    response = mlx_whisper.transcribe(
        waveform,
        path_or_hf_repo=request["model"],
        language="zh",
        word_timestamps=True,
        condition_on_previous_text=False,
        initial_prompt=request.get("initial_prompt"),
        verbose=None,
    )
    segments = []
    for index, segment in enumerate(response.get("segments", [])):
        text = segment.get("text", "").strip()
        if not text:
            continue
        words = [{"start_ms": round(float(word["start"]) * 1000), "end_ms": round(float(word["end"]) * 1000), "text": word.get("word", ""), "probability": word.get("probability")} for word in segment.get("words", [])]
        segments.append({"id": f"raw_direct_{index:05d}", "source_segment_id": "direct_0001", "global_start_ms": round(float(segment["start"]) * 1000), "global_end_ms": round(float(segment["end"]) * 1000), "text": text, "speaker_label": None, "confidence": segment.get("avg_logprob"), "flags": ["provider_no_diarization", "direct_execution"], "provenance": {"provider_result_id": "direct_0001", "received_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, "words": words, "metrics": {"no_speech_prob": segment.get("no_speech_prob"), "compression_ratio": segment.get("compression_ratio")}})
    return {"segments": segments, "resource": {"max_rss": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, "elapsed_seconds": round(time.monotonic() - started, 3)}}


def direct(args):
    request = json.loads(Path(args.request).read_text(encoding="utf-8"))
    with ProgressReporter(args.progress_path, request["asr_key"]) as progress:
        progress.stage("decoding")
        waveform = decode_full_audio(request["audio_path"])
        progress.stage("transcribing", decoded_samples=int(waveform.size))
        result = direct_result(request, waveform)
        progress.stage("saving", result_segments=len(result["segments"]))
        receipt = {"schema_version": "1.0", "asr_key": request["asr_key"], "execution_strategy": "direct", "source_identity": request["source_identity"], "audio": request["audio"], "provider": request["provider"], "completion": {"state": "completed", "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, "result": result}
        write_atomic(args.output, receipt)
        progress.stage("completed", receipt=args.output, result_segments=len(result["segments"]))


parser = argparse.ArgumentParser()
sub = parser.add_subparsers(dest="command", required=True)
p = sub.add_parser("probe"); p.add_argument("--audio", required=True)
t = sub.add_parser("transcribe"); t.add_argument("--request", required=True); t.add_argument("--checkpoint-dir", required=True); t.add_argument("--progress-path", required=True)
d = sub.add_parser("direct"); d.add_argument("--request", required=True); d.add_argument("--output", required=True); d.add_argument("--progress-path", required=True)
args = parser.parse_args()
if args.command == "probe":
    print(json.dumps(probe(args.audio), ensure_ascii=False))
elif args.command == "transcribe":
    transcribe(args)
else:
    direct(args)
