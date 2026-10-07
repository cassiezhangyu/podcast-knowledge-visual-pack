import { describe, expect, it } from "vitest";
import { validateArtifact } from "../src/validate.js";

const hash = "a".repeat(64);
const intent = { dominant_gesture: "a", visual_center_of_gravity: "b", scale_contrast: "c", density_rhythm: "d", directional_energy: "e", asymmetry_balance_intent: "f", local_irregularity_allowance: "g" };

describe("generalized pipeline contracts", () => {
  it("accepts a non-E248 content-driven construction specification", () => {
    const page = (page_id: string, page_kind: "cover" | "overview", display_order: number) => ({ page_id, page_kind, display_order, grammar: "content_specific", composition_intent: intent, selected_candidate_id: page_kind === "cover" ? null : "vca_new", semantic_guardrails: [], elements: [{ id: "hero", type: "rectangle", x: 80, y: 280, width: 800, height: 500, role: "hero_root" }], ...(page_kind === "cover" ? { brand_asset: { relative_path: "00-source/album.png", sha256: hash, x: 980, y: 80, width: 120, height: 120 } } : {}) });
    const value = { schema_version: "1.0", kind: "construction_spec", status: "completed", input: { episode_metadata_sha256: hash, editorial_plan_sha256: hash, selected_visual_plan_sha256: hash, visual_gate_sha256: hash, design_tokens_sha256: hash }, pages: [page("cover", "cover", 0), page("edp_overview_new", "overview", 1)] };
    expect(() => validateArtifact("construction_spec", value)).not.toThrow();
  });

  it("rejects a vector or arbitrary cover brand asset", () => {
    const cover = { page_id: "cover", page_kind: "cover", display_order: 0, grammar: "content_specific", composition_intent: intent, selected_candidate_id: null, semantic_guardrails: [], elements: [{ id: "hero", type: "rectangle", x: 80, y: 280, width: 800, height: 500, role: "hero_root" }], brand_asset: { relative_path: "00-source/album.svg", sha256: hash, x: 980, y: 80, width: 120, height: 120 } };
    const overview = { page_id: "overview", page_kind: "overview", display_order: 1, grammar: "content_specific", composition_intent: intent, selected_candidate_id: "vca_new", semantic_guardrails: [], elements: [{ id: "hero", type: "rectangle", x: 80, y: 280, width: 800, height: 500, role: "hero_root" }] };
    const value = { schema_version: "1.0", kind: "construction_spec", status: "completed", input: { episode_metadata_sha256: hash, editorial_plan_sha256: hash, selected_visual_plan_sha256: hash, visual_gate_sha256: hash, design_tokens_sha256: hash }, pages: [cover, overview] };
    expect(() => validateArtifact("construction_spec", value)).toThrow();
  });

  it("requires explicit human approval hashes", () => {
    const value = { schema_version: "1.0", kind: "human_approval", stage: "content_review", status: "accepted", artifact_hashes: { episode_content_inventory: hash }, reviewed_by: "user", reviewed_at: "2026-09-22T00:00:00.000Z", note: "通过" };
    expect(() => validateArtifact("human_approval", value)).not.toThrow();
    (value.artifact_hashes as Record<string, string>).episode_content_inventory = "stale";
    expect(() => validateArtifact("human_approval", value)).toThrow();
  });

  it("binds both user-facing content documents into their gates", () => {
    const reviewGate = { schema_version: "1.0", kind: "content_review_gate", status: "pass", episode_content_inventory_sha256: hash, content_review_document_sha256: hash, grounded_transcript_sha256: hash, checks: [{ name: "human_content_review", status: "pass", details: {} }], human_review_required: false, human_review: { approval_sha256: hash } };
    expect(() => validateArtifact("content_review_gate", reviewGate)).not.toThrow();
    delete (reviewGate as Record<string, unknown>).content_review_document_sha256;
    expect(() => validateArtifact("content_review_gate", reviewGate)).toThrow();
    const splitGate = { schema_version: "1.0", kind: "content_split_gate", status: "pass", episode_content_inventory_sha256: hash, content_split_sha256: hash, content_split_coverage_sha256: hash, content_split_document_sha256: hash, checks: [{ name: "human_content_split_review", status: "pass", details: {} }], human_review_required: false, human_review: { approval_sha256: hash } };
    expect(() => validateArtifact("content_split_gate", splitGate)).not.toThrow();
    delete (splitGate as Record<string, unknown>).content_split_document_sha256;
    expect(() => validateArtifact("content_split_gate", splitGate)).toThrow();
  });

  it("keeps rendered pages pending until independent and user review", () => {
    const gate = { schema_version: "1.0", kind: "render_gate", status: "needs_human_review", render_manifest_sha256: hash, checks: [{ name: "independent_visual_review", status: "needs_human_review", details: {} }], human_review_required: true, independent_review_required: true };
    expect(() => validateArtifact("render_gate", gate)).not.toThrow();
  });

  it("requires isolated review to bind each current PNG", () => {
    const review = { schema_version: "1.0", kind: "independent_visual_review", status: "completed", render_manifest_sha256: hash, reviewer_context: "isolated_read_only", reviewer_context_id: "independent-agent", pages: [{ page_id: "cover", png_sha256: hash, review_packet_sha256: hash, verdict: "TARGET", findings: [] }], reviewed_at: "2026-09-22T00:00:00.000Z" };
    expect(() => validateArtifact("independent_visual_review", review)).not.toThrow();
  });

  it("requires Humanizer and fidelity evidence for public copy", () => {
    const record = { schema_version: "1.0", kind: "public_copy_record", status: "completed", content_split_human_approval_sha256: hash, draft_sha256: hash, final_sha256: hash, humanizer: { status: "completed", scope: "expression_only" }, ai_trace_review: "pass", fidelity_regression: "pass" };
    expect(() => validateArtifact("public_copy_record", record)).not.toThrow();
  });
});
