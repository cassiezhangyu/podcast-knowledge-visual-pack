import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PipelineError } from "./contracts.js";
import { currentSkillExecutionIdentity } from "./knowledge.js";
import { validateArtifact } from "./validate.js";

const PIPELINE_VERSION = "5.0.0";
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const write = (path: string, value: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };
const fileHash = (path: string) => hash(readFileSync(path, "utf8"));

type RecordValue = Record<string, unknown>;
type Candidate = RecordValue & { candidate_id: string; mode: string; source_page_id: string; visual_argument: RecordValue; hero_hypothesis: RecordValue };
type CandidatePage = RecordValue & { source_page_id: string; candidates: Candidate[] };
type CandidateHandoff = { pages: CandidatePage[]; package_repetition_review: RecordValue };
type SelectionHandoff = { selections: Array<RecordValue>; package_repetition_review: RecordValue };

export type VisualPolicy = {
  visual_reasoning_policy_version: string;
  taste_version: string;
  mode_specific_taste_exposure_policy_version: string;
  output_language: string;
};

const fail = (code: "VISUAL_INPUT_INVALID" | "VISUAL_CANDIDATES_INVALID" | "VISUAL_SELECTION_INVALID" | "VISUAL_GATE_FAILED", stage: "visual_candidates" | "visual_selection" | "visual_gate", message: string, details?: RecordValue): never => {
  throw new PipelineError(code, stage, message, false, details);
};

export const visualPolicy = (partial: Partial<VisualPolicy> = {}): VisualPolicy => ({
  visual_reasoning_policy_version: "1.0",
  taste_version: "1.0",
  mode_specific_taste_exposure_policy_version: "1.0",
  output_language: "zh-CN",
  ...partial,
});

export const visualCandidateCacheKey = (input: RecordValue, policy: VisualPolicy, execution: RecordValue, sourceHashes: RecordValue) =>
  hash({ input, policy, execution, sourceHashes, pipeline_version: PIPELINE_VERSION, semantic_pass: "candidate_generation" });
export const visualSelectionCacheKey = (frozenCandidatesSha256: string, input: RecordValue, execution: RecordValue) =>
  hash({ frozenCandidatesSha256, input, execution, package_context_policy_version: "1.0", selection_review_policy_version: "1.0", pipeline_version: PIPELINE_VERSION, semantic_pass: "candidate_review_selection" });

function visualPaths(workspace: string) {
  return { source: join(workspace, "00-source"), understanding: join(workspace, "01-understanding"), output: join(workspace, "02-visual-plan") };
}

function inputState(workspace: string) {
  const paths = visualPaths(workspace);
  const metadata = read<RecordValue>(join(paths.source, "episode_metadata.json"));
  const manifest = read<RecordValue>(join(paths.source, "audio_manifest.json"));
  const graph = read<RecordValue>(join(paths.understanding, "knowledge_graph.json"));
  const plan = read<RecordValue>(join(paths.understanding, "editorial_plan.json"));
  const matrix = read<RecordValue>(join(paths.understanding, "coverage_matrix.json"));
  const gate = read<RecordValue>(join(paths.understanding, "editorial_gate.json"));
  validateArtifact("episode_metadata", metadata); validateArtifact("audio_manifest", manifest); validateArtifact("knowledge_graph", graph); validateArtifact("editorial_plan", plan); validateArtifact("coverage_matrix", matrix); validateArtifact("editorial_gate", gate);
  const planHash = hash(plan), matrixHash = hash(matrix), gateHash = hash(gate), graphHash = hash(graph);
  if (gate.status !== "pass" || (gate.human_review as RecordValue | undefined)?.status !== "pass" || plan.review_status !== "accepted") fail("VISUAL_INPUT_INVALID", "visual_candidates", "Visual Reasoning requires a passed Final Editorial Gate and accepted Editorial Plan.", { gate: gate.status, review_status: plan.review_status });
  if (gate.editorial_plan_sha256 !== planHash || gate.coverage_matrix_sha256 !== matrixHash || gate.knowledge_graph_sha256 !== graphHash) fail("VISUAL_INPUT_INVALID", "visual_candidates", "Editorial Plan, Matrix, Gate, and Knowledge Graph do not form a valid accepted input chain.");
  const content = manifest.content_identity as RecordValue;
  return {
    ...paths, graph, plan, matrix, gate,
    input: { editorial_plan_sha256: planHash, coverage_matrix_sha256: matrixHash, editorial_gate_sha256: gateHash, knowledge_graph_sha256: graphHash, audio_sha256: content.sha256 },
    sourceHashes: { taste_sha256: fileHash(join(process.cwd(), "taste.md")), visual_rules_sha256: fileHash(join(process.cwd(), "rules", "visual_reasoning.md")), design_gates_sha256: fileHash(join(process.cwd(), "rules", "design_gates.md")), episode_metadata_sha256: hash(metadata) },
  };
}

function eligiblePages(plan: RecordValue): RecordValue[] {
  const packageValue = plan.package as RecordValue;
  return [packageValue.overview as RecordValue, ...((packageValue.overview_continuations as RecordValue[] | undefined) ?? []), ...packageValue.deep_dives as RecordValue[]];
}

function allowedPageSources(page: RecordValue, plan: RecordValue, graph?: RecordValue) {
  const ids = new Set<string>(); const relationships = new Set<string>(); const components = new Set<string>();
  const add = (value: unknown) => Array.isArray(value) && value.forEach((id) => typeof id === "string" && ids.add(id));
  add(page.derived_from_ids); add(page.primary_knowledge_ids); add(page.supporting_knowledge_ids);
  (page.primary_relationship_ids as unknown[] | undefined)?.forEach((id) => typeof id === "string" && relationships.add(id));
  if (page.role === "whole_picture") {
    for (const component of page.model_components as RecordValue[]) { components.add(component.id as string); add(component.knowledge_ids); }
    for (const connector of page.model_connectors as RecordValue[]) if (connector.kind === "relationship" && typeof connector.relationship_id === "string") relationships.add(connector.relationship_id);
    add((plan.package as RecordValue).package_thesis && [(plan.package as RecordValue).package_thesis as RecordValue].map((value) => value.derived_from_ids).flat());
  }
  const packageValue = plan.package as RecordValue;
  const overviews = [packageValue.overview as RecordValue, ...((packageValue.overview_continuations as RecordValue[] | undefined) ?? [])];
  for (const overview of overviews) for (const component of overview.model_components as RecordValue[]) components.add(component.id as string);
  if (graph) for (const relation of graph.relationships as RecordValue[]) {
    if (ids.has(relation.from_id as string) && ids.has(relation.to_id as string)) relationships.add(relation.id as string);
  }
  return { ids, relationships, components };
}

function assertNoConstructionFields(value: unknown) {
  const forbidden = new Set(["x", "y", "width", "height", "font", "color", "palette", "typography", "binding", "bindings", "element", "elements", "canvas", "coordinates", "layout", "layout_constraints", "excalidraw"]);
  const walk = (item: unknown) => {
    if (Array.isArray(item)) item.forEach(walk);
    else if (item && typeof item === "object") for (const [key, child] of Object.entries(item as RecordValue)) {
      if (forbidden.has(key)) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Sprint 05 artifact contains a Sprint 06 construction field.", { field: key });
      walk(child);
    }
  };
  walk(value);
}

function assertCandidateProvenance(candidate: Candidate, allowed: ReturnType<typeof allowedPageSources>, graph: RecordValue, guardrails: Set<string>) {
  const knownNodes = new Set((graph.nodes as RecordValue[]).map((node) => node.id as string));
  const acceptedRels = new Set((graph.relationships as RecordValue[]).map((rel) => rel.id as string));
  const assertSource = (source: RecordValue) => {
    const kind = source.source_kind as string, refs = source.source_ids as string[];
    if (kind === "knowledge_object" || kind === "editorial_boundary") {
      if (refs.some((id) => !knownNodes.has(id) || !allowed.ids.has(id))) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Candidate references a Knowledge Object outside its accepted Editorial page.", { candidate_id: candidate.candidate_id, refs });
    } else if (kind === "accepted_relationship") {
      if (refs.some((id) => !acceptedRels.has(id) || !allowed.relationships.has(id))) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Candidate references an unsupported relationship.", { candidate_id: candidate.candidate_id, refs });
    } else if (kind === "editorial_parallel_context") {
      if (refs.some((id) => !allowed.components.has(id))) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Parallel context must reference accepted Overview components.", { candidate_id: candidate.candidate_id, refs });
    }
    if (refs.some((id) => guardrails.has(id))) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Rejected relationship cannot be visualized as a proposition.", { candidate_id: candidate.candidate_id, refs });
  };
  for (const source of candidate.visual_argument.supported_propositions as RecordValue[]) assertSource(source);
  for (const mapping of candidate.visual_argument.visual_semantic_mappings as RecordValue[]) {
    assertSource(mapping);
    if (mapping.source_kind === "editorial_parallel_context" && mapping.assertion !== "non_directional_parallel") fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Parallel context must be non-directional and non-causal.", { candidate_id: candidate.candidate_id });
  }
}

export function candidateModelFingerprint(candidate: RecordValue) {
  const typed = candidate as Candidate;
  const argument = typed.visual_argument, hero = typed.hero_hypothesis;
  return JSON.stringify({ operation: argument.reader_operation, structure: hero.structure_kind, mapping: (argument.visual_semantic_mappings as RecordValue[]).map((item) => `${item.vocabulary}:${item.source_kind}`).sort() });
}

export function candidateModelsMateriallyDistinct(first: RecordValue, second: RecordValue) {
  const a = first as Candidate, b = second as Candidate;
  const dimensions = [
    a.visual_argument.reader_operation !== b.visual_argument.reader_operation,
    a.hero_hypothesis.structure_kind !== b.hero_hypothesis.structure_kind,
    JSON.stringify((a.visual_argument.visual_semantic_mappings as RecordValue[]).map((item) => `${item.vocabulary}:${item.source_kind}:${(item.source_ids as string[]).join(",")}`).sort()) !== JSON.stringify((b.visual_argument.visual_semantic_mappings as RecordValue[]).map((item) => `${item.vocabulary}:${item.source_kind}:${(item.source_ids as string[]).join(",")}`).sort()),
  ];
  return dimensions.filter(Boolean).length >= 2;
}

function assertPackagePairs(pageIds: string[], review: RecordValue, stage: "visual_candidates" | "visual_selection") {
  const pairs = review.pairs as RecordValue[];
  const expected = new Set<string>(); for (let a = 0; a < pageIds.length; a += 1) for (let b = a + 1; b < pageIds.length; b += 1) expected.add([pageIds[a], pageIds[b]].sort().join("|"));
  const actual = new Set(pairs.map((pair) => [pair.page_a as string, pair.page_b as string].sort().join("|")));
  if (actual.size !== expected.size || [...expected].some((key) => !actual.has(key))) fail(stage === "visual_candidates" ? "VISUAL_CANDIDATES_INVALID" : "VISUAL_SELECTION_INVALID", stage, "Package repetition review must compare every unique eligible-page pair exactly once.", { expected_pairs: expected.size, actual_pairs: actual.size });
}

function validateCandidateHandoff(state: ReturnType<typeof inputState>, handoff: CandidateHandoff) {
  const pages = eligiblePages(state.plan); const expected = new Map(pages.map((page) => [page.page_id as string, page]));
  if (handoff.pages.length !== expected.size || new Set(handoff.pages.map((page) => page.source_page_id)).size !== expected.size) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Candidate handoff must contain exactly the Overview and accepted Deep Dives, never Cover.");
  const guardrails = new Set((state.graph.relationship_decisions as RecordValue[]).map((decision) => decision.candidate_id as string));
  for (const page of handoff.pages) {
    const sourcePage = expected.get(page.source_page_id); if (!sourcePage) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Candidate handoff contains a page absent from the accepted Editorial Plan.", { page_id: page.source_page_id });
    if ((page as RecordValue).page_question !== sourcePage!.page_question || (page as RecordValue).takeaway !== sourcePage!.takeaway) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Candidate page text must match the accepted Editorial Plan exactly.", { page_id: page.source_page_id });
    const modes = page.candidates.map((candidate) => candidate.mode); if (page.candidates.length !== 3 || new Set(modes).size !== 3 || !["safe", "adaptive", "wildcard"].every((mode) => modes.includes(mode))) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Each page requires exactly one SAFE, ADAPTIVE, and WILDCARD candidate.", { page_id: page.source_page_id });
    const ids = page.candidates.map((candidate) => candidate.candidate_id); if (new Set(ids).size !== ids.length || ids.some((id) => !id.startsWith("vca_"))) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Candidate IDs must be unique stable IDs.", { page_id: page.source_page_id });
    const fingerprints = page.candidates.map(candidateModelFingerprint); if (new Set(fingerprints).size !== 3 || page.candidates.some((candidate, index) => page.candidates.slice(index + 1).some((other) => !candidateModelsMateriallyDistinct(candidate, other)))) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Candidate modes must differ in at least two explanatory-model dimensions, not style/layout variants.", { page_id: page.source_page_id });
    for (const candidate of page.candidates) {
      if (candidate.source_page_id !== page.source_page_id || ["selected", "winner", "ranking", "recommendation", "comparison_notes"].some((key) => key in candidate)) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Pass A must not rank or preselect a candidate.", { candidate_id: candidate.candidate_id });
      if (candidate.mode === "wildcard") {
        const taste = candidate.taste_exposure as RecordValue;
        if (!["exploration_hypothesis", "departure_from_known_preferences", "potential_discovery_value"].every((key) => typeof taste[key] === "string" && (taste[key] as string).length > 0)) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Wildcard requires approved Taste Exposure exploration fields.", { candidate_id: candidate.candidate_id });
      }
      const declaredGuardrails = new Set((candidate.guardrails as RecordValue).rejected_relationship_ids as string[]);
      if ([...guardrails].some((id) => !declaredGuardrails.has(id))) fail("VISUAL_CANDIDATES_INVALID", "visual_candidates", "Each candidate must preserve every rejected relationship as a negative guardrail.", { candidate_id: candidate.candidate_id });
      assertCandidateProvenance(candidate, allowedPageSources(sourcePage!, state.plan, state.graph), state.graph, guardrails);
    }
  }
  assertPackagePairs([...expected.keys()], handoff.package_repetition_review, "visual_candidates");
}

function candidatesPath(output: string) { return join(output, "visual_candidates.json"); }
function selectedPath(output: string) { return join(output, "selected_visual_plan.json"); }
function gatePath(output: string) { return join(output, "visual_gate.json"); }

function existingCandidates(output: string, key: string) {
  const path = candidatesPath(output); if (!existsSync(path)) return null;
  try { const value = read<RecordValue>(path); validateArtifact("visual_candidates", value); return value.visual_candidates_cache_key === key ? value : null; }
  catch { renameSync(path, `${path}.corrupt-${Date.now()}`); return null; }
}

export function persistVisualCandidates(workspace: string, handoff: CandidateHandoff, requestedPolicy: Partial<VisualPolicy> = {}, force = false) {
  const state = inputState(workspace), policy = visualPolicy(requestedPolicy), execution = currentSkillExecutionIdentity();
  const completePolicy = { ...policy, taste_sha256: state.sourceHashes.taste_sha256, visual_rules_sha256: state.sourceHashes.visual_rules_sha256, design_gates_sha256: state.sourceHashes.design_gates_sha256 };
  const key = visualCandidateCacheKey(state.input, policy, execution, state.sourceHashes); const cached = force ? null : existingCandidates(state.output, key);
  if (cached) return { cache_hit: true, cache_key: key, frozen_candidates_sha256: cached.frozen_candidates_sha256, path: candidatesPath(state.output) };
  assertNoConstructionFields(handoff); validateCandidateHandoff(state, handoff);
  const provisional: RecordValue = { schema_version: "1.0", kind: "visual_candidates", status: "completed", visual_reasoning_run_id: `vrc_${hash({ key, pages: handoff.pages.map((page) => page.source_page_id) }).slice(0, 20)}`, visual_candidates_cache_key: key, pipeline_version: PIPELINE_VERSION, input: state.input, execution, policy: completePolicy, candidate_set_state: "frozen", frozen_candidates_sha256: "0".repeat(64), frozen_at: new Date().toISOString(), pages: handoff.pages, package_repetition_review: handoff.package_repetition_review, created_at: new Date().toISOString() };
  const frozen = hash({ ...provisional, frozen_candidates_sha256: undefined, frozen_at: undefined, created_at: undefined }); provisional.frozen_candidates_sha256 = frozen;
  validateArtifact("visual_candidates", provisional); write(candidatesPath(state.output), provisional);
  return { cache_hit: false, cache_key: key, frozen_candidates_sha256: frozen, path: candidatesPath(state.output) };
}

function existingSelection(output: string, key: string) {
  const selected = selectedPath(output), gate = gatePath(output); if (!existsSync(selected) || !existsSync(gate)) return null;
  try { const plan = read<RecordValue>(selected), gateValue = read<RecordValue>(gate); validateArtifact("selected_visual_plan", plan); validateArtifact("visual_gate", gateValue); return plan.selection_cache_key === key ? { plan, gate: gateValue } : null; }
  catch { [selected, gate].filter(existsSync).forEach((path) => renameSync(path, `${path}.corrupt-${Date.now()}`)); return null; }
}

function validateSelectionHandoff(candidates: RecordValue, handoff: SelectionHandoff) {
  const pages = candidates.pages as CandidatePage[]; const expected = new Set(pages.map((page) => page.source_page_id));
  if (handoff.selections.length !== expected.size || new Set(handoff.selections.map((item) => item.source_page_id as string)).size !== expected.size) fail("VISUAL_SELECTION_INVALID", "visual_selection", "Pass B must select exactly one candidate from every frozen eligible page.");
  for (const selection of handoff.selections) {
    const page = pages.find((candidatePage) => candidatePage.source_page_id === selection.source_page_id); if (!page) fail("VISUAL_SELECTION_INVALID", "visual_selection", "Selection references a page absent from frozen candidates.");
    const chosen = page!.candidates.find((candidate) => candidate.candidate_id === selection.selected_candidate_id); if (!chosen || chosen.mode !== selection.selected_mode || selection.visual_argument_ref !== chosen.candidate_id || selection.hero_hypothesis_ref !== chosen.candidate_id) fail("VISUAL_SELECTION_INVALID", "visual_selection", "Pass B may only select and reference a frozen candidate unchanged.", { page_id: selection.source_page_id });
    const non = selection.non_selected_rationales as RecordValue[]; const alternatives = page!.candidates.filter((candidate) => candidate.candidate_id !== chosen!.candidate_id).map((candidate) => candidate.candidate_id);
    if (non.length !== 2 || new Set(non.map((item) => item.candidate_id as string)).size !== 2 || non.some((item) => !alternatives.includes(item.candidate_id as string))) fail("VISUAL_SELECTION_INVALID", "visual_selection", "Pass B needs an explicit rationale for both non-selected frozen alternatives.", { page_id: selection.source_page_id });
    const rationale = `${selection.selection_rationale} ${non.map((item) => item.rationale).join(" ")}`.toLowerCase(); if (/generated first|winner|low risk|lower risk|safe|familiar/.test(rationale) && !/evidence|解释|关系|机制|边界|provenance/.test(rationale)) fail("VISUAL_SELECTION_INVALID", "visual_selection", "Selection rationale relies on anchoring/mode preference rather than explanatory or evidence consequences.", { page_id: selection.source_page_id });
  }
  assertPackagePairs([...expected], handoff.package_repetition_review, "visual_selection");
}

export function persistVisualSelection(workspace: string, handoff: SelectionHandoff, force = false) {
  const state = inputState(workspace), candidates = read<RecordValue>(candidatesPath(state.output)); validateArtifact("visual_candidates", candidates);
  if (candidates.candidate_set_state !== "frozen") fail("VISUAL_SELECTION_INVALID", "visual_selection", "Pass B requires a frozen Pass-A candidate inventory.");
  const execution = currentSkillExecutionIdentity(), selectionInput = { editorial_plan_sha256: state.input.editorial_plan_sha256, editorial_gate_sha256: state.input.editorial_gate_sha256, knowledge_graph_sha256: state.input.knowledge_graph_sha256 };
  const key = visualSelectionCacheKey(candidates.frozen_candidates_sha256 as string, selectionInput, execution); const cached = force ? null : existingSelection(state.output, key);
  if (cached) return { cache_hit: true, cache_key: key, gate: cached.gate, review_path: join(state.output, "visual_review.md") };
  assertNoConstructionFields(handoff); validateSelectionHandoff(candidates, handoff);
  const plan: RecordValue = { schema_version: "1.0", kind: "selected_visual_plan", status: "completed", selected_plan_id: `svp_${hash({ key, selections: handoff.selections.map((value) => value.selected_candidate_id) }).slice(0, 20)}`, selection_cache_key: key, pipeline_version: PIPELINE_VERSION, input: selectionInput, execution, frozen_candidates_sha256: candidates.frozen_candidates_sha256, selections: handoff.selections.map((selection) => ({ ...selection, selection_pass: { semantic_pass: "candidate_review_selection", frozen_candidates_sha256: candidates.frozen_candidates_sha256, execution_identity: execution } })), package_repetition_review: handoff.package_repetition_review, review_status: "needs_human_review", created_at: new Date().toISOString() };
  validateArtifact("selected_visual_plan", plan);
  const checks = [
    { name: "accepted_editorial_input", status: "pass", details: { editorial_gate: "pass" } },
    { name: "pass_a_frozen_candidates", status: "pass", details: { frozen_candidates_sha256: candidates.frozen_candidates_sha256, pages: (candidates.pages as unknown[]).length } },
    { name: "evidence_and_negative_guardrails", status: "pass", details: { rejected_relationship_ids: (state.graph.relationship_decisions as unknown[]).length } },
    { name: "independent_pass_b_selection", status: "pass", details: { selections: handoff.selections.length } },
    { name: "package_repetition_review", status: "pass", details: { pairs: (handoff.package_repetition_review.pairs as unknown[]).length } },
    { name: "golden_human_art_direction_review", status: "needs_human_review", details: {} },
  ];
  const gate: RecordValue = { schema_version: "1.0", kind: "visual_gate", status: "needs_human_review", visual_candidates_sha256: hash(candidates), selected_visual_plan_sha256: hash(plan), editorial_plan_sha256: state.input.editorial_plan_sha256, editorial_gate_sha256: state.input.editorial_gate_sha256, checks, human_review_required: true };
  validateArtifact("visual_gate", gate); write(selectedPath(state.output), plan); write(gatePath(state.output), gate); writeFileSync(join(state.output, "visual_review.md"), renderVisualReview(candidates, plan, gate));
  return { cache_hit: false, cache_key: key, gate, review_path: join(state.output, "visual_review.md") };
}

function renderVisualReview(candidates: RecordValue, selected: RecordValue, gate: RecordValue) {
  const pages = candidates.pages as CandidatePage[], selections = selected.selections as RecordValue[];
  const body = pages.map((page) => {
    const choice = selections.find((selection) => selection.source_page_id === page.source_page_id) as RecordValue;
    const candidatesText = page.candidates.map((candidate) => `### ${candidate.mode.toUpperCase()} — ${candidate.candidate_id}\n\n- Reader operation: ${candidate.visual_argument.reader_operation}\n- Visual-only value: ${candidate.visual_argument.visual_only_value}\n- Hero: ${candidate.hero_hypothesis.explanatory_structure}\n- Guardrails: ${(candidate.guardrails as RecordValue).forbidden_assertions as string[] | string}\n- Risks: ${(candidate.risks as string[]).join("；")}\n`).join("\n");
    return `## ${page.source_page_id}\n\n**Question:** ${page.page_question}\n\n**Takeaway:** ${page.takeaway}\n\n${candidatesText}\n**Pass B selection:** ${choice.selected_candidate_id} (${choice.selected_mode})\n\n${choice.selection_rationale}\n\n**Non-selections:**\n${(choice.non_selected_rationales as RecordValue[]).map((value) => `- ${value.candidate_id}: ${value.rationale}`).join("\n")}\n`;
  }).join("\n");
  return `# Sprint 05 Visual Reasoning — Human Art-Direction Review\n\n- Candidate cache key: ${candidates.visual_candidates_cache_key}\n- Frozen candidates SHA-256: ${candidates.frozen_candidates_sha256}\n- Selection cache key: ${selected.selection_cache_key}\n- Gate: ${gate.status}\n\nPass A inventory is frozen. Pass B selected only from that inventory; no candidate ranking/winner was supplied by Pass A.\n\n${body}\n\n## Package repetition review\n\n${JSON.stringify(selected.package_repetition_review, null, 2)}\n\n## Review prompts\n\n- Does every chosen Hero Diagram add visual-only explanatory value beyond article layout?\n- Are all rejected relations and parallel contexts preserved without directional/causal invention?\n- Is each Wildcard a real evidence-bounded exploration rather than style variation?\n- Does the package retain useful diversity without sacrificing the question's clarity?\n`;
}
