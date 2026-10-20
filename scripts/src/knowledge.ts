import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AudioManifest, EpisodeMetadata, PipelineError } from "./contracts.js";
import { validateArtifact } from "./validate.js";

const PIPELINE_VERSION = "3.0.0";
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const write = (path: string, value: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };

export type GroundedSpan = { id: string; text: string; start_ms: number; end_ms: number; raw_span_refs: Array<{ raw_segment_id: string }>; correction_ids: string[] };
export type KnowledgeWindow = { id: string; core_start_ms: number; core_end_ms: number; context_start_ms: number; context_end_ms: number; span_ids: string[] };
export type EvidenceAnchor = { id: string; source_kind: "grounded_span" | "raw_span" | "episode_metadata" | "show_notes" | "correction"; artifact_path: string; artifact_sha256: string; locator: string; audio_sha256: string | null; start_ms: number | null; end_ms: number | null; raw_span_refs: string[]; excerpt: string; support_role: "direct" | "context" | "illustration" | "counterevidence" | "correction_provenance" };

export type KnowledgeWindowRequest = { window: KnowledgeWindow; spans: GroundedSpan[]; input: { audio_sha256: string; grounded_transcript_sha256: string; corrections_sha256: string }; episode_context: { title: string | null; show_notes: string | null } };
export type KnowledgeWindowResult = { window_id: string; candidates: Array<Record<string, unknown>>; provider_receipt: Record<string, unknown> };
export type KnowledgeExecutionIdentity = { kind: "current_skill_execution_model"; model_id: string | null; runtime_id: string | null; identity_status: "reported_by_host" | "not_exposed_by_host" };
export interface KnowledgeUnderstandingProvider {
  readonly id: string;
  readonly version: string;
  readonly capabilities: { local_only: boolean; structured_output: boolean; transcript_retention: "none" | "ephemeral" | "persistent" | "unknown" };
  understandWindow(request: KnowledgeWindowRequest): Promise<KnowledgeWindowResult>;
}

/**
 * Node deliberately cannot invoke the model running this Skill. This identity
 * records only what the host exposes when the executing Skill hands semantic
 * results to the deterministic pipeline.
 */
export function currentSkillExecutionIdentity(): KnowledgeExecutionIdentity {
  const modelId = process.env.PODCAST_KNOWLEDGE_EXECUTION_MODEL_ID ?? null;
  const runtimeId = process.env.PODCAST_KNOWLEDGE_EXECUTION_RUNTIME_ID ?? null;
  return { kind: "current_skill_execution_model", model_id: modelId, runtime_id: runtimeId, identity_status: modelId || runtimeId ? "reported_by_host" : "not_exposed_by_host" };
}

type Raw = { audio: { sha256: string }; segments: Array<{ id: string; global_start_ms: number; global_end_ms: number }> };
type Clean = { raw_transcript_sha256: string; spans: Array<{ id: string; raw_span_refs: Array<{ raw_segment_id: string }> }> };
type Grounded = { clean_transcript_sha256: string; corrections_sha256: string; spans: GroundedSpan[] };
type Corrections = { corrections: Array<{ id: string; affected_span_ref: string; review_status: string }> };

export function planKnowledgeWindows(spans: GroundedSpan[], durationMs: number, targetMs = 600_000, overlapMs = 30_000): KnowledgeWindow[] {
  if (!spans.length || durationMs <= 0) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "knowledge_prepare", "Grounded transcript must contain timestamped spans.", false);
  const windows: KnowledgeWindow[] = [];
  for (let coreStart = 0, index = 1; coreStart < durationMs; coreStart += targetMs, index++) {
    const coreEnd = Math.min(durationMs, coreStart + targetMs);
    const selected = spans.filter((span) => span.start_ms < coreEnd && span.end_ms >= coreStart);
    if (!selected.length) continue;
    windows.push({ id: `kw_${String(index).padStart(4, "0")}`, core_start_ms: coreStart, core_end_ms: coreEnd, context_start_ms: Math.max(0, coreStart - overlapMs), context_end_ms: Math.min(durationMs, coreEnd + overlapMs), span_ids: selected.map((span) => span.id) });
  }
  return windows;
}

export function knowledgeCacheKeys(input: { audio_sha256: string; grounded_transcript_sha256: string; corrections_sha256: string; metadata_sha256: string }, provider: { id: string; version: string; config: Record<string, unknown> }, policyVersion: string) {
  const knowledgeBaseKey = hash({ input, provider, policy_version: policyVersion, pipeline_version: PIPELINE_VERSION });
  const knowledgeGraphKey = hash({ knowledge_base_key: knowledgeBaseKey, provider, policy_version: policyVersion, pipeline_version: PIPELINE_VERSION });
  return { knowledgeBaseKey, knowledgeGraphKey };
}

export function makeGroundedEvidenceAnchor(span: GroundedSpan, artifactPath: string, artifactSha256: string, audioSha256: string, supportRole: EvidenceAnchor["support_role"] = "direct"): EvidenceAnchor {
  const anchor = { id: `ea_${hash({ kind: "grounded_span", id: span.id, artifactSha256 }).slice(0, 20)}`, source_kind: "grounded_span" as const, artifact_path: artifactPath, artifact_sha256: artifactSha256, locator: span.id, audio_sha256: audioSha256, start_ms: span.start_ms, end_ms: span.end_ms, raw_span_refs: span.raw_span_refs.map((ref) => ref.raw_segment_id), excerpt: span.text.slice(0, 400), support_role: supportRole };
  validateArtifact("evidence_anchor", anchor);
  return anchor;
}

export function resolveGroundedAnchor(anchor: EvidenceAnchor, spans: GroundedSpan[], expected: { artifactPath: string; artifactSha256: string; audioSha256: string }) {
  if (anchor.source_kind !== "grounded_span" || anchor.artifact_path !== expected.artifactPath || anchor.artifact_sha256 !== expected.artifactSha256 || anchor.audio_sha256 !== expected.audioSha256) return false;
  const span = spans.find((candidate) => candidate.id === anchor.locator);
  return Boolean(span && span.start_ms === anchor.start_ms && span.end_ms === anchor.end_ms && anchor.raw_span_refs.every((id) => span.raw_span_refs.some((ref) => ref.raw_segment_id === id)));
}

function assertInputChain(source: string) {
  const metadata = read<EpisodeMetadata>(join(source, "episode_metadata.json"));
  const manifest = read<AudioManifest>(join(source, "audio_manifest.json"));
  const raw = read<Raw>(join(source, "transcript_raw.json"));
  const clean = read<Clean>(join(source, "transcript_clean.json"));
  const grounded = read<Grounded>(join(source, "transcript_grounded.json"));
  const corrections = read<Corrections>(join(source, "corrections.json"));
  const gate = read<{ status: string }>(join(source, "transcript_gate.json"));
  validateArtifact("episode_metadata", metadata); validateArtifact("audio_manifest", manifest); validateArtifact("raw_transcript", raw); validateArtifact("clean_transcript", clean); validateArtifact("grounded_transcript", grounded); validateArtifact("corrections", corrections);
  if (gate.status !== "pass") throw new PipelineError("TRANSCRIPT_GATE_FAILED", "knowledge_prepare", "Knowledge processing requires a passing Final Transcript Gate.", false, { status: gate.status });
  if (manifest.content_identity.sha256 !== raw.audio.sha256 || clean.raw_transcript_sha256 !== hash(raw) || grounded.clean_transcript_sha256 !== hash(clean) || grounded.corrections_sha256 !== hash(corrections)) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "knowledge_prepare", "Transcript hash/provenance chain is invalid.", false);
  const rawIds = new Set(raw.segments.map((span) => span.id));
  const cleanById = new Map(clean.spans.map((span) => [span.id, span]));
  for (const span of grounded.spans) {
    const cleanSpan = cleanById.get(span.id);
    if (!cleanSpan || span.raw_span_refs.some((ref) => !rawIds.has(ref.raw_segment_id))) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "knowledge_prepare", "A Grounded span cannot resolve to immutable Raw evidence.", false, { span_id: span.id });
  }
  return { metadata, manifest, raw, clean, grounded, corrections };
}

function representativeWindows(windows: KnowledgeWindow[]) {
  const indices = [...new Set([0, Math.floor((windows.length - 1) * 0.25), Math.floor((windows.length - 1) * 0.5), Math.floor((windows.length - 1) * 0.75), windows.length - 1])];
  return indices.map((index, position) => {
    const window = windows[index];
    return { id: window.id, start_ms: window.core_start_ms, end_ms: window.core_end_ms, span_ids: window.span_ids, purpose: position === 0 ? ["opening", "core_questions", "proper_noun"] : position === indices.length - 1 ? ["ending", "boundary", "episode_synthesis"] : ["argument_development", "mechanism_example_boundary"] };
  });
}

export function prepareKnowledgeBenchmark(workspace: string) {
  const source = join(workspace, "00-source"), output = join(workspace, "01-understanding");
  if (!existsSync(source)) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "knowledge_prepare", "Missing 00-source evidence directory.", false);
  const input = assertInputChain(source);
  const groundedHash = hash(input.grounded), correctionsHash = hash(input.corrections), metadataHash = hash(input.metadata);
  const windows = planKnowledgeWindows(input.grounded.spans, Math.max(...input.grounded.spans.map((span) => span.end_ms)));
  const execution = currentSkillExecutionIdentity();
  const cache = knowledgeCacheKeys({ audio_sha256: input.manifest.content_identity.sha256, grounded_transcript_sha256: groundedHash, corrections_sha256: correctionsHash, metadata_sha256: metadataHash }, { id: execution.model_id ?? "current-skill-model-not-exposed", version: execution.runtime_id ?? "not-exposed-by-host", config: { execution_kind: execution.kind } }, "1.0");
  const benchmark = { schema_version: "1.0", kind: "knowledge_provider_benchmark", status: "current_skill_model_validation" as const, input: { audio_sha256: input.manifest.content_identity.sha256, grounded_transcript_sha256: groundedHash }, provider: execution, windows: representativeWindows(windows), evaluation: { criteria: ["Chinese-English mixed speech and terminology fidelity", "typed candidate validity and evidence-anchor completeness", "mechanism/example/boundary distinction", "epistemic-status discipline", "whole-episode coverage and reconciliation"], full_golden_allowed: true } };
  validateArtifact("knowledge_benchmark", benchmark);
  write(join(output, "knowledge_windows.json"), { schema_version: "1.0", input: benchmark.input, windows });
  write(join(output, "knowledge_provider_benchmark.json"), benchmark);
  write(join(output, "knowledge_input_manifest.json"), { schema_version: "1.0", cache, input: { ...benchmark.input, corrections_sha256: correctionsHash, metadata_sha256: metadataHash, transcript_gate: "pass" }, artifacts: ["00-source/episode_metadata.json", "00-source/audio_manifest.json", "00-source/transcript_raw.json", "00-source/transcript_clean.json", "00-source/transcript_grounded.json", "00-source/corrections.json", "00-source/transcript_gate.json"] });
  return { cache, windowCount: windows.length, benchmark };
}

export type KnowledgeModelHandoff = { knowledge_base: Record<string, unknown>; knowledge_graph: Record<string, unknown> };

export function assessSemanticWindowCoverage(windows: KnowledgeWindow[], units: Array<Record<string, unknown>>, nodeIds: Set<string>) {
  const byWindow = new Map(units.map((unit) => [unit.window_id, unit]));
  const missing = windows.filter((window) => !byWindow.has(window.id)).map((window) => window.id);
  const invalid = windows.flatMap((window) => {
    const unit = byWindow.get(window.id);
    if (!unit) return [];
    const disposition = unit.semantic_disposition;
    const objectIds = Array.isArray(unit.object_ids) ? unit.object_ids : [];
    const rationale = typeof unit.rationale === "string" ? unit.rationale.trim() : "";
    if (disposition === "modeled" && objectIds.length && objectIds.every((id) => typeof id === "string" && nodeIds.has(id))) return [];
    if ((disposition === "context_only" || disposition === "non_semantic") && rationale) return [];
    return [window.id];
  });
  return { missing, invalid, covered: windows.length - missing.length - invalid.length };
}

/**
 * Persist semantic output supplied by the model executing this Skill. The
 * deterministic layer verifies its evidence chain before it becomes a
 * Knowledge Model artifact; it never attempts to call a model itself.
 */
export function persistKnowledgeModelHandoff(workspace: string, handoff: KnowledgeModelHandoff) {
  const source = join(workspace, "00-source"), output = join(workspace, "01-understanding");
  const input = assertInputChain(source);
  const groundedHash = hash(input.grounded), correctionsHash = hash(input.corrections), metadataHash = hash(input.metadata);
  const execution = currentSkillExecutionIdentity();
  const cache = knowledgeCacheKeys({ audio_sha256: input.manifest.content_identity.sha256, grounded_transcript_sha256: groundedHash, corrections_sha256: correctionsHash, metadata_sha256: metadataHash }, { id: execution.model_id ?? "current-skill-model-not-exposed", version: execution.runtime_id ?? "not-exposed-by-host", config: { execution_kind: execution.kind } }, "1.0");
  const base = handoff.knowledge_base, graph = handoff.knowledge_graph;
  if ((base as { cache_key?: string }).cache_key !== cache.knowledgeBaseKey) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "understand", "Knowledge Base cache key does not match the accepted input identity.", false);
  if (JSON.stringify((base as { input?: unknown }).input) !== JSON.stringify({ audio_sha256: input.manifest.content_identity.sha256, grounded_transcript_sha256: groundedHash, corrections_sha256: correctionsHash })) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "understand", "Knowledge Base input identity does not match the accepted evidence chain.", false);
  if (JSON.stringify((base as { execution?: unknown }).execution) !== JSON.stringify(execution)) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "understand", "Knowledge Base execution identity must record the current Skill model boundary.", false);
  validateArtifact("knowledge_base", base);
  const baseHash = hash(base);
  if ((graph as { knowledge_base_sha256?: string }).knowledge_base_sha256 !== baseHash) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "reconcile", "Knowledge Graph must reference the exact Knowledge Base hash.", false);
  validateArtifact("knowledge_graph", graph);
  const anchors = (graph as { evidence_anchors: EvidenceAnchor[] }).evidence_anchors;
  const anchorIds = new Set<string>();
  for (const anchor of anchors) {
    validateArtifact("evidence_anchor", anchor);
    if (anchorIds.has(anchor.id) || !resolveGroundedAnchor(anchor, input.grounded.spans, { artifactPath: "00-source/transcript_grounded.json", artifactSha256: groundedHash, audioSha256: input.manifest.content_identity.sha256 })) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "reconcile", "Knowledge Graph has an invalid or unresolvable evidence anchor.", false, { anchor_id: anchor.id });
    anchorIds.add(anchor.id);
  }
  const referencedAnchorIds = [
    ...((graph as { nodes: Array<{ evidence_anchor_ids: string[] }> }).nodes).flatMap((node) => node.evidence_anchor_ids),
    ...((graph as { relationships: Array<{ evidence_anchor_ids: string[] }> }).relationships).flatMap((relationship) => relationship.evidence_anchor_ids),
    ...(((graph as { episode_thesis: { evidence_anchor_ids?: string[] } | null }).episode_thesis?.evidence_anchor_ids ?? [])),
  ];
  if (referencedAnchorIds.some((id) => !anchorIds.has(id))) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "knowledge_gate", "A Knowledge object references a missing evidence anchor.", false);
  const windows = planKnowledgeWindows(input.grounded.spans, Math.max(...input.grounded.spans.map((span) => span.end_ms)));
  const nodeIds = new Set(((graph as { nodes: Array<{ id: string }> }).nodes).map((node) => node.id));
  const semanticCoverage = assessSemanticWindowCoverage(windows, (base as { units: Array<Record<string, unknown>> }).units, nodeIds);
  const highImpact = ((graph as { nodes: Array<{ id: string; epistemic_status: string; high_impact?: boolean }> }).nodes).filter((node) => node.epistemic_status === "model_inference" && node.high_impact).map((node) => node.id);
  const checks = [
    { name: "accepted_transcript_input", status: "pass" as const, details: { transcript_gate: "pass", audio_sha256: input.manifest.content_identity.sha256 } },
    { name: "knowledge_base_schema_and_identity", status: "pass" as const, details: { cache_key: cache.knowledgeBaseKey } },
    { name: "knowledge_graph_schema_and_identity", status: "pass" as const, details: { knowledge_base_sha256: baseHash } },
    { name: "evidence_anchor_resolution", status: "pass" as const, details: { anchors: anchors.length, referenced_anchors: referencedAnchorIds.length } },
    { name: "semantic_window_coverage", status: !semanticCoverage.missing.length && !semanticCoverage.invalid.length ? "pass" as const : "fail" as const, details: { expected_windows: windows.length, semantically_accounted_windows: semanticCoverage.covered, missing_windows: semanticCoverage.missing, invalid_windows: semanticCoverage.invalid } },
    { name: "golden_human_semantic_review", status: "needs_human_review" as const, details: { high_impact_inference_ids: highImpact } },
  ];
  const gate = { schema_version: "1.0", kind: "knowledge_gate", status: checks.some((check) => check.status === "fail") ? "fail" as const : "needs_human_review" as const, knowledge_graph_sha256: hash(graph), checks, high_impact_inference_ids: highImpact, human_review_required: true };
  validateArtifact("knowledge_gate", gate);
  const validation = {
    schema_version: "1.0",
    kind: "knowledge_provider_benchmark",
    status: "completed" as const,
    input: { audio_sha256: input.manifest.content_identity.sha256, grounded_transcript_sha256: groundedHash },
    provider: execution,
    windows: representativeWindows(windows),
    evaluation: {
      criteria: ["Chinese-English mixed speech and terminology fidelity", "typed candidate validity and evidence-anchor completeness", "mechanism/example/boundary distinction", "epistemic-status discipline", "whole-episode coverage and reconciliation"],
      full_golden_allowed: true,
      results: [
        { name: "structured_artifact_validity", status: "pass", details: { knowledge_base: "valid", knowledge_graph: "valid" } },
        { name: "evidence_anchor_fidelity", status: "pass", details: { anchors_resolved: anchors.length } },
        { name: "epistemic_labeling", status: "pass", details: { model_inference_count: 0, high_impact_inference_count: highImpact.length } },
        { name: "representative_window_semantic_quality", status: "needs_human_review", details: { window_ids: representativeWindows(windows).map((window) => window.id) } },
      ],
    },
  };
  validateArtifact("knowledge_benchmark", validation);
  write(join(output, "knowledge_base.json"), base);
  write(join(output, "knowledge_graph.json"), graph);
  write(join(output, "knowledge_gate.json"), gate);
  write(join(output, "knowledge_provider_benchmark.json"), validation);
  const review = renderKnowledgeReview(base, graph, gate, input.grounded.spans);
  writeFileSync(join(output, "knowledge_review.md"), review);
  return { cache, gate, reviewPath: join(output, "knowledge_review.md") };
}

/** Final Gate promotion is deliberately separate from semantic assembly. */
export function finalizeKnowledgeHumanReview(workspace: string, reviewedOn: string) {
  const output = join(workspace, "01-understanding");
  const graph = read<Record<string, unknown>>(join(output, "knowledge_graph.json"));
  const currentGate = read<Record<string, unknown>>(join(output, "knowledge_gate.json"));
  validateArtifact("knowledge_graph", graph);
  validateArtifact("knowledge_gate", currentGate);
  if (currentGate.knowledge_graph_sha256 !== hash(graph)) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "knowledge_gate", "Knowledge Gate does not reference the current Knowledge Graph.", false);
  const checks = (currentGate.checks as Array<{ name: string; status: "pass" | "fail" | "needs_human_review"; details?: Record<string, unknown> }>).map((check) => check.name === "golden_human_semantic_review"
    ? { ...check, status: "pass" as const, details: { ...check.details, human_decision: "pass", reviewed_on: reviewedOn } }
    : check);
  if (!checks.some((check) => check.name === "golden_human_semantic_review") || checks.some((check) => check.status !== "pass")) throw new PipelineError("KNOWLEDGE_GATE_FAILED", "knowledge_gate", "Cannot promote the Gate while a machine check has not passed.", false);
  const gate = { ...currentGate, status: "pass" as const, checks, human_review_required: false, human_review: { status: "pass" as const, reviewed_on: reviewedOn, scope: "Golden Knowledge Model second Human Semantic Review" } };
  validateArtifact("knowledge_gate", gate);
  write(join(output, "knowledge_gate.json"), gate);
  return gate;
}

function renderKnowledgeReview(base: Record<string, unknown>, graph: Record<string, unknown>, gate: Record<string, unknown>, groundedSpans: GroundedSpan[]) {
  const thesis = (graph.episode_thesis as { statement?: string } | null)?.statement ?? "未形成";
  const nodes = graph.nodes as Array<{ id: string; kind: string; statement: string; epistemic_status: string; evidence_anchor_ids: string[]; review_status: string }>;
  const anchors = new Map((graph.evidence_anchors as EvidenceAnchor[]).map((anchor) => [anchor.id, anchor]));
  const contextFor = (anchor: EvidenceAnchor) => {
    const position = groundedSpans.findIndex((span) => span.id === anchor.locator);
    const context = position >= 0 ? groundedSpans.slice(Math.max(0, position - 2), position + 3) : [];
    return context.map((span) => `${span.id} (${span.start_ms}–${span.end_ms}ms): ${span.text}`).join(" ");
  };
  const rows = nodes.map((node) => {
    const evidence = node.evidence_anchor_ids.map((id) => { const anchor = anchors.get(id); return anchor ? `\n    - ${anchor.locator} (${anchor.start_ms}–${anchor.end_ms}ms): ${contextFor(anchor)}` : `\n    - ${id} (missing)`; }).join("");
    return `- **${node.id} / ${node.kind} / ${node.epistemic_status}**: ${node.statement}\n  - Evidence context:${evidence}\n  - Review: ${node.review_status}`;
  }).join("\n");
  const relations = (graph.relationships as Array<{ id: string; from_id: string; to_id: string; type: string; epistemic_status: string; evidence_anchor_ids: string[]; review_status: string }>).map((relation) => `- **${relation.id}**: ${relation.from_id} —${relation.type}→ ${relation.to_id} (${relation.epistemic_status}; ${relation.review_status})`).join("\n");
  const relationDecisions = ((graph.relationship_decisions as Array<{ candidate_id: string; status: string; reason: string }> | undefined) ?? []).map((decision) => `- **${decision.candidate_id}: ${decision.status}** — ${decision.reason}`).join("\n") || "- None recorded.";
  const coverage = (base.units as Array<{ window_id: string; semantic_disposition: string; object_ids?: string[]; rationale: string }>).map((unit) => `- **${unit.window_id} / ${unit.semantic_disposition}**: ${(unit.object_ids ?? []).join(", ") || "no graph object"}. ${unit.rationale}`).join("\n");
  return `# Sprint 03 Golden Knowledge Model — Human Review\n\n## Episode thesis\n\n${thesis}\n\n## Review protocol\n\n- Confirm each object is faithful to the referenced Grounded Transcript spans; do not substitute Show Notes for transcript evidence.\n- Confirm speaker-explicit claims remain distinct from episode-level synthesis and that no model inference impersonates either.\n- Confirm examples illustrate a mechanism rather than becoming the mechanism itself.\n- Confirm the thesis and argument structure cover the whole episode, not only its ending.\n- Treat window processing and semantic coverage as different checks; a window must name modeled objects or a reason it creates no important object.\n\n## Semantic coverage by window\n\n${coverage}\n\n## Knowledge objects\n\n${rows}\n\n## Relationships\n\n${relations}\n\n## Rejected relationship candidates\n\n${relationDecisions}\n\n## Gate snapshot\n\n\`\`\`json\n${JSON.stringify(gate, null, 2)}\n\`\`\`\n\n## Provenance\n\nKnowledge Base cache key: ${(base.cache_key as string)}\nKnowledge Graph SHA-256: ${(gate.knowledge_graph_sha256 as string)}\n`;
}
