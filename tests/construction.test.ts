import { describe, expect, it } from "vitest";
import { validateArtifact } from "../src/validate.js";
import { materializePageElements, validatePersistedScene, type PageSpec } from "../src/construction.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hash = "a".repeat(64);
const intent = { dominant_gesture: "内容动作", visual_center_of_gravity: "中心对象", scale_contrast: "主体优先", density_rhythm: "疏密有序", directional_energy: "单一主链", asymmetry_balance_intent: "不对称平衡", local_irregularity_allowance: "局部手绘" };
const coverSpec: PageSpec = { page_id: "cover", page_kind: "cover", display_order: 0, grammar: "content_driven_cover", composition_intent: intent, selected_candidate_id: null, semantic_guardrails: [], elements: [] };
const cover = { page_id: "cover", page_kind: "cover" as const, specification: coverSpec };
const shape = (id: string, x: number) => ({ id, type: "rectangle", x, y: 300, width: 100, height: 100, groupIds: ["hero"], boundElements: [] as { id: string; type: string }[] });
const fileFor = (elements: unknown[]) => {
  const path = join(mkdtempSync(join(tmpdir(), "construction-scene-")), "scene.excalidraw");
  writeFileSync(path, JSON.stringify({ type: "excalidraw", version: 2, elements }));
  return path;
};

describe("Sprint 06 native construction", () => {
  it("requires Composition Intent and selected source links without a preview cache", () => {
    const page = { page_id: "p", scene_key: "p.excalidraw", grammar: "spatial_relation", selected_candidate_id: "vca_p", source_mappings: [], semantic_guardrails: [], composition_intent: { dominant_gesture: "a", visual_center_of_gravity: "b", scale_contrast: "c", density_rhythm: "d", directional_energy: "e", asymmetry_balance_intent: "f", local_irregularity_allowance: "g" } };
    const plan = { schema_version: "1.0", kind: "construction_plan", status: "completed", construction_plan_id: "cp_test", input: { selected_visual_plan_sha256: hash, visual_gate_sha256: hash, design_tokens_sha256: hash, construction_spec_sha256: hash }, pages: Array.from({ length: 3 }, (_, i) => ({ ...page, page_id: `p${i}` })), created_at: "2026-09-18T00:00:00.000Z" };
    expect(() => validateArtifact("construction_plan", plan)).not.toThrow();
    delete (plan.pages[0].composition_intent as Record<string, string>).density_rhythm;
    expect(() => validateArtifact("construction_plan", plan)).toThrow();
  });

  it("accepts a native, grouped, reciprocally bound arrow scene", () => {
    const a = shape("a", 100), b = shape("b", 400);
    a.boundElements.push({ id: "edge", type: "arrow" }); b.boundElements.push({ id: "edge", type: "arrow" });
    const arrow = { id: "edge", type: "arrow", x: 200, y: 350, width: 200, height: 0, groupIds: [], startBinding: { elementId: "a" }, endBinding: { elementId: "b" } };
    expect(validatePersistedScene(fileFor([a, b, arrow]), cover).bindings).toBe(2);
    expect(() => validatePersistedScene(fileFor([a, b, { ...arrow, endBinding: { elementId: "missing" } }]), cover)).toThrow(/binding/);
  });

  it("rejects duplicate IDs, page overflow and overlapping text regions", () => {
    const a = shape("a", 100), b = shape("b", 400);
    expect(() => validatePersistedScene(fileFor([a, { ...b, id: "a" }]), cover)).toThrow(/Duplicate/);
    expect(() => validatePersistedScene(fileFor([a, { ...b, x: 1100 }]), cover)).toThrow(/page region/);
    const t = (id: string, x: number) => ({ id, type: "text", x, y: 600, width: 200, height: 30, text: "文字", groupIds: [] });
    expect(() => validatePersistedScene(fileFor([a, b, t("one", 100), t("two", 200)]), cover)).toThrow(/overlap/);
  });

  it("keeps machine evidence separate from Human Construction Review", () => {
    const gate = { schema_version: "1.0", kind: "construction_gate", status: "needs_human_review", construction_plan_sha256: hash, scene_manifest_sha256: hash, checks: [{ name: "human_construction_review", status: "needs_human_review", details: {} }], human_review_required: true };
    expect(() => validateArtifact("construction_gate", gate)).not.toThrow();
  });

  it("materializes a content-driven page without episode-specific identifiers", () => {
    const spec: PageSpec = {
      page_id: "edp_overview_new_episode", page_kind: "overview", display_order: 1,
      grammar: "state_change", composition_intent: intent, selected_candidate_id: "vca_new", semantic_guardrails: [],
      elements: [
        { id: "hero", type: "rectangle", x: 100, y: 300, width: 800, height: 500, role: "hero_root", group_ids: ["hero"] },
        { id: "object", type: "ellipse", x: 160, y: 420, width: 140, height: 140, role: "semantic_object", group_ids: ["hero"], mapping_index: 0, source_ids: ["claim_1"], assertion: "对象发生变化" },
        { id: "label", type: "text", x: 360, y: 430, width: 360, height: 60, role: "key_label", text: "本期内容对象", font_size: 28 },
      ],
    };
    const elements = materializePageElements(spec);
    expect(elements.every((element) => (element.id as string).startsWith("edp_overview_new_episode:"))).toBe(true);
    expect(elements.some((element) => JSON.stringify(element).includes("E248"))).toBe(false);
  });
});
