import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve, join } from "node:path";
import { PipelineError } from "./contracts.js";
import { validateArtifact } from "./validate.js";

type R = Record<string, any>;
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const fileHash = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const repetitive = (text: string) => /(.{1,12})\1{5,}/u.test(text.replace(/\s+/g, ""));
const files = ["transcript_raw", "transcript_clean", "transcript_grounded", "corrections", "audio_manifest", "audio_preflight", "episode_metadata"];

/** Technical integrity only. Applied corrections still require semantic evidence review. */
export function evaluateGroundedTranscriptQa(workspace: string) {
  const source = join(workspace, "00-source"), data: R = {}, input: Record<string, string> = {};
  for (const name of files) {
    const p = join(source, `${name}.json`);
    if (!existsSync(p)) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "transcript_gate", `缺少转写输入：${name}`, false);
    data[name] = JSON.parse(readFileSync(p, "utf8")); input[name] = hash(data[name]);
  }
  for (const [name, schema] of [["transcript_raw", "raw_transcript"], ["transcript_clean", "clean_transcript"], ["transcript_grounded", "grounded_transcript"], ["corrections", "corrections"], ["audio_manifest", "audio_manifest"], ["audio_preflight", "audio_preflight"], ["episode_metadata", "episode_metadata"]] as const) validateArtifact(schema, data[name]);
  const raw = data.transcript_raw, clean = data.transcript_clean, grounded = data.transcript_grounded, corrections: R[] = data.corrections.corrections;
  const audioSha = data.audio_manifest.content_identity.sha256, duration = data.audio_preflight.duration_ms;
  const errors: string[] = [], warnings = ["本QA检查证据完整性及生产文本异常，不替代语义审阅、说话人确认或完整音频人工听证。"], fingerprints: R[] = [];
  if (!data.audio_preflight.decode_ok || raw.audio.relative_path !== data.audio_manifest.asset.relative_path) errors.push("音频预检失败或资产路径不一致");
  if (raw.audio.sha256 !== audioSha || data.audio_preflight.audio_sha256 !== audioSha || raw.audio.duration_ms !== duration) errors.push("音频身份或时长不一致");
  if (clean.raw_transcript_sha256 !== input.transcript_raw || grounded.clean_transcript_sha256 !== input.transcript_clean || grounded.corrections_sha256 !== input.corrections) errors.push("生产层输入哈希过时");
  const byRaw = new Map<string, R>(raw.segments.map((s: R) => [s.id, s])), byCorrection = new Map<string, R>();
  if (byRaw.size !== raw.segments.length || new Set(clean.spans.map((s: R) => s.id)).size !== clean.spans.length) errors.push("重复的转写段ID");
  if (hash(data.audio_manifest.source_identity) !== hash(data.episode_metadata.source_identity)) errors.push("节目来源身份不一致");
  for (const c of corrections) {
    if (byCorrection.has(c.id)) errors.push(`重复纠正ID：${c.id}`);
    byCorrection.set(c.id, c);
    const original = byRaw.get(c.affected_span_ref);
    if (!original || original.text !== c.original) errors.push(`纠正不对应原段：${c.id}`);
  }
  function verbatimConfirmed(c: R, segment: R): boolean {
    if (c.resolution !== "verbatim_confirmed" || c.review_status !== "applied" || !c.reason?.trim() || !segment.text.trim() || c.original !== segment.text || c.corrected !== segment.text) return false;
    const root = realpathSync(workspace);
    for (const e of c.evidence) {
      if (e?.kind !== "user_verbatim_excerpt" || e.origin !== "user_attachment" || e.raw_span_id !== segment.id || typeof e.path !== "string" || !/^[a-f0-9]{64}$/.test(e.sha256 ?? "")) continue;
      const path = resolve(workspace, e.path);
      if (!existsSync(path) || !realpathSync(path).startsWith(root + "/")) continue;
      const bytes = readFileSync(path), sha = createHash("sha256").update(bytes).digest("hex");
      if (sha !== e.sha256 || !bytes.toString("utf8").includes(segment.text)) continue;
      fingerprints.push({ correction_id: c.id, path: e.path, sha256: sha, resolution: "verbatim_confirmed" });
      return true;
    }
    return false;
  }
  function evidenceValid(c: R, segment: R, audioRequired: boolean): boolean {
    let valid = false, audioValid = false;
    for (const e of c.evidence) {
      if (!e || typeof e !== "object") continue;
      if (e.kind === "raw_context_spelling_review" && e.locator === segment.id) { valid = true; fingerprints.push({ correction_id: c.id, locator: e.locator, sha256: input.transcript_raw }); }
      const relative = e.path ?? e.artifact_path;
      if (typeof relative !== "string") continue;
      const p = resolve(workspace, relative), root = resolve(workspace);
      if (!p.startsWith(root + "/") || !existsSync(p)) continue;
      const sha = fileHash(p); fingerprints.push({ correction_id: c.id, path: relative, sha256: sha });
      if (e.sha256 && e.sha256 !== sha) continue;
      let record: R; try { record = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
      const sameAudio = record.audio_sha256 === audioSha;
      if (e.kind === "same_model_audio_recheck" && sameAudio && record.start_seconds * 1000 <= segment.global_start_ms && record.end_seconds * 1000 >= segment.global_end_ms && Array.isArray(record.segments) && record.segments.some((s: R) => s.text?.trim() && !repetitive(s.text))) { valid = true; audioValid = true; }
      if (e.kind === "episode_show_notes" && hash(record) === input.episode_metadata) valid = true;
      if (e.kind === "audio_relisten" && sameAudio && record.start_ms <= segment.global_start_ms && record.end_ms >= segment.global_end_ms && record.reviewed_by && record.review_status === "reviewed") { valid = true; audioValid = true; }
    }
    return valid && (!audioRequired || audioValid);
  }
  if (clean.spans.length !== raw.segments.length || grounded.spans.length !== clean.spans.length) errors.push("生产层覆盖数量变化");
  const anomalies: R[] = [];
  for (let i = 0; i < raw.segments.length; i++) {
    const s = raw.segments[i], cl = clean.spans[i], g = grounded.spans[i];
    if (!cl || !g) continue;
    if (cl.raw_span_refs.length !== 1 || cl.raw_span_refs[0].raw_segment_id !== s.id || g.id !== cl.id || g.start_ms !== s.global_start_ms || g.end_ms !== s.global_end_ms || g.raw_span_refs?.[0]?.raw_segment_id !== s.id || g.raw_span_refs.length !== 1) errors.push(`生产段映射错误：${s.id}`);
    if (cl.start_ms !== s.global_start_ms || cl.end_ms !== s.global_end_ms || cl.raw_span_refs[0]?.raw_char_start !== 0 || cl.raw_span_refs[0]?.raw_char_end !== s.text.length || hash(g.raw_span_refs) !== hash(cl.raw_span_refs)) errors.push(`证据范围映射错误：${s.id}`);
    const ids: string[] = g.correction_ids ?? [];
    const applied = corrections.filter(c => c.affected_span_ref === s.id && c.review_status === "applied");
    if (applied.length > 1) errors.push(`同一原段多条applied纠正：${s.id}`);
    if (ids.length !== applied.length || ids.some(id => !applied.some(c => c.id === id))) errors.push(`纠正映射不一致：${s.id}`);
    const expected = applied.length === 1 ? applied[0].corrected : s.text.replace(/\s+/g, " ").trim();
    if (g.text !== expected || cl.text !== s.text.replace(/\s+/g, " ").trim()) errors.push(`文本有未记账更改：${s.id}`);
    const abnormal = !s.text.trim() || (s.metrics?.compression_ratio ?? 0) > 2.4 || repetitive(s.text);
    const verbatim = applied.length === 1 && verbatimConfirmed(applied[0], s);
    let valid = true;
    for (const c of applied) if (!c.reason?.trim() || (!verbatim && !evidenceValid(c, s, abnormal))) { errors.push(`纠正证据无效：${c.id}`); valid = false; }
    const badProduction = !g.text?.trim() || (repetitive(g.text) && !verbatim);
    if (badProduction) errors.push(`生产文本空白或仍重复：${s.id}`);
    if (abnormal) {
      const resolved = applied.length === 1 && valid && !badProduction && (g.text !== s.text || verbatim);
      anomalies.push({ raw_span_id: s.id, start_ms: s.global_start_ms, end_ms: s.global_end_ms, status: resolved ? "resolved" : "unresolved", ...(verbatim ? { resolution: "verbatim_confirmed" } : {}), correction_ids: ids });
      if (!resolved) errors.push(`原始异常未解决：${s.id}`);
    }
    if (s.global_start_ms < 0 || s.global_end_ms < s.global_start_ms || s.global_end_ms > duration || (i && s.global_start_ms < raw.segments[i - 1].global_start_ms)) errors.push(`时间戳错误：${s.id}`);
    if (i && s.global_start_ms - raw.segments[i - 1].global_end_ms > 10_000) warnings.push(`语音间隔待结合音频理解：${raw.segments[i - 1].id}–${s.id}`);
  }
  if (!raw.segments.length || (raw.segments.at(-1)?.global_end_ms ?? 0) < duration - 60_000) errors.push("尾部覆盖不足");
  const qa = { schema_version: "1.0", kind: "grounded_transcript_qa", status: errors.length ? "fail" : "pass", input_hashes: input, audio_sha256: audioSha, evidence_fingerprints: fingerprints, anomalies, errors: [...new Set(errors)], warnings, checks: [{ name: "production_integrity_and_correction_evidence", status: errors.length ? "fail" : "pass" }] };
  validateArtifact("grounded_transcript_qa", qa); return qa;
}

export function assertCurrentGroundedTranscriptQa(workspace: string) {
  const p = join(workspace, "00-source", "grounded_transcript_qa.json");
  if (!existsSync(p)) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "transcript_gate", "缺少Grounded QA；请从转写缓存重建派生产物。", false);
  const stored = JSON.parse(readFileSync(p, "utf8")); validateArtifact("grounded_transcript_qa", stored);
  const current = evaluateGroundedTranscriptQa(workspace);
  if (stored.status !== "pass" || current.status !== "pass" || hash(stored) !== hash(current)) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "transcript_gate", "Grounded QA未通过或已过时；内容阶段不能放行。", false, { errors: current.errors });
  return stored;
}
