import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import { validateArtifact } from "./validate.js";
type R = Record<string, any>;
export const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export const canonical = (value: unknown) => digest(JSON.stringify(value));
export const readJson = (path: string): R => JSON.parse(readFileSync(path, "utf8"));
const requireValue = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const artifact = (workspace: string, ref: R) => {
  const path = resolve(workspace, ref.path);
  requireValue(digest(readFileSync(path)) === ref.sha256, `导入引用已变化：${ref.path}`);
  return path;
};
const localArtifact = (workspace: string, ref: R) => {
  const path = artifact(workspace, ref), rel = relative(resolve(workspace), path);
  requireValue(!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../"), "导入工件必须位于当前工作区");
  return path;
};
const detail = (gate: R, name: string) => gate.checks.find((c: R) => c.name === name)?.details ?? {};
export const IMPORT_INPUTS: Record<string, string> = {
  episode_metadata: "00-source/episode_metadata.json", content_review_gate: "01-understanding/content_review_gate.json",
  content_split_gate: "01-understanding/content_split_gate.json", knowledge_graph: "01-understanding/knowledge_graph.json",
  knowledge_gate: "01-understanding/knowledge_gate.json", editorial_plan: "01-understanding/editorial_plan.json",
  editorial_gate: "01-understanding/editorial_gate.json", coverage_matrix: "01-understanding/coverage_matrix.json",
  design_tokens: "design_tokens.json",
};

// 显式导入只继承可核验的当前批准工件，不重建三案历史或箭头绑定。
export function verifyImportRecord(workspace: string, record: R, requireEditor = true): void {
  validateArtifact("accepted_artwork_import", record);
  const authorization = readJson(artifact(workspace, record.authorization));
  requireValue(authorization.authorized === true && authorization.scope === "accepted_native_artwork_import", "缺少显式原生图导入授权");
  for (const [key, path] of Object.entries(IMPORT_INPUTS)) requireValue(record.input_hashes[key] === canonical(readJson(join(workspace, path))), `导入上游已变化：${key}`);
  const editorial = readJson(join(workspace, IMPORT_INPUTS.editorial_plan));
  const editorialPages: R[] = [editorial.package.cover, editorial.package.overview, ...(editorial.package.overview_continuations ?? []), ...editorial.package.deep_dives];
  requireValue(record.pages.length === editorialPages.length && record.pages.length <= 18, "导入页数与当前规划不符");
  const ids = new Set<string>(), sourceIds = new Set<string>(); let boundCount = 0;
  for (const page of record.pages as R[]) {
    requireValue(editorialPages[ids.size]?.page_id === page.source_page_id, "导入页序与当前批准规划不符");
    requireValue(!ids.has(page.page_id) && !sourceIds.has(page.source_page_id), "导入页号重复"); ids.add(page.page_id); sourceIds.add(page.source_page_id);
    requireValue(editorialPages.some(p => p.page_id === page.source_page_id), `导入页缺少规划来源：${page.page_id}`);
    const paths: R = {};
    for (const key of ["scene", "png", "phone", "gray"]) paths[key] = localArtifact(workspace, page.artifacts[key]);
    const scene = readJson(paths.scene), elements = scene.elements.filter((e: R) => !e.isDeleted);
    requireValue(scene.type === "excalidraw" && Object.keys(scene.files ?? {}).length === 0 && !elements.some((e: R) => e.type === "image"), "导入必须为无嵌入位图的原生Excalidraw");
    for (const e of elements.filter((e: R) => e.type === "arrow")) {
      requireValue(Array.isArray(e.points) && e.points.length >= 2, "自由箭头缺少真实点列");
      if (e.startBinding || e.endBinding) boundCount++;
    }
    if (page.selection_mode === "authorized_single_case") {
      const exception = readJson(artifact(workspace, page.single_case_authorization));
      requireValue(exception.authorized === true && exception.allowed_cases === 1 && exception.page_ids.includes(page.page_id), "单案缺少本页明确例外授权");
    }
    const selection = readJson(artifact(workspace, page.selection_approval));
    requireValue(selection.accepted === true || selection.user_accepted === true || selection.user_approved === true || selection.user_selection_confirmed === true || selection.status === "accepted", "选择证据未获用户批准");
    if (selection.page_id) requireValue(selection.page_id === page.page_id, "选择证据页号不符");
    if (selection.pages) requireValue(selection.pages[page.page_id], "联合批准未覆盖当前页");
    const selected = selection.selected_case ?? selection.case;
    if (selected) requireValue(selected === page.selected_case, "选择证据与导入案号不符");
    const gate = readJson(artifact(workspace, page.proof.gate));
    const manifest = readJson(artifact(workspace, page.proof.manifest));
    const review = readJson(artifact(workspace, page.proof.review));
    const approval = readJson(artifact(workspace, page.proof.approval));
    for (const [name, value] of [["render_gate", gate], ["render_manifest", manifest], ["independent_visual_review", review], ["human_approval", approval]] as [any, R][]) validateArtifact(name, value);
    requireValue(gate.status === "pass" && gate.checks.every((c: R) => c.status === "pass") && !gate.human_review_required && !gate.independent_review_required, "单页正式门禁未完整通过");
    requireValue(gate.render_manifest_sha256 === canonical(manifest) && review.render_manifest_sha256 === canonical(manifest), "单页清单绑定失效");
    requireValue(detail(gate, "independent_visual_review").review_sha256 === canonical(review) && detail(gate, "original_phone_grayscale_review").user_approval_sha256 === canonical(approval), "单页审核或审批绑定失效");
    const rendered = manifest.pages.find((p: R) => p.page_id === page.page_id), reviewed = review.pages.find((p: R) => p.page_id === page.page_id);
    requireValue(rendered && reviewed && reviewed.verdict === "TARGET" && review.reviewer_context === "isolated_read_only", "导入缺少当前完整隔离TARGET");
    requireValue(approval.stage === "visual_page" && approval.status === "accepted" && approval.artifact_hashes[page.page_id] === page.artifacts.png.sha256, "导入缺少当前图用户批准");
    for (const [key, field] of [["scene", "scene_sha256"], ["png", "png_sha256"], ["phone", "phone_png_sha256"], ["gray", "grayscale_png_sha256"]]) requireValue(rendered[field] === page.artifacts[key].sha256, `单页四工件不符：${key}`);
    requireValue(reviewed.png_sha256 === page.artifacts.png.sha256, "独立报告未绑定当前PNG");
  }
  if (!requireEditor) return;
  requireValue(record.editor_review, "缺少真实编辑器操作记录");
  const editor = readJson(artifact(workspace, record.editor_review));
  requireValue(editor.kind === "native_editor_interaction_review" && editor.status === "pass", "编辑器操作检查未通过");
  requireValue(editor.pages.length === record.pages.length, "编辑器未打开全部当前页");
  for (const page of record.pages as R[]) {
    const inspected = editor.pages.find((p: R) => p.page_id === page.page_id);
    requireValue(inspected?.opened === true && inspected.scene_sha256 === page.artifacts.scene.sha256, `编辑检查未绑定当前页：${page.page_id}`);
    const screenshot = artifact(workspace, inspected.screenshot);
    requireValue(readFileSync(screenshot).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "编辑器打开证据必须为真实PNG截图");
  }
  for (const name of ["edit_text", "move_group_and_object", "edit_free_arrow", "inspect_wrapping_and_collisions", "inspect_hero_and_guardrails"]) {
    const check = editor.checks.find((c: R) => c.name === name);
    requireValue(check?.status === "pass" && check.evidence.length > 0, `编辑检查缺失：${name}`);
    for (const ref of check.evidence) artifact(workspace, ref);
  }
  const bound = editor.checks.find((c: R) => c.name === "move_bound_arrow");
  requireValue(bound && (bound.status === "pass" || (bound.status === "not_applicable" && boundCount === 0 && editor.bound_arrow_count === 0)), "绑定箭头检查不可跳过");
  if (bound.status === "pass") { requireValue(bound.evidence.length > 0, "绑定联动无证据"); for (const ref of bound.evidence) artifact(workspace, ref); }
  for (const name of ["edit_text", "move_object", "move_group", "edit_free_arrow"]) {
    const operation = editor.operations?.find((op: R) => op.name === name);
    requireValue(operation && operation.element_ids.length > 0, `缺少实际编辑前后导出：${name}`);
    const page = record.pages.find((p: R) => p.page_id === operation.page_id);
    requireValue(page, "编辑操作不属于当前页");
    const approved = readJson(join(workspace, page.artifacts.scene.path));
    const before = readJson(artifact(workspace, operation.before)), after = readJson(artifact(workspace, operation.after));
    requireValue(after.type === "excalidraw" && Array.isArray(after.elements) && Object.keys(after.files ?? {}).length === 0, "编辑结果不是原生场景导出");
    const pairs = operation.element_ids.map((id: string) => {
      const original = approved.elements.find((e: R) => e.id === id), a = before.elements.find((e: R) => e.id === id), z = after.elements.find((e: R) => e.id === id);
      requireValue(original && a && z && !z.isDeleted, "编辑导出缺少目标图元");
      requireValue(original.text === a.text && original.x === a.x && original.y === a.y && canonical(original.points ?? null) === canonical(a.points ?? null), "编辑前状态不对应批准图元");
      return [a, z];
    });
    if (name === "edit_text") requireValue(pairs.some(([a, z]: R[]) => a.type === "text" && a.text !== z.text), "改字操作没有文字变化");
    else requireValue(pairs.every(([a, z]: R[]) => a.x !== z.x || a.y !== z.y || (name === "edit_free_arrow" && canonical(a.points) !== canonical(z.points))), "拖动或箭头编辑没有实际变化");
    if (name === "edit_free_arrow") requireValue(pairs.every(([a]: R[]) => a.type === "arrow" && !a.startBinding && !a.endBinding), "自由箭头编辑对象不符");
    if (name === "move_group") requireValue(pairs.length >= 2 && pairs[0][0].groupIds.some((g: string) => pairs.every(([a]: R[]) => a.groupIds.includes(g))), "组移动缺少同组多个图元");
  }
}

export function verifyAcceptedImport(workspace: string): R {
  const record = readJson(join(workspace, "02-visual-plan/accepted_artwork_import.json")); verifyImportRecord(workspace, record);
  const visual = readJson(join(workspace, "02-visual-plan/visual_gate.json"));
  const spec = readJson(join(workspace, "02-visual-plan/construction_spec.json"));
  const plan = readJson(join(workspace, "03-excalidraw/construction_plan.json"));
  const manifest = readJson(join(workspace, "03-excalidraw/scene_manifest.json"));
  const rendered = readJson(join(workspace, "04-rendered/render_manifest.json"));
  const gate = readJson(join(workspace, "03-excalidraw/construction_gate.json"));
  validateArtifact("scene_manifest", manifest); validateArtifact("render_manifest", rendered); validateArtifact("construction_gate", gate);
  requireValue(visual.kind === "accepted_artwork_visual_gate" && visual.status === "pass" && visual.accepted_artwork_import_sha256 === canonical(record), "导入视觉门禁失效");
  requireValue(spec.kind === "accepted_native_construction_spec" && plan.kind === "accepted_native_construction_plan" && spec.accepted_artwork_import_sha256 === canonical(record) && plan.construction_spec_sha256 === canonical(spec), "导入构图记录失效");
  requireValue(gate.status === "pass" && gate.checks.every((c: R) => c.status === "pass") && gate.construction_plan_sha256 === canonical(plan) && gate.scene_manifest_sha256 === canonical(manifest) && rendered.scene_manifest_sha256 === canonical(manifest), "导入共享构图绑定失效");
  const approval = readJson(join(workspace, "03-excalidraw/construction_human_approval.json"));
  validateArtifact("human_approval", approval);
  requireValue(approval.stage === "construction" && approval.status === "accepted" && approval.artifact_hashes.construction_plan === canonical(plan) && approval.artifact_hashes.scene_manifest === canonical(manifest) && approval.artifact_hashes.editor_review === record.editor_review.sha256, "实际编辑检查与构图批准绑定不符");
  requireValue(manifest.pages.length === record.pages.length && rendered.pages.length === record.pages.length && spec.pages.length === record.pages.length, "导入共享清单不完整");
  for (const page of record.pages as R[]) {
    const m = manifest.pages.find((p: R) => p.page_id === page.page_id), s = spec.pages.find((p: R) => p.page_id === page.page_id), p = rendered.pages.find((p: R) => p.page_id === page.page_id);
    requireValue(m?.sha256 === page.artifacts.scene.sha256 && m.file === page.artifacts.scene.path && canonical(s?.native_scene) === canonical(readJson(join(workspace, m.file))), "导入原生构图快照不符");
    for (const [key, field, hashField] of [["scene", "", "scene_sha256"], ["png", "png", "png_sha256"], ["phone", "phone_png", "phone_png_sha256"], ["gray", "grayscale_png", "grayscale_png_sha256"]]) requireValue(p && p[hashField] === page.artifacts[key].sha256 && (!field || p[field] === page.artifacts[key].path), "导入渲染清单与原批准工件不符");
  }
  return record;
}
