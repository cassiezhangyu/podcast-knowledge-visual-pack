import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AudioManifest, EpisodeMetadata, PipelineError } from "./contracts.js";
import { currentSkillExecutionIdentity, type EvidenceAnchor } from "./knowledge.js";
import { validateArtifact } from "./validate.js";

const PIPELINE_VERSION = "4.0.0";
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const write = (path: string, value: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };

export type EditorialPolicy = {
  focus: string | null;
  audience: string | null;
  max_deep_dive_pages: number | null;
  output_language: string;
  selection_policy_version: string;
};

export type EditorialSemanticHandoff = {
  editorial_plan: { editorial_plan_id: string; package: Record<string, unknown> };
  coverage_matrix: Record<string, unknown>;
};

type KnowledgeNode = { id: string; kind: string; epistemic_status: string; confidence: string; evidence_anchor_ids: string[] };
type KnowledgeRelationship = { id: string; epistemic_status: string; confidence: string; evidence_anchor_ids: string[] };
type KnowledgeGraph = { knowledge_base_sha256: string; episode_thesis: { id: string; epistemic_status: string; confidence: string } | null; core_questions: string[]; nodes: KnowledgeNode[]; relationships: KnowledgeRelationship[]; relationship_decisions?: Array<{ candidate_id: string; status: string }> ; evidence_anchors: EvidenceAnchor[] };
type KnowledgeGate = { status: string; knowledge_graph_sha256: string; human_review?: { status: string } };

const defaultPolicy = (): EditorialPolicy => ({ focus: null, audience: null, max_deep_dive_pages: null, output_language: "zh-CN", selection_policy_version: "1.0" });
export const editorialPolicy = (partial: Partial<EditorialPolicy> = {}): EditorialPolicy => ({ ...defaultPolicy(), ...partial });
export const editorialCacheKey = (input: Record<string, string>, policy: EditorialPolicy, execution: ReturnType<typeof currentSkillExecutionIdentity>, pipelineVersion = PIPELINE_VERSION) => hash({ input, policy, execution, pipelineVersion });
export const coreQuestionId = (question: string) => `cq_${hash(question).slice(0, 16)}`;

function fail(code: "EDITORIAL_INPUT_INVALID" | "EDITORIAL_PLAN_INVALID" | "EDITORIAL_GATE_FAILED", stage: "editorial_assemble" | "editorial_gate", message: string, details?: Record<string, unknown>): never {
  throw new PipelineError(code, stage, message, false, details);
}

function inputState(workspace: string) {
  const source = join(workspace, "00-source"), output = join(workspace, "01-understanding");
  const metadata = read<EpisodeMetadata>(join(source, "episode_metadata.json"));
  const manifest = read<AudioManifest>(join(source, "audio_manifest.json"));
  const base = read<Record<string, unknown>>(join(output, "knowledge_base.json"));
  const graph = read<KnowledgeGraph>(join(output, "knowledge_graph.json"));
  const gate = read<KnowledgeGate>(join(output, "knowledge_gate.json"));
  validateArtifact("episode_metadata", metadata); validateArtifact("audio_manifest", manifest); validateArtifact("knowledge_base", base); validateArtifact("knowledge_graph", graph); validateArtifact("knowledge_gate", gate);
  const baseHash = hash(base), graphHash = hash(graph), gateHash = hash(gate);
  if (gate.status !== "pass" || gate.human_review?.status !== "pass") fail("EDITORIAL_INPUT_INVALID", "editorial_assemble", "Editorial assembly requires a passed Knowledge Model Gate and Human Semantic Review.", { status: gate.status, human_review: gate.human_review?.status });
  if (graph.knowledge_base_sha256 !== baseHash || gate.knowledge_graph_sha256 !== graphHash) fail("EDITORIAL_INPUT_INVALID", "editorial_assemble", "Knowledge artifact hashes do not form a valid accepted input chain.");
  return {
    source, output, graph, gate,
    input: { knowledge_graph_sha256: graphHash, knowledge_gate_sha256: gateHash, knowledge_base_sha256: baseHash, audio_sha256: manifest.content_identity.sha256, episode_metadata_sha256: hash(metadata) },
  };
}

function targetKey(kind: string, id: string) { return `${kind}:${id}`; }
function expectedTargets(graph: KnowledgeGraph) {
  const values = new Map<string, { kind: string; id: string }>();
  if (graph.episode_thesis) values.set(targetKey("thesis", graph.episode_thesis.id), { kind: "thesis", id: graph.episode_thesis.id });
  graph.core_questions.forEach((question) => values.set(targetKey("core_question", coreQuestionId(question)), { kind: "core_question", id: coreQuestionId(question) }));
  graph.nodes.forEach((node) => values.set(targetKey("node", node.id), { kind: "node", id: node.id }));
  graph.relationships.forEach((relationship) => values.set(targetKey("relationship", relationship.id), { kind: "relationship", id: relationship.id }));
  (graph.relationship_decisions ?? []).forEach((decision) => values.set(targetKey("relationship_decision", decision.candidate_id), { kind: "relationship_decision", id: decision.candidate_id }));
  return values;
}

function findStrings(value: unknown, field: string, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => findStrings(item, field, found));
  else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record[field])) found.push(...record[field].filter((item): item is string => typeof item === "string"));
    Object.values(record).forEach((item) => findStrings(item, field, found));
  }
  return found;
}

function assertNoVisualFields(value: unknown) {
  const forbidden = new Set(["hero_diagram", "visual", "visual_mode", "layout", "layout_constraints", "canvas", "coordinates", "color", "palette", "typography", "illustration"]);
  const visit = (item: unknown) => {
    if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object") for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
      if (forbidden.has(key)) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Editorial Plan contains a Sprint 05 visual field.", { field: key });
      visit(child);
    }
  };
  visit(value);
}

function assertPlanSemantics(plan: Record<string, unknown>, matrix: Record<string, unknown>, graph: KnowledgeGraph, input: Record<string, string>, policy: EditorialPolicy, execution: ReturnType<typeof currentSkillExecutionIdentity>) {
  validateArtifact("editorial_plan", plan); validateArtifact("coverage_matrix", matrix); assertNoVisualFields(plan);
  if (JSON.stringify(plan.input) !== JSON.stringify(input) || JSON.stringify(plan.policy) !== JSON.stringify(policy) || JSON.stringify(plan.execution) !== JSON.stringify(execution)) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Editorial Plan header does not match the accepted input, policy, or execution identity.");
  if (matrix.editorial_plan_id !== plan.editorial_plan_id || matrix.knowledge_graph_sha256 !== input.knowledge_graph_sha256 || plan.coverage_matrix_sha256 !== hash(matrix)) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Editorial Plan and Coverage Matrix identity mismatch.");
  const packageValue = plan.package as Record<string, unknown>, cover = packageValue.cover as Record<string, unknown>, overview = packageValue.overview as Record<string, unknown>, dives = packageValue.deep_dives as Array<Record<string, unknown>>;
  const overviews = [overview, ...((packageValue.overview_continuations as Array<Record<string, unknown>> | undefined) ?? [])];
  const pages = [cover, ...overviews, ...dives], pageIds = pages.map((page) => page.page_id as string);
  if (new Set(pageIds).size !== pageIds.length || pageIds.some((id) => typeof id !== "string")) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Editorial page IDs must be unique.");
  if (pages.some((page, index) => page.display_order !== index)) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Editorial display_order must follow cover, all Overview pages, then Deep Dives without gaps.");
  if (new Set(dives.map((page) => page.page_question as string)).size !== dives.length) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Deep Dives must answer distinct editorial questions.");
  if (policy.max_deep_dive_pages !== null && dives.length > policy.max_deep_dive_pages) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Deep Dive count exceeds explicit user ceiling.", { count: dives.length, max: policy.max_deep_dive_pages });
  const anchorIds = new Set(graph.evidence_anchors.map((anchor) => anchor.id));
  const referencedAnchors = findStrings(packageValue, "evidence_anchor_ids");
  if (referencedAnchors.some((id) => !anchorIds.has(id))) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Editorial Plan references an unknown EvidenceAnchor.");
  const graphIds = new Set<string>([...(graph.episode_thesis ? [graph.episode_thesis.id] : []), ...graph.nodes.map((node) => node.id), ...graph.core_questions.map(coreQuestionId)]);
  const relationshipIds = new Set(graph.relationships.map((relationship) => relationship.id));
  const knowledgeReferences = [...findStrings(packageValue, "derived_from_ids"), ...findStrings(packageValue, "knowledge_ids"), ...findStrings(packageValue, "primary_knowledge_ids"), ...findStrings(packageValue, "supporting_knowledge_ids")];
  if (knowledgeReferences.some((id) => !graphIds.has(id))) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Editorial Plan references knowledge absent from the accepted Graph.");
  const relationshipReferences = [...findStrings(packageValue, "primary_relationship_ids"), ...overviews.flatMap((page) => (page.model_connectors as Array<Record<string, unknown>>).flatMap((connector) => typeof connector.relationship_id === "string" ? [connector.relationship_id] : []))];
  if (relationshipReferences.some((id) => !relationshipIds.has(id))) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Editorial Plan references a missing or rejected relationship.");
  for (const page of overviews) {
    const componentIds = new Set((page.model_components as Array<Record<string, unknown>>).map((component) => component.id as string));
    for (const map of page.deep_dive_map as Array<Record<string, unknown>>) {
      if (!dives.some((dive) => dive.page_id === map.deep_dive_page_id) || (map.component_ids as string[]).some((id) => !componentIds.has(id))) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Overview Deep Dive map cannot resolve its page or model component.");
    }
  }
  for (const dive of dives) {
    const order = dive.display_order as number;
    if ((dive.argument_preconditions as string[]).some((id) => !pageIds.includes(id) || (pages.find((page) => page.page_id === id)?.display_order as number) >= order)) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "A Deep Dive precondition must occur earlier in the package.", { page_id: dive.page_id });
  }
  const expected = expectedTargets(graph), entries = matrix.entries as Array<Record<string, unknown>>, actual = new Map(entries.map((entry) => {
    const target = entry.target as Record<string, string>;
    return [targetKey(target.kind, target.id), entry];
  }));
  if (actual.size !== entries.length || [...expected.keys()].some((key) => !actual.has(key)) || [...actual.keys()].some((key) => !expected.has(key))) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Coverage Matrix must disposition every accepted target and every relationship-decision guardrail exactly once.");
  for (const [key, entry] of actual) {
    const target = entry.target as Record<string, string>, placements = entry.placements as Array<Record<string, unknown>>, disposition = entry.disposition as string;
    if (placements.some((placement) => !pageIds.includes(placement.page_id as string))) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Coverage placement references an unknown page.", { target: key });
    if (target.kind === "relationship_decision" && (disposition !== "guardrail_reference" || placements.length !== 0)) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "Rejected relationship decisions must remain unplaced guardrails.", { target: key });
    if (disposition === "not_paged_with_reason" && placements.length !== 0) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "A not-paged target cannot have a page placement.", { target: key });
    if (disposition !== "not_paged_with_reason" && disposition !== "guardrail_reference" && placements.length === 0) fail("EDITORIAL_PLAN_INVALID", "editorial_assemble", "A selected target requires an explicit page placement.", { target: key });
  }
}

function existingCache(output: string, cacheKey: string, graphHash: string) {
  const planPath = join(output, "editorial_plan.json"), matrixPath = join(output, "coverage_matrix.json"), gatePath = join(output, "editorial_gate.json");
  if (!existsSync(planPath) || !existsSync(matrixPath) || !existsSync(gatePath)) return null;
  try {
    const plan = read<Record<string, unknown>>(planPath), matrix = read<Record<string, unknown>>(matrixPath), gate = read<Record<string, unknown>>(gatePath);
    validateArtifact("editorial_plan", plan); validateArtifact("coverage_matrix", matrix); validateArtifact("editorial_gate", gate);
    if (plan.editorial_cache_key !== cacheKey || plan.input && (plan.input as Record<string, string>).knowledge_graph_sha256 !== graphHash || gate.editorial_plan_sha256 !== hash(plan) || gate.coverage_matrix_sha256 !== hash(matrix)) return null;
    return { plan, matrix, gate };
  } catch {
    const suffix = `.corrupt-${Date.now()}`;
    [planPath, matrixPath, gatePath].filter(existsSync).forEach((path) => renameSync(path, `${path}${suffix}`));
    return null;
  }
}

export function persistEditorialHandoff(workspace: string, handoff: EditorialSemanticHandoff, requestedPolicy: Partial<EditorialPolicy> = {}, force = false) {
  const state = inputState(workspace), policy = editorialPolicy(requestedPolicy), execution = currentSkillExecutionIdentity(), cacheKey = editorialCacheKey(state.input, policy, execution);
  const cached = force ? null : existingCache(state.output, cacheKey, state.input.knowledge_graph_sha256);
  if (cached) {
    writeFileSync(join(state.output, "editorial_review.md"), renderEditorialReview(cached.plan, cached.matrix, cached.gate, state.graph));
    return { cache_hit: true, cache_key: cacheKey, gate: cached.gate, review_path: join(state.output, "editorial_review.md") };
  }
  const matrix: Record<string, unknown> = { ...handoff.coverage_matrix, schema_version: "1.0", kind: "coverage_matrix", editorial_plan_id: handoff.editorial_plan.editorial_plan_id, knowledge_graph_sha256: state.input.knowledge_graph_sha256 };
  const plan = {
    schema_version: "1.0", kind: "editorial_plan", status: "completed", editorial_plan_id: handoff.editorial_plan.editorial_plan_id,
    editorial_cache_key: cacheKey, pipeline_version: PIPELINE_VERSION, input: state.input, execution, policy,
    package: handoff.editorial_plan.package, coverage_matrix_sha256: hash(matrix), review_status: "needs_human_review", created_at: new Date().toISOString(),
  };
  assertPlanSemantics(plan, matrix, state.graph, state.input, policy, execution);
  const checks = [
    { name: "accepted_knowledge_input", status: "pass" as const, details: { knowledge_gate: "pass", knowledge_graph_sha256: state.input.knowledge_graph_sha256 } },
    { name: "editorial_schema_and_identity", status: "pass" as const, details: { editorial_cache_key: cacheKey } },
    { name: "reference_resolution", status: "pass" as const, details: { anchors: state.graph.evidence_anchors.length } },
    { name: "disposition_completeness", status: "pass" as const, details: { targets: (matrix.entries as unknown[]).length } },
    { name: "overview_and_deep_dive_structure", status: "pass" as const, details: { deep_dive_count: ((plan.package as Record<string, unknown>).deep_dives as unknown[]).length } },
    { name: "golden_human_editorial_review", status: "needs_human_review" as const, details: {} },
  ];
  const gate = { schema_version: "1.0", kind: "editorial_gate", status: "needs_human_review" as const, editorial_plan_sha256: hash(plan), coverage_matrix_sha256: hash(matrix), knowledge_graph_sha256: state.input.knowledge_graph_sha256, knowledge_gate_sha256: state.input.knowledge_gate_sha256, checks, human_review_required: true };
  validateArtifact("editorial_gate", gate);
  write(join(state.output, "coverage_matrix.json"), matrix); write(join(state.output, "editorial_plan.json"), plan); write(join(state.output, "editorial_gate.json"), gate);
  const review = renderEditorialReview(plan, matrix, gate, state.graph);
  writeFileSync(join(state.output, "editorial_review.md"), review);
  return { cache_hit: false, cache_key: cacheKey, gate, review_path: join(state.output, "editorial_review.md") };
}

/** Final Human acceptance is deliberately separate from semantic Editorial assembly. */
export function finalizeEditorialHumanReview(workspace: string, reviewedOn: string) {
  const state = inputState(workspace);
  const plan = read<Record<string, unknown>>(join(state.output, "editorial_plan.json"));
  const matrix = read<Record<string, unknown>>(join(state.output, "coverage_matrix.json"));
  const currentGate = read<Record<string, unknown>>(join(state.output, "editorial_gate.json"));
  validateArtifact("editorial_plan", plan); validateArtifact("coverage_matrix", matrix); validateArtifact("editorial_gate", currentGate);
  if (currentGate.editorial_plan_sha256 !== hash(plan) || currentGate.coverage_matrix_sha256 !== hash(matrix) || currentGate.knowledge_graph_sha256 !== state.input.knowledge_graph_sha256 || currentGate.knowledge_gate_sha256 !== state.input.knowledge_gate_sha256) fail("EDITORIAL_GATE_FAILED", "editorial_gate", "Editorial Gate does not match the current accepted Plan, Matrix, or Knowledge input.");
  const checks = (currentGate.checks as Array<{ name: string; status: "pass" | "fail" | "needs_human_review"; details: Record<string, unknown> }>).map((check) => check.name === "golden_human_editorial_review"
    ? { ...check, status: "pass" as const, details: { ...check.details, human_decision: "pass", reviewed_on: reviewedOn } }
    : check);
  if (!checks.some((check) => check.name === "golden_human_editorial_review") || checks.some((check) => check.status !== "pass")) fail("EDITORIAL_GATE_FAILED", "editorial_gate", "Cannot promote the Editorial Gate while a check remains non-pass.");
  const acceptedPlan = { ...plan, review_status: "accepted" as const };
  validateArtifact("editorial_plan", acceptedPlan);
  const gate = { ...currentGate, status: "pass" as const, editorial_plan_sha256: hash(acceptedPlan), checks, human_review_required: false, human_review: { status: "pass" as const, reviewed_on: reviewedOn, scope: "Golden Editorial Architecture second Human Editorial Review" } };
  validateArtifact("editorial_gate", gate);
  write(join(state.output, "editorial_plan.json"), acceptedPlan); write(join(state.output, "editorial_gate.json"), gate);
  writeFileSync(join(state.output, "editorial_review.md"), renderEditorialReview(acceptedPlan, matrix, gate, state.graph));
  return gate;
}

function renderEditorialReview(plan: Record<string, unknown>, matrix: Record<string, unknown>, gate: Record<string, unknown>, graph: KnowledgeGraph) {
  const packageValue = plan.package as Record<string, unknown>, thesis = packageValue.package_thesis as Record<string, unknown>, cover = packageValue.cover as Record<string, unknown>, overview = packageValue.overview as Record<string, unknown>, dives = packageValue.deep_dives as Array<Record<string, unknown>>;
  const overviews = [overview, ...((packageValue.overview_continuations as Array<Record<string, unknown>> | undefined) ?? [])];
  const overviewSections = overviews.map((page) => {
    const components = (page.model_components as Array<Record<string, unknown>>).map((component) => `| ${component.id} | ${component.role} | ${(component.knowledge_ids as string[]).join(", ")} | ${component.statement} |`).join("\n");
    const connectors = (page.model_connectors as Array<Record<string, unknown>>).map((connector) => `| ${connector.from_component_id} | ${connector.to_component_id} | ${connector.kind}${connector.relationship_id ? ` (${connector.relationship_id})` : ""} | ${connector.reason} |`).join("\n");
    return `### ${page.page_id}（第 ${page.display_order} 页）\n\n**页面问题：** ${page.page_question}\n\n**核心结论：** ${page.takeaway}\n\n${page.mental_model_statement}\n\n| 组件 | 职责 | 知识来源 | 表述 |\n| --- | --- | --- | --- |\n${components}\n\n| 起点 | 终点 | 关系 | 来源依据 |\n| --- | --- | --- | --- |\n${connectors}`;
  }).join("\n\n");
  const deepRows = dives.map((dive) => `| ${dive.display_order} | ${dive.page_id} | ${dive.role} | ${dive.page_question} | ${(dive.primary_knowledge_ids as string[]).join(", ")} | ${(dive.primary_relationship_ids as string[]).join(", ") || "—"} | ${(dive.evidence_anchor_ids as string[]).join(", ")} | ${dive.order_rationale} |`).join("\n");
  const coverageRows = (matrix.entries as Array<Record<string, unknown>>).map((entry) => { const target = entry.target as Record<string, string>; const placements = (entry.placements as Array<Record<string, unknown>>).map((placement) => `${placement.page_id}/${placement.coverage}`).join(", ") || "—"; return `| ${target.kind}:${target.id} | ${entry.argument_role} | ${entry.disposition} | ${placements} | ${entry.rationale} |`; }).join("\n");
  const rejected = (graph.relationship_decisions ?? []).map((decision) => `- **${decision.candidate_id}**: ${decision.status} — 保留为编辑边界，不晋升为页面关系。`).join("\n") || "- 无。";
  return `# 编辑规划人工审核\n\n## 输入绑定\n\n- 知识图 SHA-256: ${plan.input && (plan.input as Record<string, string>).knowledge_graph_sha256}\n- 知识门禁 SHA-256: ${plan.input && (plan.input as Record<string, string>).knowledge_gate_sha256}\n- 编辑缓存标识: ${plan.editorial_cache_key}\n- 门禁状态: ${gate.status}\n\n## 整包命题\n\n${thesis.statement}\n\n- 依据： ${(thesis.derived_from_ids as string[]).join(", ")}\n- 证据锚点： ${(thesis.evidence_anchor_ids as string[]).join(", ")}\n- 不确定性： ${thesis.uncertainty}\n\n## 封面内容规划\n\n- **${cover.title}**${cover.subtitle ? ` — ${cover.subtitle}` : ""}\n- 职责： ${cover.role}; 来源： ${(cover.derived_from_ids as string[]).join(", ")}\n\n## 总览解释模型\n\n${overviewSections}\n\n## 深度解读\n\n| 顺序 | 页号 | 职责 | 问题 | 主要知识 | 主要关系 | 证据锚点 | 顺序理由 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${deepRows}\n\n## 覆盖与去向记录\n\n| 输入项 | 论证职责 | 去向 | 页面及深度 | 理由 |\n| --- | --- | --- | --- | --- |\n${coverageRows}\n\n## 已拒绝关系的边界\n\n${rejected}\n\n## 审核提示\n\n- Does the Overview recover the programme's whole argument rather than list the 深度解读?\n- 每张深读页是否有独立问题，并保留证据与边界？\n- 已接受的对象与关系是否有明确去向，且没有重新发明已拒绝的联系？\n- 顺序是否由论证依赖决定？\n- 此阶段只审内容规划，视觉形式与构图留到对应阶段。\n`;
}
