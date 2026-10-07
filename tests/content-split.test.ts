import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assessContentSplit, type ContentSplit, type ContentSplitCoverage } from "../src/content-split.js";
import type { EpisodeContentInventory } from "../src/content-inventory.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const audio = "a".repeat(64), grounded = "b".repeat(64), corrections = "c".repeat(64);

const fixture = () => {
  const inventory = {
    schema_version: "2.0", kind: "episode_content_inventory", status: "completed",
    input: { audio_sha256: audio, grounded_transcript_sha256: grounded, corrections_sha256: corrections },
    evidence_anchors: [{ id: "ea_1", source_kind: "grounded_span", artifact_path: "00-source/transcript_grounded.json", artifact_sha256: grounded, locator: "clean_00001", audio_sha256: audio, start_ms: 0, end_ms: 1000, raw_span_refs: ["raw_1"], excerpt: "观点", support_role: "direct" }],
    coverage_segments: [{ id: "seg_1", start_span_id: "clean_00001", end_span_id: "clean_00001", disposition: "semantic", content_unit_ids: ["cu_1"], rationale: "正文" }],
    content_units: [{ id: "cu_1", title: "观点", summary: "这是一个长度足够的完整内容摘要，用于验证拆分。", importance: "core", content_types: ["claim"], speaker_refs: ["UNKNOWN"], evidence_anchor_ids: ["ea_1"], claims: ["观点"], mechanisms: [], supporting_details: [{ id: "det_001", kind: "support", statement: "证据", importance: "core", evidence_anchor_ids: ["ea_1"] }], examples: [], concrete_objects: [], actions: [], conditions: [], boundaries: [], counterpoints: [], uncertainties: [] }],
  } as unknown as EpisodeContentInventory;
  const split = {
    schema_version: "1.0", kind: "content_split", status: "completed", episode_content_inventory_sha256: hash(inventory),
    overall_question: "这期节目在讲什么？", thesis: "这是一个长度足够的节目主命题，用于验证内容拆分没有遗漏。", thesis_boundaries: ["不外推"], structure_rationale: "这是一个长度足够的拆分理由，用于验证模块之间的逻辑关系。",
    module_order: ["mod_1"], modules: [{ id: "mod_1", title: "模块", thread: "main_argument", role: "解释观点", question: "为什么？", conclusion: "这是一个长度足够的模块结论，用于验证论证路径。", relationship_to_previous: "起点", source_unit_ids: ["cu_1"], required_detail_ids: ["det_001"], logic_steps: [{ order: 1, function: "claim", statement: "提出观点", source_unit_ids: ["cu_1"], detail_ids: ["det_001"] }, { order: 2, function: "evidence", statement: "提供证据", source_unit_ids: ["cu_1"], detail_ids: ["det_001"] }], supporting_cases: [], boundaries: ["不外推"], open_questions: [] }],
  } as unknown as ContentSplit;
  const coverage = {
    schema_version: "1.0", kind: "content_split_coverage", status: "completed", episode_content_inventory_sha256: hash(inventory), content_split_sha256: hash(split),
    unit_dispositions: [{ source_id: "cu_1", destination: "module", module_ids: ["mod_1"], role: "核心观点", rationale: "进入模块" }],
    detail_dispositions: [{ source_id: "det_001", module_ids: ["mod_1"], role: "evidence", rationale: "支撑观点" }],
  } as unknown as ContentSplitCoverage;
  return { inventory, split, coverage };
};

describe("Content Split Review Gate", () => {
  it("accepts a complete content disposition", () => {
    const { inventory, split, coverage } = fixture();
    expect(assessContentSplit(inventory, split, coverage).pass).toBe(true);
  });

  it("rejects a silently omitted detail", () => {
    const { inventory, split, coverage } = fixture();
    coverage.detail_dispositions = [];
    expect(() => assessContentSplit(inventory, split, coverage)).toThrow();
  });

  it("rejects a module that cites a nonexistent source detail", () => {
    const { inventory, split, coverage } = fixture();
    split.modules[0].required_detail_ids.push("det_missing");
    const result = assessContentSplit(inventory, split, coverage);
    expect(result.pass).toBe(false);
    expect(result.invalidModuleReferences).toContain("mod_1:det_missing");
  });
});
