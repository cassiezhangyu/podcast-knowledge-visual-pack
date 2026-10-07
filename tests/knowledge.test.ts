import { describe, expect, it } from "vitest";
import { assessSemanticWindowCoverage, currentSkillExecutionIdentity, knowledgeCacheKeys, makeGroundedEvidenceAnchor, planKnowledgeWindows, resolveGroundedAnchor, type GroundedSpan, type KnowledgeUnderstandingProvider } from "../src/knowledge.js";
import { validateArtifact } from "../src/validate.js";

const audio = "a".repeat(64), groundedHash = "b".repeat(64), correctionsHash = "c".repeat(64), metadataHash = "d".repeat(64);
const spans: GroundedSpan[] = [
  { id: "clean_00001", text: "开场证据", start_ms: 0, end_ms: 10_000, raw_span_refs: [{ raw_segment_id: "raw_00001" }], correction_ids: [] },
  { id: "clean_00002", text: "中段机制", start_ms: 610_000, end_ms: 620_000, raw_span_refs: [{ raw_segment_id: "raw_00002" }], correction_ids: [] },
  { id: "clean_00003", text: "结尾边界", start_ms: 1_210_000, end_ms: 1_220_000, raw_span_refs: [{ raw_segment_id: "raw_00003" }], correction_ids: ["corr_1"] },
];

describe("Sprint 03 provider-neutral infrastructure", () => {
  it("plans deterministic timestamp windows without visual inputs", () => {
    const first = planKnowledgeWindows(spans, 1_250_000, 600_000, 30_000);
    expect(first).toEqual(planKnowledgeWindows(spans, 1_250_000, 600_000, 30_000));
    expect(first.map((window) => window.id)).toEqual(["kw_0001", "kw_0002", "kw_0003"]);
    expect(first[1].span_ids).toEqual(["clean_00002"]);
  });

  it("separates cache identities when evidence or policy changes", () => {
    const provider = { id: "candidate", version: "1", config: { temperature: 0 } };
    const first = knowledgeCacheKeys({ audio_sha256: audio, grounded_transcript_sha256: groundedHash, corrections_sha256: correctionsHash, metadata_sha256: metadataHash }, provider, "1.0");
    const changed = knowledgeCacheKeys({ audio_sha256: audio, grounded_transcript_sha256: groundedHash, corrections_sha256: "e".repeat(64), metadata_sha256: metadataHash }, provider, "1.0");
    expect(first.knowledgeBaseKey).not.toBe(changed.knowledgeBaseKey);
    expect(first.knowledgeGraphKey).not.toBe(changed.knowledgeGraphKey);
  });

  it("creates and resolves hash-linked grounded evidence anchors", () => {
    const anchor = makeGroundedEvidenceAnchor(spans[2], "00-source/transcript_grounded.json", groundedHash, audio, "correction_provenance");
    expect(resolveGroundedAnchor(anchor, spans, { artifactPath: "00-source/transcript_grounded.json", artifactSha256: groundedHash, audioSha256: audio })).toBe(true);
    expect(resolveGroundedAnchor({ ...anchor, audio_sha256: "f".repeat(64) }, spans, { artifactPath: "00-source/transcript_grounded.json", artifactSha256: groundedHash, audioSha256: audio })).toBe(false);
  });

  it("validates a labeled model inference without allowing it to impersonate a speaker claim", () => {
    const graph = { schema_version: "1.0", kind: "knowledge_graph", status: "completed", knowledge_base_sha256: "1".repeat(64), episode_thesis: null, core_questions: [], evidence_anchors: [{ id: "ea_123" }], nodes: [{ id: "clm_01", kind: "claim", statement: "模型推断", epistemic_status: "model_inference", speaker_ref: null, evidence_anchor_ids: ["ea_123"], inference_basis: ["ea_123"], confidence: "low", uncertainty: "需要人工复核", review_status: "needs_human_review", high_impact: true }], relationships: [], coverage_audit: { bands: [{ id: "start" }], unit_dispositions: [] } };
    expect(() => validateArtifact("knowledge_graph", graph)).not.toThrow();
  });

  it("keeps the provider contract provider-neutral", () => {
    const provider: KnowledgeUnderstandingProvider = { id: "test-local", version: "0", capabilities: { local_only: true, structured_output: true, transcript_retention: "none" }, understandWindow: async (request) => ({ window_id: request.window.id, candidates: [], provider_receipt: {} }) };
    expect(provider.capabilities.local_only).toBe(true);
  });

  it("records unavailable current-Skill identity instead of inventing a model name", () => {
    const identity = currentSkillExecutionIdentity();
    expect(identity.kind).toBe("current_skill_execution_model");
    if (identity.identity_status === "not_exposed_by_host") expect(identity.model_id).toBeNull();
  });

  it("accepts a Knowledge Gate that leaves semantic review explicitly pending", () => {
    const gate = { schema_version: "1.0", kind: "knowledge_gate", status: "needs_human_review", knowledge_graph_sha256: "1".repeat(64), checks: [{ name: "evidence_anchor_resolution", status: "pass", details: { anchors: 1 } }, { name: "golden_human_semantic_review", status: "needs_human_review", details: {} }], high_impact_inference_ids: [], human_review_required: true };
    expect(() => validateArtifact("knowledge_gate", gate)).not.toThrow();
  });

  it("does not equate processed windows with semantic coverage", () => {
    const windows = planKnowledgeWindows(spans, 1_250_000, 600_000, 30_000);
    const result = assessSemanticWindowCoverage(windows, [
      { window_id: "kw_0001", semantic_disposition: "modeled", object_ids: ["clm_01"], rationale: "核心机制" },
      { window_id: "kw_0002", semantic_disposition: "context_only", rationale: "只有背景重复，没有独立对象" },
      { window_id: "kw_0003", semantic_disposition: "modeled", object_ids: [], rationale: "" },
    ], new Set(["clm_01"]));
    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual(["kw_0003"]);
  });
});
