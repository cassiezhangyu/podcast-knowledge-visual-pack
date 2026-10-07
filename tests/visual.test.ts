import { describe, expect, it } from "vitest";
import { validateArtifact } from "../src/validate.js";
import { candidateModelFingerprint, candidateModelsMateriallyDistinct, visualCandidateCacheKey, visualPolicy, visualSelectionCacheKey } from "../src/visual.js";

const identity = { kind: "current_skill_execution_model", model_id: null, runtime_id: null, identity_status: "not_exposed_by_host" };
const input = { editorial_plan_sha256: "a".repeat(64), coverage_matrix_sha256: "b".repeat(64), editorial_gate_sha256: "c".repeat(64), knowledge_graph_sha256: "d".repeat(64), audio_sha256: "e".repeat(64) };
const sourceHashes = { taste_sha256: "f".repeat(64), visual_rules_sha256: "a".repeat(64), design_gates_sha256: "b".repeat(64) };
const model = (operation: string, structure: string, vocabulary: string) => ({ visual_argument: { reader_operation: operation, visual_semantic_mappings: [{ vocabulary, source_kind: "knowledge_object", source_ids: ["clm_01"] }] }, hero_hypothesis: { structure_kind: structure } });

describe("Sprint 05 visual reasoning contracts", () => {
  it("makes candidate cache identity deterministic and taste-policy sensitive", () => {
    const base = visualPolicy();
    expect(visualCandidateCacheKey(input, base, identity, sourceHashes)).toBe(visualCandidateCacheKey(input, base, identity, sourceHashes));
    expect(visualCandidateCacheKey(input, base, identity, sourceHashes)).not.toBe(visualCandidateCacheKey(input, visualPolicy({ taste_version: "2.0" }), identity, sourceHashes));
    expect(visualCandidateCacheKey(input, base, identity, sourceHashes)).not.toBe(visualCandidateCacheKey(input, visualPolicy({ mode_specific_taste_exposure_policy_version: "2.0" }), identity, sourceHashes));
  });

  it("isolates Pass B cache from the frozen Pass-A inventory", () => {
    const selectionInput = { editorial_plan_sha256: input.editorial_plan_sha256, editorial_gate_sha256: input.editorial_gate_sha256, knowledge_graph_sha256: input.knowledge_graph_sha256 };
    expect(visualSelectionCacheKey("1".repeat(64), selectionInput, identity)).not.toBe(visualSelectionCacheKey("2".repeat(64), selectionInput, identity));
  });

  it("distinguishes explanatory-model fingerprints rather than visual style", () => {
    expect(candidateModelFingerprint(model("trace", "continuous_action", "ACTION"))).not.toBe(candidateModelFingerprint(model("compare", "comparison_or_selection", "SPACE")));
    expect(candidateModelFingerprint(model("trace", "continuous_action", "ACTION"))).toBe(candidateModelFingerprint(model("trace", "continuous_action", "ACTION")));
  });

  it("requires two semantic dimensions before modes count as materially different", () => {
    const first = model("trace", "continuous_action", "ACTION");
    expect(candidateModelsMateriallyDistinct(first, model("trace", "state_transformation", "ACTION"))).toBe(false);
    expect(candidateModelsMateriallyDistinct(first, model("compare", "comparison_or_selection", "SPACE"))).toBe(true);
  });

  it("rejects incomplete candidate artifacts before semantic processing", () => {
    expect(() => validateArtifact("visual_candidates", { kind: "visual_candidates" })).toThrow(/visual_candidates failed schema validation/);
  });

  it("rejects incomplete selected-plan artifacts before Pass B can be accepted", () => {
    expect(() => validateArtifact("selected_visual_plan", { kind: "selected_visual_plan" })).toThrow(/selected_visual_plan failed schema validation/);
  });
});
