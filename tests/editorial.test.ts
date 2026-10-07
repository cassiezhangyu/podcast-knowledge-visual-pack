import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { coreQuestionId, editorialCacheKey, editorialPolicy, finalizeEditorialHumanReview, persistEditorialHandoff, type EditorialSemanticHandoff } from "../src/editorial.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const paths: string[] = [];
const write = (path: string, value: unknown) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };
const identity = { kind: "current_skill_execution_model", model_id: null, runtime_id: null, identity_status: "not_exposed_by_host" };

function fixtureWorkspace() {
  const workspace = mkdtempSync(join(tmpdir(), "podcast-editorial-")); paths.push(workspace);
  const source = join(workspace, "00-source"), output = join(workspace, "01-understanding"); mkdirSync(source, { recursive: true }); mkdirSync(output, { recursive: true });
  const metadata = { schema_version: "1.0", source_identity: { canonical_url: "https://example.test/episode/1", adapter_version: "1" }, episode: { id: "episode_1", title: "测试节目", podcast_name: "测试", published_at: null, duration_seconds: 1, show_notes: null, cover_url: null, audio_candidates: [] }, source_refs: [{ kind: "input_url", locator: "https://example.test/episode/1", retrieved_at: "2026-09-18T00:00:00.000Z" }] };
  const manifest = { schema_version: "1.0", source_identity: metadata.source_identity, status: "acquired", content_identity: { sha256: "a".repeat(64) }, asset: { relative_path: "audio/test.m4a", byte_length: 1, mime_type: "audio/mp4" }, retrieval: { audio_url: "https://example.test/test.m4a", retrieved_at: "2026-09-18T00:00:00.000Z", http_status: 200 }, source_refs: metadata.source_refs };
  const base = { schema_version: "1.0", kind: "knowledge_base", status: "completed", cache_key: "b".repeat(64), input: { audio_sha256: "a".repeat(64), grounded_transcript_sha256: "c".repeat(64), corrections_sha256: "d".repeat(64) }, execution: identity, windows: [{ id: "kw_0001" }], units: [], coverage_audit: { total_spans: 1, bands: [{ id: "00-01m" }] } };
  const graph = { schema_version: "1.0", kind: "knowledge_graph", status: "completed", knowledge_base_sha256: hash(base), episode_thesis: { id: "thesis_01", statement: "测试命题", epistemic_status: "episode_synthesis", evidence_anchor_ids: ["ea_1"], confidence: "high", uncertainty: "综合" }, core_questions: ["问题"], evidence_anchors: [{ id: "ea_1" }], nodes: [
    { id: "q_01", kind: "core_question", statement: "问题", epistemic_status: "episode_synthesis", evidence_anchor_ids: ["ea_1"], confidence: "high", uncertainty: "综合", review_status: "accepted" },
    { id: "clm_01", kind: "claim", statement: "主张", epistemic_status: "speaker_explicit", speaker_ref: "UNKNOWN", evidence_anchor_ids: ["ea_1"], confidence: "high", uncertainty: "无", review_status: "accepted" },
    { id: "mech_01", kind: "mechanism", statement: "机制", epistemic_status: "speaker_explicit", speaker_ref: "UNKNOWN", evidence_anchor_ids: ["ea_1"], confidence: "high", uncertainty: "无", review_status: "accepted" }
  ], relationships: [{ id: "rel_01", from_id: "mech_01", to_id: "clm_01", type: "explains", direction: "directed", epistemic_status: "speaker_explicit", evidence_anchor_ids: ["ea_1"], confidence: "high", review_status: "accepted" }], relationship_decisions: [{ candidate_id: "rel_02", status: "rejected", reason: "没有证据" }], coverage_audit: { bands: [{ id: "00-01m" }], unit_dispositions: [] } };
  const gate = { schema_version: "1.0", kind: "knowledge_gate", status: "pass", knowledge_graph_sha256: hash(graph), checks: [{ name: "all", status: "pass", details: {} }], high_impact_inference_ids: [], human_review_required: false, human_review: { status: "pass", reviewed_on: "2026-09-18", scope: "fixture" } };
  write(join(source, "episode_metadata.json"), metadata); write(join(source, "audio_manifest.json"), manifest); write(join(output, "knowledge_base.json"), base); write(join(output, "knowledge_graph.json"), graph); write(join(output, "knowledge_gate.json"), gate);
  return { workspace, graph, gate, base, metadata, manifest };
}

function handoff(): EditorialSemanticHandoff {
  const overview = "edp_overview_fixture", first = "edp_dd_claim_fixture", second = "edp_dd_mechanism_fixture";
  return { editorial_plan: { editorial_plan_id: "edp_fixture", package: {
    package_thesis: { statement: "测试节目说明主张如何由机制支撑。", epistemic_status: "episode_synthesis", derived_from_ids: ["thesis_01"], evidence_anchor_ids: ["ea_1"], confidence: "high", uncertainty: "综合" },
    cover: { page_id: "edp_cover_fixture", display_order: 0, role: "package_entry", title: "测试节目", subtitle: "主张与机制", derived_from_ids: ["thesis_01"], evidence_anchor_ids: ["ea_1"], epistemic_status: "episode_synthesis", confidence: "high", uncertainty: "综合" },
    overview: { page_id: overview, display_order: 1, role: "whole_picture", page_question: "节目整体如何成立？", takeaway: "机制解释主张。", mental_model_statement: "问题引出主张，机制解释它。", model_components: [
      { id: "omc_question", role: "question", knowledge_ids: ["q_01"], evidence_anchor_ids: ["ea_1"], statement: "提出问题" },
      { id: "omc_claim", role: "judgment", knowledge_ids: ["clm_01"], evidence_anchor_ids: ["ea_1"], statement: "主张" },
      { id: "omc_mechanism", role: "process", knowledge_ids: ["mech_01"], evidence_anchor_ids: ["ea_1"], statement: "机制" }
    ], model_connectors: [{ from_component_id: "omc_mechanism", to_component_id: "omc_claim", kind: "relationship", relationship_id: "rel_01", reason: "已接受解释关系" }], deep_dive_map: [{ deep_dive_page_id: first, component_ids: ["omc_claim"], reason: "展开主张" }, { deep_dive_page_id: second, component_ids: ["omc_mechanism"], reason: "展开机制" }], derived_from_ids: ["thesis_01", "q_01", "clm_01", "mech_01"], evidence_anchor_ids: ["ea_1"], information_budget: { primary_proposition_max: 1, max_independent_ideas: 3, required_elements: ["question", "claim", "mechanism"] } },
    deep_dives: [
      { page_id: first, display_order: 2, role: "opening", page_question: "主张是什么？", takeaway: "主张需要被说明。", primary_knowledge_ids: ["clm_01"], primary_relationship_ids: [], supporting_knowledge_ids: ["q_01"], evidence_anchor_ids: ["ea_1"], coverage: [{ page_id: first, coverage: "explain", reason: "主张" }], argument_preconditions: [overview], order_rationale: "先明确待解释的主张。", information_budget: { primary_proposition_max: 1, max_independent_ideas: 2, required_elements: ["claim", "question"] } },
      { page_id: second, display_order: 3, role: "deepen", page_question: "机制怎样解释主张？", takeaway: "机制是解释而非新主张。", primary_knowledge_ids: ["mech_01"], primary_relationship_ids: ["rel_01"], supporting_knowledge_ids: ["clm_01"], evidence_anchor_ids: ["ea_1"], coverage: [{ page_id: second, coverage: "explain", reason: "机制" }], argument_preconditions: [overview, first], order_rationale: "主张之后说明机制。", information_budget: { primary_proposition_max: 1, max_independent_ideas: 2, required_elements: ["mechanism", "relationship"] } }
    ]
  } }, coverage_matrix: { entries: [
    { target: { kind: "thesis", id: "thesis_01" }, argument_role: "central", input_epistemic_status: "episode_synthesis", input_confidence: "high", disposition: "overview_core", rationale: "整体命题", placements: [{ page_id: overview, coverage: "explain", reason: "整体模型" }], review_status: "needs_human_review" },
    { target: { kind: "core_question", id: coreQuestionId("问题") }, argument_role: "central", input_epistemic_status: "episode_synthesis", input_confidence: "not_applicable", disposition: "overview_core", rationale: "问题入口", placements: [{ page_id: overview, coverage: "explain", reason: "问题" }], review_status: "needs_human_review" },
    { target: { kind: "node", id: "q_01" }, argument_role: "central", input_epistemic_status: "episode_synthesis", input_confidence: "high", disposition: "overview_core", rationale: "问题", placements: [{ page_id: overview, coverage: "mention", reason: "入口" }], review_status: "needs_human_review" },
    { target: { kind: "node", id: "clm_01" }, argument_role: "central", input_epistemic_status: "speaker_explicit", input_confidence: "high", disposition: "deep_dive_primary", rationale: "核心主张", placements: [{ page_id: first, coverage: "explain", reason: "主张页" }], review_status: "needs_human_review" },
    { target: { kind: "node", id: "mech_01" }, argument_role: "supporting", input_epistemic_status: "speaker_explicit", input_confidence: "high", disposition: "deep_dive_primary", rationale: "解释机制", placements: [{ page_id: second, coverage: "explain", reason: "机制页" }], review_status: "needs_human_review" },
    { target: { kind: "relationship", id: "rel_01" }, argument_role: "supporting", input_epistemic_status: "speaker_explicit", input_confidence: "high", disposition: "deep_dive_support", rationale: "解释关系", placements: [{ page_id: second, coverage: "evidence", reason: "机制解释主张" }], review_status: "needs_human_review" },
    { target: { kind: "relationship_decision", id: "rel_02" }, argument_role: "context", input_epistemic_status: "not_applicable", input_confidence: "not_applicable", disposition: "guardrail_reference", rationale: "拒绝关系不可提升", placements: [], review_status: "needs_human_review" }
  ] } };
}

afterEach(() => paths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

describe("Sprint 04 editorial assembly", () => {
  it("uses deterministic policy and core-question identities", () => {
    expect(coreQuestionId("问题")).toBe(coreQuestionId("问题"));
    expect(editorialCacheKey({ a: "1" }, editorialPolicy(), identity)).toBe(editorialCacheKey({ a: "1" }, editorialPolicy(), identity));
  });

  it("persists a complete editorial plan and returns a valid cache hit", () => {
    const { workspace } = fixtureWorkspace();
    const first = persistEditorialHandoff(workspace, handoff());
    expect(first.cache_hit).toBe(false); expect(first.gate.status).toBe("needs_human_review");
    const second = persistEditorialHandoff(workspace, handoff());
    expect(second.cache_hit).toBe(true);
    expect(JSON.parse(readFileSync(join(workspace, "01-understanding", "editorial_gate.json"), "utf8")).status).toBe("needs_human_review");
  });

  it("保留已批准的总览续页并置于深度页之前", () => {
    const { workspace } = fixtureWorkspace(), continued = handoff();
    const pack = continued.editorial_plan.package as Record<string, unknown>;
    const overview = pack.overview as Record<string, unknown>;
    const continuationId = "edp_overview_fixture_02";
    pack.overview_continuations = [{ ...overview, page_id: continuationId, display_order: 2, page_question: "还需看见什么边界？", model_components: [{ id: "omc_boundary", role: "boundary", knowledge_ids: ["clm_01"], evidence_anchor_ids: ["ea_1"], statement: "主张的边界" }], model_connectors: [], deep_dive_map: [] }];
    for (const dive of pack.deep_dives as Array<Record<string, unknown>>) {
      dive.display_order = (dive.display_order as number) + 1;
      dive.argument_preconditions = [overview.page_id, continuationId];
    }
    const result = persistEditorialHandoff(workspace, continued);
    expect(result.gate.status).toBe("needs_human_review");
    const saved = JSON.parse(readFileSync(join(workspace, "01-understanding", "editorial_plan.json"), "utf8"));
    expect(saved.package.overview_continuations[0].page_id).toBe(continuationId);
    expect(saved.package.deep_dives[0].display_order).toBe(3);
    expect(readFileSync(join(workspace, "01-understanding", "editorial_review.md"), "utf8")).toContain(continuationId);
  });

  it("allows a Human-directed Editorial revision without invalidating upstream identity", () => {
    const { workspace } = fixtureWorkspace();
    persistEditorialHandoff(workspace, handoff());
    const revised = persistEditorialHandoff(workspace, handoff(), {}, true);
    expect(revised.cache_hit).toBe(false);
  });

  it("promotes only an existing machine-valid Editorial Gate after Human acceptance", () => {
    const { workspace } = fixtureWorkspace();
    persistEditorialHandoff(workspace, handoff());
    const gate = finalizeEditorialHumanReview(workspace, "2026-09-18");
    expect(gate.status).toBe("pass");
    expect(gate.human_review.status).toBe("pass");
    expect(JSON.parse(readFileSync(join(workspace, "01-understanding", "editorial_plan.json"), "utf8")).review_status).toBe("accepted");
  });

  it("rejects a missing disposition instead of silently omitting it", () => {
    const { workspace } = fixtureWorkspace(), broken = handoff();
    (broken.coverage_matrix.entries as Array<unknown>).pop();
    expect(() => persistEditorialHandoff(workspace, broken)).toThrow(/Coverage Matrix/);
  });

  it("keeps rejected relationships as unplaced guardrails", () => {
    const { workspace } = fixtureWorkspace(), broken = handoff();
    const decision = (broken.coverage_matrix.entries as Array<Record<string, unknown>>).at(-1)!;
    decision.placements = [{ page_id: "edp_dd_claim_fixture", coverage: "explain", reason: "wrong" }];
    expect(() => persistEditorialHandoff(workspace, broken)).toThrow(/guardrails/);
  });

  it("quarantines a corrupt Editorial cache and rebuilds only the Editorial layer", () => {
    const { workspace } = fixtureWorkspace();
    persistEditorialHandoff(workspace, handoff());
    writeFileSync(join(workspace, "01-understanding", "editorial_plan.json"), "not-json\n");
    const rebuilt = persistEditorialHandoff(workspace, handoff());
    expect(rebuilt.cache_hit).toBe(false);
    expect(JSON.parse(readFileSync(join(workspace, "01-understanding", "editorial_plan.json"), "utf8")).kind).toBe("editorial_plan");
  });
});
