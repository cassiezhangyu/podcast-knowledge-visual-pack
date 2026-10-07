import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { evaluateGroundedTranscriptQa, assertCurrentGroundedTranscriptQa } from "../src/grounded-transcript-qa.js";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { applyCorrectionRequest, buildSegments, checkpointPath, evaluateTranscriptQa, readValidCheckpoints, reconcileSegments, runTranscript, selectExecutionStrategy } from "../src/transcript.js";

const sha = "a".repeat(64);
const sourceIdentity = { canonical_url: "https://www.xiaoyuzhoufm.com/episode/test", adapter_version: "1.0.2" };
const provider = { id: "mlx-whisper-local", model: "mlx-community/whisper-large-v3-turbo", config: { language: "zh", word_timestamps: true, condition_on_previous_text: false } };
const manifest = { schema_version: "1.0", source_identity: sourceIdentity, status: "acquired" as const, content_identity: { sha256: sha }, asset: { relative_path: "00-source/audio/test.m4a", byte_length: 1, mime_type: "audio/mp4" }, retrieval: { audio_url: "https://audio.example.test/test.m4a", retrieved_at: "2026-09-17T00:00:00.000Z", http_status: 200 }, source_refs: [{ kind: "audio_download", locator: "https://audio.example.test/test.m4a", retrieved_at: "2026-09-17T00:00:00.000Z" }] };

function checkpoint(request: Record<string, any>, segment: Record<string, any>) {
  return { schema_version: "1.0", checkpoint_id: `${request.asr_key}:${segment.id}`, asr_key: request.asr_key, status: "completed", source_identity: request.source_identity, audio: request.audio, provider: request.provider, segment, completion: { state: "completed", updated_at: "2026-09-17T00:00:00.000Z" }, result: { segments: [{ id: `raw_${segment.id}_000`, source_segment_id: segment.id, global_start_ms: segment.core_start_ms, global_end_ms: segment.core_start_ms + 1000, text: `text ${segment.id}`, speaker_label: null, confidence: null, flags: ["provider_no_diarization"], provenance: { received_at: "2026-09-17T00:00:00.000Z" } }] } };
}

function fixtureWorkspace() {
  const workspace = mkdtempSync(join(tmpdir(), "podcast-checkpoint-"));
  const source = join(workspace, "00-source"); mkdirSync(join(source, "audio"), { recursive: true }); writeFileSync(join(source, "audio", "test.m4a"), "x");
  writeFileSync(join(source, "episode_metadata.json"), JSON.stringify({ schema_version: "1.0", source_identity: sourceIdentity, episode: { id: "test", title: "Test", podcast_name: "Test", published_at: null, duration_seconds: 60, show_notes: "Test", cover_url: null, audio_candidates: ["https://audio.example.test/test.m4a"] }, source_refs: [{ kind: "input_url", locator: sourceIdentity.canonical_url, retrieved_at: "2026-09-17T00:00:00.000Z" }] }));
  writeFileSync(join(source, "audio_manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(source, "audio_preflight.json"), JSON.stringify({ schema_version: "1.0", audio_sha256: sha, tool: { id: "test", version: "1" }, duration_ms: 60_000, decode_ok: true, streams: [{ codec: "aac" }], silence: { ratio: 0, intervals: [] }, warnings: [] }));
  return workspace;
}

describe("segment planning", () => {
  it("creates stable cores with two-second context overlap", () => {
    const segments = buildSegments(72_500);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({ id: "seg_0001", context_start_ms: 0, core_end_ms: 30_000 });
    expect(segments[1]).toMatchObject({ id: "seg_0002", context_start_ms: 28_000, core_start_ms: 30_000, context_end_ms: 62_000 });
    expect(segments[2]).toMatchObject({ id: "seg_0003", core_end_ms: 72_500, context_end_ms: 72_500 });
  });

  it("quarantines corrupt checkpoints and never treats them as cache hits", () => {
    const root = mkdtempSync(join(tmpdir(), "podcast-corrupt-"));
    try {
      const segment = buildSegments(30_000)[0];
      mkdirSync(root, { recursive: true }); writeFileSync(checkpointPath(root, segment.id), "not json");
      const result = readValidCheckpoints(root, "b".repeat(64), manifest, [segment]);
      expect(result.completed.size).toBe(0); expect(result.invalid).toEqual([segment.id]); expect(existsSync(checkpointPath(root, segment.id))).toBe(false);
      expect(readdirSync(root).some((name) => name.includes(".corrupt-"))).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("retains completed neighbors when a separate segment has a failed checkpoint", () => {
    const root = mkdtempSync(join(tmpdir(), "podcast-failed-"));
    try {
      const segments = buildSegments(60_000), request = { asr_key: "b".repeat(64), source_identity: sourceIdentity, audio: { sha256: sha, relative_path: manifest.asset.relative_path }, provider };
      mkdirSync(root, { recursive: true }); writeFileSync(checkpointPath(root, segments[0].id), JSON.stringify(checkpoint(request, segments[0])));
      const failed = checkpoint(request, segments[1]); failed.status = "failed"; failed.completion = { state: "failed", updated_at: "2026-09-17T00:00:00.000Z", error: { kind: "provider_error" } }; failed.result = { segments: [] };
      writeFileSync(checkpointPath(root, segments[1].id), JSON.stringify(failed));
      const result = readValidCheckpoints(root, request.asr_key, manifest, segments);
      expect(result.completed.get(segments[0].id)?.status).toBe("completed"); expect(result.failed).toEqual([segments[1].id]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("resumes after interruption, skips a valid checkpoint, and assembles only after all segments", async () => {
    const workspace = fixtureWorkspace(), calls: string[][] = [];
    try {
      const first = async (requestPath: string, checkpointDir: string) => {
        const request = JSON.parse(readFileSync(requestPath, "utf8")); calls.push(request.segments.map((s: { id: string }) => s.id));
        mkdirSync(checkpointDir, { recursive: true }); writeFileSync(checkpointPath(checkpointDir, request.segments[0].id), JSON.stringify(checkpoint(request, request.segments[0])));
        return { code: null, signal: "SIGTERM" as NodeJS.Signals, stderr: "" };
      };
      await expect(runTranscript(workspace, "unused", undefined, { batchSize: 2, strategy: "segmented", executeProvider: first })).rejects.toMatchObject({ code: "ASR_EXECUTION_INTERRUPTED" });
      expect(existsSync(join(workspace, "00-source", "transcript_raw.json"))).toBe(false);
      const second = async (requestPath: string, checkpointDir: string) => {
        const request = JSON.parse(readFileSync(requestPath, "utf8")); calls.push(request.segments.map((s: { id: string }) => s.id));
        for (const segment of request.segments) writeFileSync(checkpointPath(checkpointDir, segment.id), JSON.stringify(checkpoint(request, segment)));
        return { code: 0, signal: null, stderr: "" };
      };
      const result = await runTranscript(workspace, "unused", undefined, { batchSize: 2, strategy: "segmented", executeProvider: second });
      expect(calls).toEqual([["seg_0001", "seg_0002"], ["seg_0002"]]);
      expect(result.status).toBe("completed"); expect(existsSync(join(workspace, "00-source", "transcript_raw.json"))).toBe(true);
      expect(reconcileSegments([])).toEqual([]);
    } finally { rmSync(workspace, { recursive: true, force: true }); }
  });

  it("selects direct only for stable AUTO runs without segment-resume requirement", () => {
    expect(selectExecutionStrategy("auto", "stable", false)).toMatchObject({ strategy: "direct" });
    expect(selectExecutionStrategy("auto", "bounded", false)).toMatchObject({ strategy: "segmented" });
    expect(selectExecutionStrategy("auto", "stable", true)).toMatchObject({ strategy: "segmented" });
    expect(selectExecutionStrategy("direct", "bounded", true)).toMatchObject({ strategy: "direct" });
  });

  it("fails the Transcript Gate for a compression-ratio repetition anomaly without changing Raw", () => {
    const raw = { segments: [{ text: "本".repeat(80), global_start_ms: 15_000, global_end_ms: 22_000, metrics: { compression_ratio: 36.8 } }, ...Array.from({ length: 999 }, (_, index) => ({ text: "正常文本", global_start_ms: 22_920 + index, global_end_ms: 22_921 + index, metrics: { compression_ratio: 1.1 } }))] };
    const metadata = { schema_version: "1.0", source_identity: sourceIdentity, episode: { id: "test", title: "Test", podcast_name: "Test", published_at: null, duration_seconds: 60, show_notes: "CapWords", cover_url: null, audio_candidates: ["https://audio.example.test/test.m4a"] }, source_refs: [{ kind: "input_url", locator: sourceIdentity.canonical_url, retrieved_at: "2026-09-17T00:00:00.000Z" }] };
    const qa = evaluateTranscriptQa(raw, metadata, 60_000);
    expect(qa.status).toBe("needs_grounding"); expect(qa.checks.find((check: any) => check.name === "abnormal_asr_segments")).toMatchObject({ status: "fail", count: 1 });
    expect(raw.segments[0].text).toBe("本".repeat(80));
  });

  it("applies an audio-relisten correction only to Grounded and preserves Raw", () => {
    const workspace = fixtureWorkspace(), source = join(workspace, "00-source");
    try {
      const raw = { schema_version: "1.0", kind: "raw", pipeline_version: "2.0.0", cache_key: "k", audio: { sha256: sha, relative_path: manifest.asset.relative_path, duration_ms: 60_000 }, provider: { ...provider, runtime_version: "test", capabilities: {} }, execution: { strategy: "direct", receipt_path: "r", selection_reason: "test" }, segments: [{ id: "raw_1", source_segment_id: "direct_1", text: "坏坏坏", global_start_ms: 1000, global_end_ms: 2000, speaker_label: null, confidence: null, flags: [], provenance: {}, metrics: { compression_ratio: 3 } }] };
      writeFileSync(join(source, "transcript_raw.json"), JSON.stringify(raw));
      const requestPath = join(workspace, "correction.json"); writeFileSync(requestPath, JSON.stringify({ id: "corr_1", affected_span_ref: "raw_1", corrected: "好", reason: "audio_relisten", evidence: [{ kind: "audio_relisten" }], confidence: 0.9, review_status: "applied" }));
      applyCorrectionRequest(workspace, requestPath);
      expect(JSON.parse(readFileSync(join(source, "transcript_raw.json"), "utf8")).segments[0].text).toBe("坏坏坏");
      expect(JSON.parse(readFileSync(join(source, "transcript_grounded.json"), "utf8")).spans[0]).toMatchObject({ text: "好", correction_ids: ["corr_1"] });
      expect(JSON.parse(readFileSync(join(source, "corrections.json"), "utf8")).corrections[0].original).toBe("坏坏坏");
    } finally { rmSync(workspace, { recursive: true, force: true }); }
  });
});

function correctedFixture() {
  const workspace = fixtureWorkspace(), source = join(workspace, "00-source");
  const raw = { schema_version: "1.0", kind: "raw", pipeline_version: "2.0.0", cache_key: "k", audio: { sha256: sha, relative_path: manifest.asset.relative_path, duration_ms: 60_000 }, provider: { ...provider, runtime_version: "test", capabilities: {} }, execution: { strategy: "direct", receipt_path: "r", selection_reason: "test" }, segments: [{ id: "raw_1", source_segment_id: "direct_1", text: "的".repeat(80), global_start_ms: 0, global_end_ms: 60_000, speaker_label: null, confidence: null, flags: [], provenance: {}, metrics: { compression_ratio: 36.8 } }] };
  writeFileSync(join(source, "transcript_raw.json"), JSON.stringify(raw));
  const evidencePath = join(source, "relisten.json");
  writeFileSync(evidencePath, JSON.stringify({ audio_sha256: sha, start_ms: 0, end_ms: 60_000, reviewed_by: "reviewer", review_status: "reviewed" }));
  const request = { id: "corr_1", affected_span_ref: "raw_1", corrected: "欢迎收听，今天讨论传播。", reason: "audio_relisten", evidence: [{ kind: "audio_relisten", path: "00-source/relisten.json", sha256: createHash("sha256").update(readFileSync(evidencePath)).digest("hex") }], confidence: 0.9, review_status: "applied" };
  const requestPath = join(workspace, "correction.json"); writeFileSync(requestPath, JSON.stringify(request)); applyCorrectionRequest(workspace, requestPath);
  return { workspace, source, raw, request, requestPath, evidencePath };
}

function verbatimFixture() {
  const f = correctedFixture();
  const correctionsPath = join(f.source, "corrections.json"), corrections = JSON.parse(readFileSync(correctionsPath, "utf8"));
  const c = corrections.corrections[0], text = f.raw.segments[0].text;
  writeFileSync(f.evidencePath, `用户确认原段：${text}\n`);
  c.corrected = text; c.resolution = "verbatim_confirmed"; c.reason = "用户明确确认此原段的重复口语";
  c.evidence = [{ kind: "user_verbatim_excerpt", path: "00-source/relisten.json", raw_span_id: "raw_1", origin: "user_attachment", sha256: createHash("sha256").update(readFileSync(f.evidencePath)).digest("hex") }];
  function save() {
    writeFileSync(correctionsPath, JSON.stringify(corrections));
    const p = join(f.source, "transcript_grounded.json"), g = JSON.parse(readFileSync(p, "utf8"));
    g.spans[0].text = c.corrected; g.corrections_sha256 = createHash("sha256").update(JSON.stringify(corrections)).digest("hex");
    writeFileSync(p, JSON.stringify(g));
  }
  save();
  return { ...f, c, save };
}

describe("Grounded QA 与内容门禁回归", () => {
  it("有原文证据的重复确认保留原文并记录确认范围，证据随后变化使门禁失效", () => {
    const f = verbatimFixture();
    try {
      const qa = evaluateGroundedTranscriptQa(f.workspace);
      expect(qa.status).toBe("pass");
      expect(qa.anomalies[0]).toMatchObject({ status: "resolved", resolution: "verbatim_confirmed", raw_span_id: "raw_1" });
      expect(qa.evidence_fingerprints[0]).toMatchObject({ correction_id: "corr_1", resolution: "verbatim_confirmed" });
      expect(JSON.parse(readFileSync(join(f.source, "transcript_grounded.json"), "utf8")).spans[0].text).toBe(f.raw.segments[0].text);
      expect(JSON.parse(readFileSync(join(f.source, "transcript_raw.json"), "utf8"))).toEqual(f.raw);
      writeFileSync(join(f.source, "grounded_transcript_qa.json"), JSON.stringify(qa));
      expect(assertCurrentGroundedTranscriptQa(f.workspace).status).toBe("pass");
      writeFileSync(f.evidencePath, "证据后来改变");
      expect(() => assertCurrentGroundedTranscriptQa(f.workspace)).toThrow();
    } finally { rmSync(f.workspace, { recursive: true, force: true }); }
  });
  it.each(["wrong_hash", "wrong_span", "missing_file", "missing_hash", "missing_evidence", "missing_resolution", "wrong_origin", "wrong_text", "changed_text"])("原文确认的 %s 不能放行", (mode) => {
    const f = verbatimFixture();
    try {
      if (mode === "wrong_hash") f.c.evidence[0].sha256 = "b".repeat(64);
      if (mode === "wrong_span") f.c.evidence[0].raw_span_id = "raw_other";
      if (mode === "missing_file") rmSync(f.evidencePath);
      if (mode === "missing_hash") delete f.c.evidence[0].sha256;
      if (mode === "missing_evidence") f.c.evidence = [{ kind: "user_verbatim_excerpt" }];
      if (mode === "missing_resolution") delete f.c.resolution;
      if (mode === "wrong_origin") f.c.evidence[0].origin = "model_generated";
      if (mode === "wrong_text") { writeFileSync(f.evidencePath, "这是另一段用户原文"); f.c.evidence[0].sha256 = createHash("sha256").update(readFileSync(f.evidencePath)).digest("hex"); }
      if (mode === "changed_text") f.c.corrected = "借确认记录改写原文";
      f.save();
      expect(evaluateGroundedTranscriptQa(f.workspace).status).toBe("fail");
    } finally { rmSync(f.workspace, { recursive: true, force: true }); }
  });
  it("纠正解决异常时允许生产层通过，Raw 仍保留异常诊断；Markdown 为原生文本", () => {
    const f = correctedFixture();
    try {
      expect(assertCurrentGroundedTranscriptQa(f.workspace).status).toBe("pass");
      expect(JSON.parse(readFileSync(join(f.source, "transcript_qa.json"), "utf8")).status).not.toBe("pass");
      expect(JSON.parse(readFileSync(join(f.source, "transcript_raw.json"), "utf8"))).toEqual(f.raw);
      const markdown = readFileSync(join(f.source, "transcript_grounded.md"), "utf8");
      expect(markdown).toContain(f.request.corrected); expect(markdown).toContain("\n");
      expect(markdown.startsWith('"')).toBe(false); expect(() => JSON.parse(markdown)).toThrow();
      expect(evaluateGroundedTranscriptQa(f.workspace).anomalies[0].status).toBe("resolved");
    } finally { rmSync(f.workspace, { recursive: true, force: true }); }
  });
  it.each(["missing", "stale", "wrong_audio"])("%s 纠正证据不能放行", (mode) => {
    const f = correctedFixture();
    try {
      if (mode === "missing") rmSync(f.evidencePath);
      else if (mode === "stale") writeFileSync(f.evidencePath, '{}');
      else { const record = JSON.parse(readFileSync(f.evidencePath, "utf8")); record.audio_sha256 = "b".repeat(64); writeFileSync(f.evidencePath, JSON.stringify(record)); }
      expect(evaluateGroundedTranscriptQa(f.workspace).status).toBe("fail");
      expect(() => assertCurrentGroundedTranscriptQa(f.workspace)).toThrow();
    } finally { rmSync(f.workspace, { recursive: true, force: true }); }
  });
  it("仍重复的纠正不因 applied 标签而通过", () => {
    const f = correctedFixture();
    try {
      f.request.corrected = "本".repeat(80); writeFileSync(f.requestPath, JSON.stringify(f.request)); applyCorrectionRequest(f.workspace, f.requestPath);
      expect(evaluateGroundedTranscriptQa(f.workspace).status).toBe("fail");
    } finally { rmSync(f.workspace, { recursive: true, force: true }); }
  });
  it("文本篡改让 QA 哈希失效", () => {
    const f = correctedFixture();
    try {
      const path = join(f.source, "transcript_grounded.json"), g = JSON.parse(readFileSync(path, "utf8")); g.spans[0].text = "未经记账的文本"; writeFileSync(path, JSON.stringify(g));
      expect(() => assertCurrentGroundedTranscriptQa(f.workspace)).toThrow();
    } finally { rmSync(f.workspace, { recursive: true, force: true }); }
  });
  it.each([["inventory", "missing"], ["split", "missing"], ["inventory", "stale"], ["split", "stale"]])("%s 上游QA %s 时拒绝执行并隔离旧通过门禁", (stage, mode) => {
    const f = correctedFixture();
    try {
      if (mode === "missing") rmSync(join(f.source, "grounded_transcript_qa.json"));
      else { const path = join(f.source, "transcript_grounded.json"), value = JSON.parse(readFileSync(path, "utf8")); value.spans[0].text = "未记账变化"; writeFileSync(path, JSON.stringify(value)); }
      const dir = join(f.workspace, "01-understanding"); mkdirSync(dir);
      const name = stage === "inventory" ? "content_review_gate.json" : "content_split_gate.json";
      writeFileSync(join(dir, name), JSON.stringify({ status: "pass" }));
      const run = spawnSync(process.execPath, ["dist/content-gates-cli.js", "--workspace", f.workspace, "--stage", stage], { encoding: "utf8" });
      expect(run.status).toBe(1); expect(run.stderr).toContain("Grounded QA");
      expect(existsSync(join(dir, name))).toBe(false); expect(readdirSync(dir).some(x => x.startsWith(name + ".invalid-"))).toBe(true);
    } finally { rmSync(f.workspace, { recursive: true, force: true }); }
  });
});


describe("进度观察与恢复边界", () => {
  it.each([['transcribing', 0, 'recent_heartbeat'], ['transcribing', 120, 'stale_needs_verification'], ['completed', 120, 'terminal']])("%s %s秒旧观察显示%s", (status, age, expected) => {
    const f = correctedFixture();
    try {
      const dir = join(f.source, "asr-runs"); mkdirSync(dir);
      writeFileSync(join(dir, "test.progress.json"), JSON.stringify({ asr_key: "test", status, updated_at: new Date(Date.now() - Number(age) * 1000).toISOString(), progress_percent: null }));
      const run = spawnSync(process.execPath, ['dist/workflow-cli.js', '--workspace', f.workspace], { encoding: 'utf8' });
      expect(run.status).toBe(0);
      const report = JSON.parse(run.stdout);
      expect(report.latest_asr_observation.observation_state).toBe(expected);
      expect(report.latest_asr_observation.progress_percent).toBeNull();
      expect(report.next_stage).toBe('content_review');
    } finally { rmSync(f.workspace, { recursive: true, force: true }); }
  });
});
