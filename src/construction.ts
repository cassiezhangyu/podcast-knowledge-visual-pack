import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { PipelineError } from "./contracts.js";
import { validateArtifact } from "./validate.js";

type R = Record<string, unknown>;
export type PageSpec = {
  page_id: string;
  page_kind: "cover" | "overview" | "deep_dive";
  display_order: number;
  grammar: string;
  composition_intent: R;
  selected_candidate_id: string | null;
  semantic_guardrails: string[];
  elements: R[];
  brand_asset?: { relative_path: string; sha256: string; x: number; y: number; width: number; height: number };
};
type Page = { page_id: string; page_kind: PageSpec["page_kind"]; selected?: R; specification: PageSpec };

const require = createRequire(import.meta.url);
const PACKAGE = JSON.parse(readFileSync(join(dirname(require.resolve("@excalidraw/excalidraw")), "..", "..", "package.json"), "utf8")) as { version: string };
const PAGE = { width: 1200, height: 1600, margin: 76 };
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const write = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
};
const fail = (message: string, details?: R): never => {
  throw new PipelineError("CONSTRUCTION_INPUT_INVALID", "construction", message, false, details);
};
const seed = (key: string) => Number.parseInt(hash(key).slice(0, 8), 16);

export function validateAlbumArt(specs: PageSpec[], policy?: string, box?: { x: number; y: number; width: number; height: number }) {
  for (const spec of specs) {
    const brand = spec.brand_asset;
    if (!brand) {
      if (policy === "all_pages") fail("每页必须声明官方专辑封面。", { page_id: spec.page_id });
      continue;
    }
    if (![brand.x, brand.y, brand.width, brand.height].every(Number.isFinite) || brand.x < 0 || brand.y < 0 || brand.width <= 0 || brand.height <= 0 || brand.x + brand.width > PAGE.width || brand.y + brand.height > PAGE.height) fail("官方专辑封面超出画布或尺寸无效。", { page_id: spec.page_id });
    if (policy === "all_pages") {
      const first = specs[0].brand_asset;
      if (!first || brand.relative_path !== first.relative_path || brand.sha256 !== first.sha256) fail("同一材料包必须使用同一官方专辑封面。", { page_id: spec.page_id });
      if (box && ["x", "y", "width", "height"].some(key => brand[key as keyof typeof box] !== box[key as keyof typeof box])) fail("官方专辑封面位置与尺寸不符合当前设计参数。", { page_id: spec.page_id });
    }
  }
}

function inputs(workspace: string) {
  const source = join(workspace, "00-source");
  const understanding = join(workspace, "01-understanding");
  const visual = join(workspace, "02-visual-plan");
  const metadata = read<R>(join(source, "episode_metadata.json"));
  const editorial = read<R>(join(understanding, "editorial_plan.json"));
  const selected = read<R>(join(visual, "selected_visual_plan.json"));
  const candidates = read<R>(join(visual, "visual_candidates.json"));
  const gate = read<R>(join(visual, "visual_gate.json"));
  const specification = read<R>(join(visual, "construction_spec.json"));
  const tokens = read<R>(join(process.cwd(), "design_tokens.json"));
  validateArtifact("episode_metadata", metadata);
  validateArtifact("editorial_plan", editorial);
  validateArtifact("selected_visual_plan", selected);
  validateArtifact("visual_candidates", candidates);
  validateArtifact("visual_gate", gate);
  validateArtifact("construction_spec", specification);
  if (gate.status !== "pass") fail("Visual Gate must have Human Art-Direction approval before construction.", { status: gate.status });
  if (selected.frozen_candidates_sha256 !== candidates.frozen_candidates_sha256 || gate.selected_visual_plan_sha256 !== hash(selected) || gate.visual_candidates_sha256 !== hash(candidates)) fail("Accepted visual input hash linkage changed.");
  const expected: R = {
    episode_metadata_sha256: hash(metadata),
    editorial_plan_sha256: hash(editorial),
    selected_visual_plan_sha256: hash(selected),
    visual_gate_sha256: hash(gate),
    design_tokens_sha256: hash(tokens),
  };
  for (const [key, value] of Object.entries(expected)) if ((specification.input as R)[key] !== value) fail("Construction specification input hash changed.", { key });
  return { metadata, editorial, selected, candidates, gate, specification, tokens };
}

function expectedPageIds(editorial: R) {
  const packageValue = editorial.package as R;
  const overview = packageValue.overview as R;
  const deep = packageValue.deep_dives as R[];
  const continuations = (packageValue.overview_continuations as R[] | undefined) ?? [];
  return ["cover", overview.page_id as string, ...continuations.map((page) => page.page_id as string), ...deep.map((page) => page.page_id as string)];
}

function resolvePages(state: ReturnType<typeof inputs>): Page[] {
  const specs = (state.specification.pages as PageSpec[]).slice().sort((a, b) => a.display_order - b.display_order);
  const expected = expectedPageIds(state.editorial);
  if (specs.map((page) => page.page_id).join("|") !== expected.join("|")) fail("Construction pages do not match the approved editorial package.", { expected, actual: specs.map((page) => page.page_id) });
  if (specs[0]?.page_kind !== "cover" || specs[0]?.display_order !== 0 || specs[0]?.selected_candidate_id !== null) fail("The first construction page must be the cover with no visual candidate id.");
  const brandSettings = (state.tokens.cover as R)?.brand_asset as R | undefined;
  validateAlbumArt(specs, state.specification.album_art_policy as string | undefined, brandSettings?.box as { x: number; y: number; width: number; height: number } | undefined);
  const byCandidate = new Map((state.candidates.pages as R[]).flatMap((page) => (page.candidates as R[]).map((candidate) => [candidate.candidate_id as string, candidate])));
  const selections = state.selected.selections as R[];
  return specs.map((spec) => {
    if (spec.page_kind === "cover") return { page_id: spec.page_id, page_kind: spec.page_kind, specification: spec };
    const selection = selections.find((item) => item.source_page_id === spec.page_id);
    if (!selection || selection.selected_candidate_id !== spec.selected_candidate_id) fail("Construction page does not use the approved visual candidate.", { page_id: spec.page_id });
    const selected = byCandidate.get(spec.selected_candidate_id!);
    if (!selected) fail("Selected visual candidate is missing.", { page_id: spec.page_id });
    return { page_id: spec.page_id, page_kind: spec.page_kind, selected, specification: spec };
  });
}

function materialize(raw: R, pageId: string): R {
  const type = raw.type as string;
  const id = `${pageId}:${raw.id as string}`;
  const points = (raw.points as number[][] | undefined) ?? [[0, 0], [raw.width as number, raw.height as number]];
  const element: R = {
    id, type, x: raw.x, y: raw.y, width: raw.width, height: raw.height, angle: 0,
    strokeColor: raw.stroke_color ?? "#4B6F8D", backgroundColor: raw.background_color ?? "transparent",
    fillStyle: "solid", strokeWidth: raw.stroke_width ?? 2, strokeStyle: "solid",
    roughness: raw.roughness ?? (type === "text" ? 0 : 1.25), opacity: 100,
    groupIds: ((raw.group_ids as string[] | undefined) ?? []).map((group) => `${pageId}:${group}`), frameId: null, index: id,
    roundness: type === "rectangle" || type === "ellipse" ? { type: 3 } : null,
    seed: seed(id), version: 1, versionNonce: seed(`${id}:version`), isDeleted: false,
    boundElements: null, updated: 1, link: null, locked: false,
    customData: { role: raw.role, mapping_index: raw.mapping_index, source_ids: raw.source_ids ?? [], assertion: raw.assertion },
  };
  if (type === "text") Object.assign(element, { text: raw.text, originalText: raw.text, fontSize: raw.font_size, fontFamily: 2, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: false, lineHeight: 1.25 });
  if (type === "line" || type === "arrow") Object.assign(element, { points, lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: type === "arrow" ? "arrow" : null, roundness: null });
  if (type === "arrow") Object.assign(element, { startBinding: { elementId: `${pageId}:${raw.start_element_id}`, focus: 0, gap: 6 }, endBinding: { elementId: `${pageId}:${raw.end_element_id}`, focus: 0, gap: 6 } });
  return element;
}

export function materializePageElements(spec: PageSpec) {
  const background = materialize({ id: "canvas-background", type: "rectangle", x: 0, y: 0, width: 1200, height: 1600, role: "canvas_background", stroke_color: "#FFFFFF", background_color: "#FFFFFF", stroke_width: 1, roughness: 0 }, spec.page_id);
  background.locked = true;
  const elements = [background, ...spec.elements.map((raw) => materialize(raw, spec.page_id))];
  const ids = new Set(elements.map((element) => element.id as string));
  if (ids.size !== elements.length) fail("Construction specification contains duplicate element ids.", { page_id: spec.page_id });
  const byId = new Map(elements.map((element) => [element.id as string, element]));
  for (const arrow of elements.filter((element) => element.type === "arrow")) {
    for (const binding of [arrow.startBinding, arrow.endBinding] as R[]) {
      const target = byId.get(binding.elementId as string);
      if (!target || target.type === "text") fail("Arrow endpoint must be a native non-text object.", { page_id: spec.page_id, arrow: arrow.id, endpoint: binding.elementId });
      target!.boundElements = [...((target!.boundElements as R[] | null) ?? []), { id: arrow.id, type: "arrow" }];
    }
  }
  elements.forEach((element, index) => { element.index = `a${String(index).padStart(3, "0")}`; });
  return elements;
}

function validateScene(scene: R, page: Page) {
  const elements = scene.elements as R[];
  if (scene.type !== "excalidraw" || scene.version !== 2 || !Array.isArray(elements) || !elements.length) fail("Invalid persisted Excalidraw v2 scene.", { page_id: page.page_id });
  const ids = new Set<string>();
  const byId = new Map<string, R>();
  const groups = new Map<string, number>();
  for (const element of elements) {
    const id = element.id as string, type = element.type as string;
    if (!id || ids.has(id) || !["text", "rectangle", "ellipse", "arrow", "line"].includes(type)) fail("Duplicate ID or unsupported element.", { page_id: page.page_id, id });
    ids.add(id); byId.set(id, element);
    for (const group of element.groupIds as string[]) groups.set(group, (groups.get(group) ?? 0) + 1);
    const x = element.x as number, y = element.y as number, width = element.width as number, height = element.height as number;
    const isCanvas = (element.customData as R)?.role === "canvas_background";
    if (![x, y, width, height].every(Number.isFinite) || (!isCanvas && (x < PAGE.margin || y < PAGE.margin || x + width > PAGE.width - PAGE.margin || y + height > PAGE.height - PAGE.margin)) || (isCanvas && (x !== 0 || y !== 0 || width !== PAGE.width || height !== PAGE.height))) fail("Element exceeds the intended page region.", { page_id: page.page_id, id });
    if (type === "text" && (!(element.text as string)?.trim() || width <= 0 || height <= 0)) fail("Text region is empty or invalid.", { page_id: page.page_id, id });
  }
  for (const [group, count] of groups) if (count < 2) fail("Group has no movable cluster.", { page_id: page.page_id, group });
  const arrows = elements.filter((element) => element.type === "arrow");
  for (const arrow of arrows) for (const binding of [arrow.startBinding, arrow.endBinding] as R[]) {
    const target = byId.get(binding?.elementId as string);
    if (!target || target.type === "text" || !(target.boundElements as R[] | null)?.some((reference) => reference.id === arrow.id)) fail("Arrow binding is invalid or not reciprocal.", { page_id: page.page_id, arrow: arrow.id });
  }
  const texts = elements.filter((element) => element.type === "text");
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if ((a.x as number) < (b.x as number) + (b.width as number) && (b.x as number) < (a.x as number) + (a.width as number) && (a.y as number) < (b.y as number) + (b.height as number) && (b.y as number) < (a.y as number) + (a.height as number)) fail("Text regions overlap.", { page_id: page.page_id, first: a.id, second: b.id });
  }
  if (page.page_kind !== "cover" && !elements.some((element) => (element.customData as R)?.role === "hero_root")) fail("Inner page has no explicit hero_root.", { page_id: page.page_id });
  const mappings = page.page_kind === "cover" ? [] : ((page.selected!.visual_argument as R).visual_semantic_mappings as R[]);
  mappings.forEach((mapping, index) => {
    const mapped = elements.filter((element) => (element.customData as R)?.mapping_index === index);
    if (!mapped.length || mapped.some((element) => JSON.stringify((element.customData as R).source_ids) !== JSON.stringify(mapping.source_ids) || (element.customData as R).assertion !== mapping.assertion)) fail("Accepted source mapping is absent or changed.", { page_id: page.page_id, index });
  });
  return { elements: elements.length, mappings: mappings.length, bindings: arrows.length * 2, groups: groups.size, text_regions: texts.length };
}

export function validatePersistedScene(scenePath: string, page: Page) { return validateScene(read<R>(scenePath), page); }

export async function construct(workspace: string, onlyPages?: string[]) {
  const state = inputs(workspace), pages = resolvePages(state), out = join(workspace, "03-excalidraw");
  if (onlyPages?.some((id) => !pages.some((page) => page.page_id === id))) fail("Unknown page requested for scoped construction.");
  if (onlyPages && new Set(onlyPages).size !== onlyPages.length) fail("Duplicate page requested for scoped construction.");
  mkdirSync(out, { recursive: true });
  const planPages: R[] = [], manifestPages: R[] = [], checks: R[] = [];
  for (const page of pages) {
    if (onlyPages && !onlyPages.includes(page.page_id)) continue;
    const elements = materializePageElements(page.specification);
    const name = `${String(page.specification.display_order).padStart(2, "0")}-${page.page_kind === "cover" ? "cover" : page.page_id.replace(/^edp_/, "")}.excalidraw`;
    const scenePath = join(out, name);
    write(scenePath, { type: "excalidraw", version: 2, source: "podcast-knowledge-skill-v0.2", elements, appState: { gridSize: null, viewBackgroundColor: "#FFFFFF" }, files: {} });
    const result = validatePersistedScene(scenePath, page), fileHash = hash(readFileSync(scenePath, "utf8"));
    const mappings = page.page_kind === "cover" ? [] : ((page.selected!.visual_argument as R).visual_semantic_mappings as R[]).map((mapping, index) => ({ index, source_ids: mapping.source_ids, element_ids: elements.filter((element) => (element.customData as R)?.mapping_index === index).map((element) => element.id) }));
    planPages.push({ page_id: page.page_id, scene_key: name, grammar: page.specification.grammar, composition_intent: page.specification.composition_intent, selected_candidate_id: page.specification.selected_candidate_id, source_mappings: mappings, semantic_guardrails: page.specification.semantic_guardrails });
    manifestPages.push({ page_id: page.page_id, file: relative(workspace, scenePath), sha256: fileHash, element_count: result.elements, source_mappings: mappings, element_index: elements.map((element) => ({ element_id: element.id, role: (element.customData as R)?.role ?? "page_chrome", group_ids: element.groupIds })), composition_fingerprint: hash({ grammar: page.specification.grammar, intent: page.specification.composition_intent, elements: page.specification.elements }) });
    checks.push({ name: `persisted_native_scene:${page.page_id}`, status: "pass", details: { sha256: fileHash, ...result } });
  }
  const constructionPlan: R = { schema_version: "1.0", kind: "construction_plan", status: "completed", construction_plan_id: `cp_${hash(planPages).slice(0, 20)}`, input: { selected_visual_plan_sha256: hash(state.selected), visual_gate_sha256: hash(state.gate), design_tokens_sha256: hash(state.tokens), construction_spec_sha256: hash(state.specification) }, pages: planPages, created_at: new Date().toISOString() };
  const manifest: R = { schema_version: "1.0", kind: "scene_manifest", status: "completed", adapter: { package: "@excalidraw/excalidraw", version: PACKAGE.version, format_version: 2 }, pages: manifestPages, created_at: new Date().toISOString() };
  validateArtifact("construction_plan", constructionPlan); validateArtifact("scene_manifest", manifest);
  checks.push({ name: "human_construction_review", status: "needs_human_review", details: { required: ["open_all_scenes", "edit_text", "move_group_and_object", "move_bound_arrow", "inspect_wrapping_and_collisions", "inspect_hero_and_guardrails"] } });
  const gate: R = { schema_version: "1.0", kind: "construction_gate", status: "needs_human_review", construction_plan_sha256: hash(constructionPlan), scene_manifest_sha256: hash(manifest), checks, human_review_required: true };
  validateArtifact("construction_gate", gate);
  write(join(out, "construction_plan.json"), constructionPlan);
  write(join(out, "scene_manifest.json"), manifest);
  write(join(out, "construction_gate.json"), gate);
  write(join(out, "construction_review.md"), `# Construction Review\n\nGate: **needs_human_review**。构图来自与本期内容绑定的 construction_spec.json；机器检查不能替代真实渲染与人工视觉审核。\n\n${manifestPages.map((page) => `## ${page.page_id}\n\n- Scene: \`${page.file}\`\n- SHA-256: \`${page.sha256}\`\n- Native elements: ${page.element_count}\n- Candidate: \`${planPages.find((item) => item.page_id === page.page_id)?.selected_candidate_id ?? "content_driven_cover"}\`\n- Source mappings: ${JSON.stringify(page.source_mappings)}`).join("\n\n")}`);
  return { status: gate.status, output: out, scenes: manifestPages.length, gate };
}
