import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { AudioManifest, EpisodeMetadata, PipelineError } from "./contracts.js";
import { validateArtifact } from "./validate.js";
import { evaluateGroundedTranscriptQa } from "./grounded-transcript-qa.js";
import { JsonLogger } from "./logger.js";

const PIPELINE_VERSION = "2.0.0";
const MODEL = "mlx-community/whisper-large-v3-turbo";
const PROVIDER = { id: "mlx-whisper-local", model: MODEL, config: { language: "zh", word_timestamps: true, condition_on_previous_text: false } };
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const now = () => new Date().toISOString();
function write(path: string, value: unknown) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
function writeMarkdown(path: string, text: string) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text + "\n", "utf8"); }
function writeAtomic(path: string, value: unknown) { mkdirSync(dirname(path), { recursive: true }); const temp = `${path}.${process.pid}.tmp`; writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`); renameSync(temp, path); }

export type SegmentPlan = { id: string; context_start_ms: number; context_end_ms: number; core_start_ms: number; core_end_ms: number; flags: string[] };
type Checkpoint = { status: "running" | "completed" | "failed"; asr_key: string; audio: { sha256: string; relative_path: string }; provider: typeof PROVIDER; segment: SegmentPlan; result?: { segments: Array<Record<string, unknown>>; resource?: Record<string, unknown> } } & Record<string, unknown>;
type ProcessResult = { code: number | null; signal: NodeJS.Signals | null; stderr: string; spawnError?: string };
export type AsrExecutionStrategy = "direct" | "segmented" | "auto";
export type TranscriptRunOptions = { batchSize?: number; strategy?: AsrExecutionStrategy; environment?: "stable" | "bounded"; requireSegmentResume?: boolean; executeProvider?: (requestPath: string, checkpointDir: string, progressPath: string) => Promise<ProcessResult> };

function providerProcess(pythonPath: string, requestPath: string, checkpointDir: string, progressPath: string): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(pythonPath, [join("workers", "mlx_whisper_provider.py"), "transcribe", "--request", requestPath, "--checkpoint-dir", checkpointDir, "--progress-path", progressPath], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "", pending = ""; child.stderr.on("data", (data) => {
      stderr += data; pending += data.toString();
      const lines = pending.split("\n"); pending = lines.pop() ?? "";
      for (const line of lines) { try { if (JSON.parse(line).event === "asr.progress") process.stderr.write(line + "\n"); } catch { /* decoder/model diagnostic retained in stderr */ } }
    });
    child.on("error", (error) => resolve({ code: null, signal: null, stderr, spawnError: error.message }));
    child.on("close", (code, signal) => resolve({ code, signal, stderr }));
  });
}

function directProviderProcess(pythonPath: string, requestPath: string, outputPath: string, progressPath: string): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(pythonPath, [join("workers", "mlx_whisper_provider.py"), "direct", "--request", requestPath, "--output", outputPath, "--progress-path", progressPath], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "", pending = ""; child.stderr.on("data", (data) => {
      stderr += data; pending += data.toString();
      const lines = pending.split("\n"); pending = lines.pop() ?? "";
      for (const line of lines) { try { if (JSON.parse(line).event === "asr.progress") process.stderr.write(line + "\n"); } catch { /* decoder/model diagnostic retained in stderr */ } }
    });
    child.on("error", (error) => resolve({ code: null, signal: null, stderr, spawnError: error.message }));
    child.on("close", (code, signal) => resolve({ code, signal, stderr }));
  });
}

export function selectExecutionStrategy(requested: AsrExecutionStrategy = "auto", environment: "stable" | "bounded" = "stable", requireSegmentResume = false): { strategy: "direct" | "segmented"; reason: string } {
  if (requested === "direct") return { strategy: "direct", reason: "user_explicit_direct" };
  if (requested === "segmented") return { strategy: "segmented", reason: "user_explicit_segmented" };
  if (environment === "stable" && !requireSegmentResume) return { strategy: "direct", reason: "auto_verified_direct_provider_stable_environment" };
  return { strategy: "segmented", reason: requireSegmentResume ? "auto_segment_resume_required" : "auto_bounded_execution_environment" };
}

export function buildSegments(durationMs: number): SegmentPlan[] {
  const target = 30_000, overlap = 2_000, segments: SegmentPlan[] = [];
  for (let coreStart = 0, index = 1; coreStart < durationMs; coreStart += target, index++) {
    const coreEnd = Math.min(durationMs, coreStart + target);
    segments.push({ id: `seg_${String(index).padStart(4, "0")}`, context_start_ms: Math.max(0, coreStart - overlap), context_end_ms: Math.min(durationMs, coreEnd + overlap), core_start_ms: coreStart, core_end_ms: coreEnd, flags: ["fixed_boundary_no_vad"] });
  }
  return segments;
}

export function checkpointPath(checkpointDir: string, segmentId: string) { return join(checkpointDir, `${segmentId}.json`); }
function checkpointIdentityMatches(checkpoint: Checkpoint, expected: { asrKey: string; audio: AudioManifest; segment: SegmentPlan }) {
  return checkpoint.asr_key === expected.asrKey && checkpoint.audio.sha256 === expected.audio.content_identity.sha256 && checkpoint.audio.relative_path === expected.audio.asset.relative_path && checkpoint.provider.id === PROVIDER.id && checkpoint.provider.model === PROVIDER.model && JSON.stringify(checkpoint.provider.config) === JSON.stringify(PROVIDER.config) && JSON.stringify(checkpoint.segment) === JSON.stringify(expected.segment);
}
export function readValidCheckpoints(checkpointDir: string, asrKey: string, manifest: AudioManifest, segments: SegmentPlan[]) {
  const completed = new Map<string, Checkpoint>(), invalid: string[] = [], failed: string[] = [];
  for (const segment of segments) {
    const path = checkpointPath(checkpointDir, segment.id);
    if (!existsSync(path)) continue;
    try {
      const checkpoint = read<Checkpoint>(path); validateArtifact("asr_checkpoint", checkpoint);
      if (checkpointIdentityMatches(checkpoint, { asrKey, audio: manifest, segment }) && checkpoint.status === "completed" && Array.isArray(checkpoint.result?.segments)) completed.set(segment.id, checkpoint);
      else if (checkpointIdentityMatches(checkpoint, { asrKey, audio: manifest, segment }) && checkpoint.status === "failed") failed.push(segment.id);
      else { renameSync(path, `${path}.corrupt-${Date.now()}`); invalid.push(segment.id); }
    } catch {
      try { renameSync(path, `${path}.corrupt-${Date.now()}`); } catch { /* preserve the original read error as invalid state */ }
      invalid.push(segment.id);
    }
  }
  return { completed, invalid, failed };
}

function updateRunState(path: string, asrKey: string, total: number, completed: number, failed: number, currentSegmentId: string | null, status: "running" | "partial" | "completed" | "interrupted" | "failed", details?: Record<string, unknown>) {
  const state = { schema_version: "1.0", asr_key: asrKey, status, updated_at: now(), current_segment_id: currentSegmentId, last_completed_segment_id: completed ? `seg_${String(completed).padStart(4, "0")}` : null, total_segments: total, completed_segments: completed, failed_segments: failed, pending_segments: total - completed, heartbeat: { actor: "orchestrator", observed_at: now() }, ...(details ? { last_error: details } : {}) };
  validateArtifact("asr_run_state", state); writeAtomic(path, state); return state;
}

function markdown(spans: Array<{ start_ms: number; text: string }>) { const stamp = (ms: number) => new Date(ms).toISOString().slice(11, 19); return spans.map((span) => `[${stamp(span.start_ms)}] ${span.text}`).join("\n"); }
function normalized(text: string) { return text.replace(/\s+/g, "").replace(/[，。！？,.!?]/g, "").toLowerCase(); }
export function evaluateTranscriptQa(raw: Record<string, unknown>, metadata: EpisodeMetadata, durationMs: number) {
  const rawSegments = raw.segments as Array<{ text: string; global_start_ms: number; global_end_ms: number; metrics?: { compression_ratio?: number; no_speech_prob?: number } }>;
  const lastEnd = rawSegments.at(-1)?.global_end_ms ?? 0;
  const monotonic = rawSegments.every((s, i) => i === 0 || s.global_start_ms >= rawSegments[i - 1].global_start_ms);
  const abnormal = rawSegments.filter((segment) => !segment.text.trim() || (segment.metrics?.compression_ratio ?? 0) > 2.4);
  const tailPass = lastEnd >= durationMs - 60_000;
  const recoverable = abnormal.length > 0 && abnormal.length <= 3 && abnormal.length / Math.max(rawSegments.length, 1) <= 0.005;
  const status = monotonic && tailPass ? (abnormal.length === 0 ? "human_review_required" : recoverable ? "needs_grounding" : "fail") : "fail";
  return { schema_version: "1.0", status, checks: [{ name: "timestamp_monotonicity", status: monotonic ? "pass" : "fail" }, { name: "tail_coverage", status: tailPass ? "pass" : "fail", last_end_ms: lastEnd }, { name: "abnormal_asr_segments", status: abnormal.length === 0 ? "pass" : "fail", count: abnormal.length, spans: abnormal.slice(0, 20).map((segment) => ({ start_ms: segment.global_start_ms, end_ms: segment.global_end_ms, compression_ratio: segment.metrics?.compression_ratio ?? null, text_preview: segment.text.slice(0, 100) })) }], warnings: ["speaker identity unavailable; labels remain null", "corrections require human evidence review"], high_risk_candidates: (metadata.episode.show_notes ?? "").replace(/<[^>]+>/g, " ").match(/\b[A-Za-z][A-Za-z0-9 ]{1,30}\b/g)?.filter((candidate) => !/^(span|strong|href|data|url|image|img|https|net)$/i.test(candidate)).slice(0, 100) ?? [] };
}
function writeTranscriptQa(source: string, raw: Record<string, unknown>, metadata: EpisodeMetadata, durationMs: number) { const qa = evaluateTranscriptQa(raw, metadata, durationMs); validateArtifact("transcript_qa", qa); write(join(source, "transcript_qa.json"), qa); return qa; }
export function reconcileSegments(checkpoints: Checkpoint[]) {
  const ordered = checkpoints.flatMap((checkpoint) => checkpoint.result?.segments ?? []).sort((a, b) => Number(a.global_start_ms) - Number(b.global_start_ms));
  const output: Array<Record<string, unknown>> = [];
  for (const item of ordered) {
    const previous = output.at(-1);
    const duplicate = previous && normalized(String(previous.text)) === normalized(String(item.text)) && Number(item.global_start_ms) <= Number(previous.global_end_ms);
    if (!duplicate) output.push(item);
  }
  return output;
}

async function ensurePreflight(workspace: string, pythonPath: string, metadata: EpisodeMetadata, manifest: AudioManifest, logger: JsonLogger) {
  const source = join(workspace, "00-source"), audioPath = join(workspace, manifest.asset.relative_path), preflightPath = join(source, "audio_preflight.json");
  if (!existsSync(audioPath)) throw new PipelineError("AUDIO_PRECHECK_FAILED", "preflight", "Cached audio asset is missing.", false);
  if (existsSync(preflightPath)) return read<Record<string, unknown>>(preflightPath);
  const result = await new Promise<{ code: number | null; output: string; error: string }>((resolve) => { const child = spawn(pythonPath, [join("workers", "mlx_whisper_provider.py"), "probe", "--audio", audioPath]); let output = "", error = ""; child.stdout.on("data", d => output += d); child.stderr.on("data", d => error += d); child.on("close", code => resolve({ code, output, error })); });
  if (result.code !== 0) throw new PipelineError("AUDIO_PRECHECK_FAILED", "preflight", "Local decoder preflight failed.", false, { stderr: result.error });
  const preflight = { schema_version: "1.0", audio_sha256: manifest.content_identity.sha256, ...JSON.parse(result.output) };
  const delta = Math.abs(Number(preflight.duration_ms) - Math.round((metadata.episode.duration_seconds ?? 0) * 1000));
  if (metadata.episode.duration_seconds && delta > Math.max(120_000, Number(preflight.duration_ms) * 0.05)) throw new PipelineError("AUDIO_PRECHECK_FAILED", "preflight", "Audio duration materially differs from metadata.", false, { delta_ms: delta });
  if (Number((preflight.silence as { ratio: number }).ratio) > 0.995) throw new PipelineError("AUDIO_NO_SPEECH", "preflight", "Audio is effectively silent.", false);
  validateArtifact("audio_preflight", preflight); write(preflightPath, preflight); logger.info("audio.preflight_completed", { duration_ms: preflight.duration_ms }); return preflight;
}

function writeDownstream(source: string, raw: Record<string, unknown>, metadata: EpisodeMetadata, durationMs: number) {
  process.stderr.write(`${JSON.stringify({ event: "transcript.qa", status: "checking", asr_key: raw.cache_key })}\n`);
  const rawHash = hash(raw), cleanPath = join(source, "transcript_clean.json"), rawSegments = raw.segments as Array<{ id: string; text: string; global_start_ms: number; global_end_ms: number }>;
  const clean = { schema_version: "1.0", kind: "clean", raw_transcript_sha256: rawHash, rules_version: "1.0", spans: rawSegments.map((s, i) => ({ id: `clean_${String(i + 1).padStart(5, "0")}`, text: s.text.replace(/\s+/g, " ").trim(), start_ms: s.global_start_ms, end_ms: s.global_end_ms, raw_span_refs: [{ raw_segment_id: s.id, raw_char_start: 0, raw_char_end: s.text.length }] })) };
  validateArtifact("clean_transcript", clean); write(cleanPath, clean); writeMarkdown(join(source, "transcript_clean.md"), markdown(clean.spans));
  const correctionsPath = join(source, "corrections.json");
  const corrections = existsSync(correctionsPath) ? read<{ schema_version: "1.0"; policy_version: string; corrections: Array<{ id: string; affected_span_ref: string; original: string; corrected: string; review_status: string }> }>(correctionsPath) : { schema_version: "1.0" as const, policy_version: "1.0", corrections: [] };
  validateArtifact("corrections", corrections); write(correctionsPath, corrections);
  const rawById = new Map(rawSegments.map((segment) => [segment.id, segment]));
  const applied = new Map<string, { id: string; corrected: string }>();
  for (const correction of corrections.corrections) {
    if (correction.review_status !== "applied") continue;
    const rawSpan = rawById.get(correction.affected_span_ref);
    if (!rawSpan || rawSpan.text !== correction.original) throw new PipelineError("CACHE_CORRUPT", "ground", "Applied correction does not match its immutable Raw span.", false, { correction_id: correction.id, affected_span_ref: correction.affected_span_ref });
    applied.set(correction.affected_span_ref, { id: correction.id, corrected: correction.corrected });
  }
  const grounded = { schema_version: "1.0", kind: "grounded", clean_transcript_sha256: hash(clean), corrections_sha256: hash(corrections), spans: clean.spans.map((span) => {
    const correction = span.raw_span_refs.length === 1 ? applied.get(span.raw_span_refs[0].raw_segment_id) : undefined;
    return correction ? { ...span, text: correction.corrected, correction_ids: [correction.id] } : { ...span, correction_ids: [] };
  }) };
  validateArtifact("grounded_transcript", grounded); write(join(source, "transcript_grounded.json"), grounded); writeMarkdown(join(source, "transcript_grounded.md"), markdown(grounded.spans));
  const rawQa = writeTranscriptQa(source, raw, metadata, durationMs);
  const productionQa = evaluateGroundedTranscriptQa(dirname(source)); write(join(source, "grounded_transcript_qa.json"), productionQa);
  process.stderr.write(`${JSON.stringify({ event: "transcript.qa", status: "completed", raw_status: rawQa.status, grounded_status: productionQa.status })}\n`);
  return { ...rawQa, grounded_status: productionQa.status };
}

export function applyCorrectionRequest(workspace: string, requestPath: string) {
  const source = join(workspace, "00-source"), raw = read<Record<string, unknown>>(join(source, "transcript_raw.json")), metadata = read<EpisodeMetadata>(join(source, "episode_metadata.json")), preflight = read<{ duration_ms: number }>(join(source, "audio_preflight.json"));
  validateArtifact("raw_transcript", raw);
  const request = read<{ id: string; affected_span_ref: string; corrected: string; reason: string; evidence: unknown[]; confidence: number; review_status: "applied" | "suggested" | "rejected" }>(requestPath);
  const rawSpan = (raw.segments as Array<{ id: string; text: string }>).find((segment) => segment.id === request.affected_span_ref);
  if (!rawSpan) throw new PipelineError("CACHE_CORRUPT", "ground", "Correction request refers to an unknown Raw span.", false, { affected_span_ref: request.affected_span_ref });
  const correctionsPath = join(source, "corrections.json");
  const store = existsSync(correctionsPath) ? read<{ schema_version: "1.0"; policy_version: string; corrections: Array<Record<string, unknown>> }>(correctionsPath) : { schema_version: "1.0" as const, policy_version: "1.0", corrections: [] };
  const record = { ...request, original: rawSpan.text };
  store.corrections = [...store.corrections.filter((correction) => correction.id !== request.id), record];
  validateArtifact("corrections", store); write(correctionsPath, store);
  return writeDownstream(source, raw, metadata, Number(preflight.duration_ms));
}

async function runDirect(workspace: string, pythonPath: string, metadata: EpisodeMetadata, manifest: AudioManifest, durationMs: number, asrKey: string, selectionReason: string, logger: JsonLogger) {
  const source = join(workspace, "00-source"), rawPath = join(source, "transcript_raw.json"), directDir = join(source, "asr-direct"), receiptPath = join(directDir, `${asrKey}.json`), requestPath = join(directDir, `${asrKey}.request.json`), progressPath = join(source, "asr-runs", `${asrKey}.progress.json`), runStatePath = join(source, "asr-runs", `${asrKey}.json`);
  if (existsSync(rawPath) && read<Record<string, unknown>>(rawPath).cache_key === asrKey) { const raw = read<Record<string, unknown>>(rawPath); validateArtifact("raw_transcript", raw); logger.info("transcript.raw_cache_hit", { asr_key: asrKey, strategy: "direct" }); return { status: "completed" as const, raw, qa: writeDownstream(source, raw, metadata, durationMs) }; }
  updateRunState(runStatePath, asrKey, 1, 0, 0, "direct_0001", "running");
  if (!existsSync(receiptPath)) {
    writeAtomic(requestPath, { audio_path: join(workspace, manifest.asset.relative_path), model: MODEL, initial_prompt: metadata.episode.show_notes?.slice(0, 2000) ?? undefined, source_identity: metadata.source_identity, audio: { sha256: manifest.content_identity.sha256, relative_path: manifest.asset.relative_path }, provider: PROVIDER, asr_key: asrKey });
    const result = await directProviderProcess(pythonPath, requestPath, receiptPath, progressPath);
    if (result.spawnError) throw new PipelineError("ASR_PROCESS_ERROR", "transcribe", "Could not start local MLX direct provider process.", true, { spawn_error: result.spawnError });
    if (result.signal) throw new PipelineError("ASR_EXECUTION_INTERRUPTED", "transcribe", "Local direct provider execution was interrupted externally; no segmented fallback was selected.", true, { signal: result.signal });
    if (result.code !== 0) throw new PipelineError("ASR_PROCESS_ERROR", "transcribe", "Local direct provider exited without a receipt.", true, { exit_code: result.code, stderr: result.stderr });
  }
  const receipt = read<Record<string, unknown>>(receiptPath); validateArtifact("asr_direct_receipt", receipt);
  if (receipt.asr_key !== asrKey || (receipt.audio as { sha256: string }).sha256 !== manifest.content_identity.sha256) throw new PipelineError("CACHE_CORRUPT", "cache", "Direct ASR receipt identity did not match the requested audio.", false);
  const raw = { schema_version: "1.0", kind: "raw", pipeline_version: PIPELINE_VERSION, cache_key: asrKey, audio: { sha256: manifest.content_identity.sha256, relative_path: manifest.asset.relative_path, duration_ms: durationMs }, provider: { ...PROVIDER, runtime_version: "mlx-whisper local", capabilities: { direct_execution: true, segment_timestamps: true, word_timestamps: true, segment_confidence: true, word_confidence: true, speaker_clusters: false, speaker_identity: false } }, execution: { strategy: "direct", receipt_path: join("00-source", "asr-direct", `${asrKey}.json`), selection_reason: selectionReason }, segments: (receipt.result as { segments: Array<Record<string, unknown>> }).segments };
  validateArtifact("raw_transcript", raw); writeAtomic(rawPath, raw); const qa = writeDownstream(source, raw, metadata, durationMs); updateRunState(runStatePath, asrKey, 1, 1, 0, null, "completed"); logger.info("transcript.raw_completed", { segments: raw.segments.length, asr_key: asrKey, strategy: "direct" }); write(join(source, "intake.log.json"), logger.events); return { status: "completed" as const, raw, qa };
}

export async function runTranscript(workspace: string, pythonPath: string, logger = new JsonLogger(), options: TranscriptRunOptions = {}) {
  const source = join(workspace, "00-source"), metadata = read<EpisodeMetadata>(join(source, "episode_metadata.json")), manifest = read<AudioManifest>(join(source, "audio_manifest.json"));
  validateArtifact("episode_metadata", metadata); validateArtifact("audio_manifest", manifest);
  const preflight = await ensurePreflight(workspace, pythonPath, metadata, manifest, logger), durationMs = Number(preflight.duration_ms);
  const selection = selectExecutionStrategy(options.strategy, options.environment, options.requireSegmentResume);
  if (selection.strategy === "direct") {
    const asrKey = hash({ audio: manifest.content_identity.sha256, provider: PROVIDER, execution_strategy: "direct", pipeline: PIPELINE_VERSION });
    return { preflight, ...(await runDirect(workspace, pythonPath, metadata, manifest, durationMs, asrKey, selection.reason, logger)) };
  }
  const segmentManifest = { schema_version: "1.0", audio_sha256: manifest.content_identity.sha256, duration_ms: durationMs, strategy: { target_ms: 30_000, overlap_ms: 2_000, vad: "not_available_fixed_boundary", calibration: "30-second core avoids the observed 6-minute local MLX resource termination" }, segments: buildSegments(durationMs) };
  validateArtifact("segment_manifest", segmentManifest); write(join(source, "segments.json"), segmentManifest);
  const asrKey = hash({ audio: manifest.content_identity.sha256, provider: PROVIDER, execution_strategy: "segmented", segments: hash(segmentManifest), pipeline: PIPELINE_VERSION });
  const rawPath = join(source, "transcript_raw.json");
  if (existsSync(rawPath) && read<Record<string, unknown>>(rawPath).cache_key === asrKey) { const raw = read<Record<string, unknown>>(rawPath); validateArtifact("raw_transcript", raw); logger.info("transcript.raw_cache_hit", { asr_key: asrKey }); return { status: "completed" as const, preflight, segmentManifest, raw, qa: writeDownstream(source, raw, metadata, durationMs) }; }
  const checkpointDir = join(source, "asr-checkpoints", asrKey), runStatePath = join(source, "asr-runs", `${asrKey}.json`), progressPath = join(source, "asr-runs", `${asrKey}.progress.json`);
  const initial = readValidCheckpoints(checkpointDir, asrKey, manifest, segmentManifest.segments);
  const pending = segmentManifest.segments.filter((segment) => !initial.completed.has(segment.id));
  if (pending.length) {
    const batch = pending.slice(0, Math.max(1, options.batchSize ?? 1));
    let recoveryDetails: Record<string, unknown> | undefined;
    if (existsSync(runStatePath)) {
      try {
        const previous = read<{ status?: string; current_segment_id?: string | null; updated_at?: string }>(runStatePath);
        if (previous.status === "running") recoveryDetails = { kind: "external_or_unobserved_interruption", previous_current_segment_id: previous.current_segment_id ?? null, previous_updated_at: previous.updated_at ?? null, message: "A previous orchestrator run ended without a final process receipt; checkpoint scan is authoritative for resume." };
      } catch { recoveryDetails = { kind: "run_state_corrupt", message: "Previous run-state could not be read; checkpoint scan is authoritative for resume." }; }
    }
    updateRunState(runStatePath, asrKey, segmentManifest.segments.length, initial.completed.size, initial.failed.length, batch[0].id, "running", recoveryDetails);
    const requestPath = join(source, ".asr-request.json");
    writeAtomic(requestPath, { audio_path: join(workspace, manifest.asset.relative_path), model: MODEL, initial_prompt: metadata.episode.show_notes?.slice(0, 2000) ?? undefined, source_identity: metadata.source_identity, audio: { sha256: manifest.content_identity.sha256, relative_path: manifest.asset.relative_path }, provider: PROVIDER, asr_key: asrKey, run_state: { path: runStatePath, total_segments: segmentManifest.segments.length, initial_completed_segments: initial.completed.size }, segments: batch });
    const result = await (options.executeProvider ? options.executeProvider(requestPath, checkpointDir, progressPath) : providerProcess(pythonPath, requestPath, checkpointDir, progressPath));
    const after = readValidCheckpoints(checkpointDir, asrKey, manifest, segmentManifest.segments);
    const state = result.signal ? "interrupted" : after.failed.length ? "failed" : "partial";
    updateRunState(runStatePath, asrKey, segmentManifest.segments.length, after.completed.size, after.failed.length, null, state, result.code === 0 ? undefined : { code: result.code, signal: result.signal, stderr: result.stderr, spawn_error: result.spawnError });
    if (result.spawnError) throw new PipelineError("ASR_PROCESS_ERROR", "transcribe", "Could not start local MLX provider process.", true, { spawn_error: result.spawnError });
    if (result.signal) throw new PipelineError("ASR_EXECUTION_INTERRUPTED", "transcribe", "Local provider execution was interrupted externally; completed checkpoints were retained.", true, { signal: result.signal, completed_segments: after.completed.size });
    if (after.failed.length) throw new PipelineError("ASR_SEGMENT_FAILED", "transcribe", "One or more local ASR segments failed; valid completed checkpoints were retained.", true, { failed_segment_ids: after.failed, stderr: result.stderr });
    if (result.code !== 0) throw new PipelineError("ASR_PROCESS_ERROR", "transcribe", "Local provider exited without a completed checkpoint.", true, { exit_code: result.code, stderr: result.stderr, completed_segments: after.completed.size });
    logger.info("transcript.asr_batch_completed", { asr_key: asrKey, completed_segments: after.completed.size, total_segments: segmentManifest.segments.length, batch_segment_ids: batch.map(s => s.id) });
  }
  const final = readValidCheckpoints(checkpointDir, asrKey, manifest, segmentManifest.segments);
  if (final.completed.size !== segmentManifest.segments.length) { updateRunState(runStatePath, asrKey, segmentManifest.segments.length, final.completed.size, final.failed.length, null, "partial"); write(join(source, "intake.log.json"), logger.events); return { status: "partial" as const, preflight, segmentManifest, completedSegments: final.completed.size, totalSegments: segmentManifest.segments.length }; }
  const rawSegments = reconcileSegments(segmentManifest.segments.map(segment => final.completed.get(segment.id)!));
  const raw = { schema_version: "1.0", kind: "raw", pipeline_version: PIPELINE_VERSION, cache_key: asrKey, audio: { sha256: manifest.content_identity.sha256, relative_path: manifest.asset.relative_path, duration_ms: durationMs }, provider: { ...PROVIDER, runtime_version: "mlx-whisper local", capabilities: { direct_execution: true, segment_timestamps: true, word_timestamps: true, segment_confidence: true, word_confidence: true, speaker_clusters: false, speaker_identity: false } }, execution: { strategy: "segmented", selection_reason: selection.reason }, assembly: { checkpoint_count: final.completed.size, reconciliation: "ownership-interval filtering plus normalized overlap deduplication", completed_at: now() }, segments: rawSegments };
  validateArtifact("raw_transcript", raw); writeAtomic(rawPath, raw); const qa = writeDownstream(source, raw, metadata, durationMs); updateRunState(runStatePath, asrKey, segmentManifest.segments.length, final.completed.size, 0, null, "completed"); logger.info("transcript.raw_completed", { segments: rawSegments.length, asr_key: asrKey }); write(join(source, "intake.log.json"), logger.events); return { status: "completed" as const, preflight, segmentManifest, raw, qa };
}
