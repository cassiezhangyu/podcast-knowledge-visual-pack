import { describe, expect, it } from "vitest";
import { assessEpisodeContentInventory, type EpisodeContentInventory } from "../src/content-inventory.js";
import type { GroundedSpan } from "../src/knowledge.js";
import { createHash } from "node:crypto";

const spans: GroundedSpan[] = [
  { id: "clean_00001", text: "观点", start_ms: 0, end_ms: 1000, raw_span_refs: [{ raw_segment_id: "raw_1" }], correction_ids: [] },
  { id: "clean_00002", text: "案例", start_ms: 1000, end_ms: 2000, raw_span_refs: [{ raw_segment_id: "raw_2" }], correction_ids: [] },
];
const grounded = { spans };
const groundedHash = createHash("sha256").update(JSON.stringify(grounded)).digest("hex");
const audio = "a".repeat(64);
const anchor = (id: string, locator: string, start: number, end: number) => ({ id, source_kind: "grounded_span" as const, artifact_path: "00-source/transcript_grounded.json" as const, artifact_sha256: groundedHash, locator, audio_sha256: audio, start_ms: start, end_ms: end, raw_span_refs: [locator === "clean_00001" ? "raw_1" : "raw_2"], excerpt: locator === "clean_00001" ? "观点" : "案例", support_role: "direct" as const });

const valid = (): EpisodeContentInventory => ({
  schema_version: "2.0", kind: "episode_content_inventory", status: "completed",
  input: { audio_sha256: audio, grounded_transcript_sha256: groundedHash, corrections_sha256: "b".repeat(64) },
  evidence_anchors: [anchor("ea_1", "clean_00001", 0, 1000), anchor("ea_2", "clean_00002", 1000, 2000)],
  coverage_segments: [{ id: "seg_1", start_span_id: "clean_00001", end_span_id: "clean_00002", disposition: "semantic", content_unit_ids: ["cu_1"], rationale: "正文" }],
  content_units: [{ id: "cu_1", title: "观点与案例", summary: "这是一个长度足够的完整内容摘要，保留观点和案例。", importance: "core", content_types: ["claim", "example"], speaker_refs: ["UNKNOWN"], evidence_anchor_ids: ["ea_1", "ea_2"], claims: ["观点"], mechanisms: [], supporting_details: [{ id: "det_1", kind: "example", statement: "案例", importance: "supporting", evidence_anchor_ids: ["ea_2"] }], examples: ["案例"], concrete_objects: [], actions: [], conditions: [], boundaries: [], counterpoints: [], uncertainties: [] }],
} as EpisodeContentInventory);

describe("Content Review Gate", () => {
  it("accepts exact whole-transcript coverage with resolvable evidence", () => {
    expect(assessEpisodeContentInventory(valid(), grounded, audio).pass).toBe(true);
  });

  it("rejects a silent coverage gap", () => {
    const inventory = valid();
    inventory.coverage_segments[0].end_span_id = "clean_00001";
    const result = assessEpisodeContentInventory(inventory, grounded, audio);
    expect(result.pass).toBe(false);
    expect(result.missingSpanIds).toEqual(["clean_00002"]);
  });

  it("rejects an unassigned content unit", () => {
    const inventory = valid();
    inventory.coverage_segments[0].content_unit_ids = [];
    const result = assessEpisodeContentInventory(inventory, grounded, audio);
    expect(result.pass).toBe(false);
    expect(result.unassignedUnitIds).toEqual(["cu_1"]);
  });
});
