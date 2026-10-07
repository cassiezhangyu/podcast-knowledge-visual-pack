import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonical, readJson, verifyAcceptedImport, verifyImportRecord } from "./accepted-artwork-import.js";
import { validateArtifact } from "./validate.js";
const args = process.argv.slice(2), value = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const workspace = value("--workspace"), input = value("--input"), editor = value("--editor-review");
const reviewPath = value("--review");
if (!workspace || (!input && !reviewPath)) { console.error("用法：accepted-artwork:import --workspace <工作区> --input <真实批准工件清单> [--editor-review <实际编辑器检查>]；冻结清单后用 --review <整包只读审核> 合并绑定"); process.exit(2); }
try {
  const write = (relative: string, value: unknown) => { const path = join(workspace, relative); mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + "\n"); };
  const now = new Date().toISOString();
  if (reviewPath) {
    const record = verifyAcceptedImport(workspace), manifest = readJson(join(workspace, "04-rendered/render_manifest.json")), review = readJson(reviewPath);
    validateArtifact("independent_visual_review", review);
    if (review.render_manifest_sha256 !== canonical(manifest) || review.pages.length !== record.pages.length) throw new Error("共享审核未绑定当前冻结清单");
    const seen = new Set<string>(); const hashes: Record<string, string> = { render_manifest: canonical(manifest) };
    for (const page of record.pages) {
      const current = review.pages.find((p: any) => p.page_id === page.page_id);
      const original = readJson(page.proof.review.path).pages.find((p: any) => p.page_id === page.page_id);
      if (!current || seen.has(current.page_id) || current.verdict !== "TARGET" || current.png_sha256 !== page.artifacts.png.sha256 || current.review_packet_sha256 !== original.review_packet_sha256) throw new Error("共享审核与真实单页报告/批准不符");
      seen.add(current.page_id); hashes[page.page_id] = page.artifacts.png.sha256;
    }
    const approval = { schema_version: "1.0", kind: "human_approval", stage: "visual_page", status: "accepted", artifact_hashes: hashes, reviewed_by: "user：当前各页既有明确批准的合并绑定", reviewed_at: now, note: "不新增或代签验收；全部图片与逐页批准保持原字节，原批准及隔离审核出处保存在accepted_artwork_import.json。" };
    validateArtifact("human_approval", approval);
    const gate = { schema_version: "1.0", kind: "render_gate", status: "pass", render_manifest_sha256: canonical(manifest), checks: [{ name: "same_scene_real_png_export", status: "pass", details: { pages: record.pages.length, import_sha256: canonical(record) } }, { name: "original_phone_grayscale_review", status: "pass", details: { user_approval_sha256: canonical(approval) } }, { name: "independent_visual_review", status: "pass", details: { review_sha256: canonical(review), verdict: "TARGET", scope: "既有完整审核核验与当前整包横审合并，非补造历史制作" } }], human_review_required: false, independent_review_required: false };
    validateArtifact("render_gate", gate); write("04-rendered/independent_visual_review.json", review); write("04-rendered/visual_page_human_approval.json", approval); write("04-rendered/render_gate.json", gate);
    console.log(JSON.stringify({ status: "pass", gate: "shared_import_render", pages: record.pages.length })); process.exit(0);
  }
  const record = readJson(input!); if (editor) { const { digest } = await import("./accepted-artwork-import.js"); record.editor_review = { path: editor, sha256: digest(readFileSync(editor)) }; }
  verifyImportRecord(workspace, record, !!editor);
  const scenes = record.pages.map((p: any) => {
    const scene = readJson(join(workspace, p.artifacts.scene.path));
    const elements = scene.elements.filter((e: any) => !e.isDeleted);
    return { page_id: p.page_id, file: p.artifacts.scene.path, sha256: p.artifacts.scene.sha256, element_count: elements.length,
      source_mappings: [{ source_page_id: p.source_page_id, meaning: "当前获批页面与内容规划对应；按原生图导入，不追认历史构图过程" }],
      element_index: elements.map((e: any) => ({ id: e.id, type: e.type, group_ids: e.groupIds ?? [] })), composition_fingerprint: canonical(elements.map((e: any) => [e.id, e.type, e.x, e.y, e.width, e.height])) };
  });
  const sceneManifest = { schema_version: "1.0", kind: "scene_manifest", status: "completed", adapter: { package: "@excalidraw/excalidraw", version: record.adapter_version, format_version: 2, mode: "frozen_native_import" }, pages: scenes, created_at: now };
  const renderManifest = { schema_version: "1.0", kind: "render_manifest", status: "completed", scene_manifest_sha256: canonical(sceneManifest), pages: record.pages.map((p: any) => ({ page_id: p.page_id, scene_sha256: p.artifacts.scene.sha256, png: p.artifacts.png.path, png_sha256: p.artifacts.png.sha256, phone_png: p.artifacts.phone.path, phone_png_sha256: p.artifacts.phone.sha256, grayscale_png: p.artifacts.gray.path, grayscale_png_sha256: p.artifacts.gray.sha256 })), created_at: now };
  validateArtifact("scene_manifest", sceneManifest); validateArtifact("render_manifest", renderManifest);
  const spec = { schema_version: "1.0", kind: "accepted_native_construction_spec", status: "completed", accepted_artwork_import_sha256: canonical(record), pages: record.pages.map((p: any) => ({ page_id: p.page_id, source_page_id: p.source_page_id, native_scene: readJson(join(workspace, p.artifacts.scene.path)) })) };
  const plan = { schema_version: "1.0", kind: "accepted_native_construction_plan", status: "completed", construction_spec_sha256: canonical(spec), pages: scenes.map((p: any) => ({ page_id: p.page_id, scene_sha256: p.sha256 })), created_at: now };
  const gate = { schema_version: "1.0", kind: "construction_gate", status: editor ? "pass" : "needs_human_review", construction_plan_sha256: canonical(plan), scene_manifest_sha256: canonical(sceneManifest), checks: [{ name: "approved_native_assets_and_current_source_binding", status: "pass", details: { import_sha256: canonical(record) } }, { name: "real_editor_interaction_review", status: editor ? "pass" : "needs_human_review", details: editor ? record.editor_review : { required: true } }], human_review_required: !editor };
  validateArtifact("construction_gate", gate);
  write("02-visual-plan/accepted_artwork_import.json", record); write("02-visual-plan/construction_spec.json", spec);
  write("02-visual-plan/visual_gate.json", { schema_version: "1.0", kind: "accepted_artwork_visual_gate", status: "pass", accepted_artwork_import_sha256: canonical(record), scope: "只继承当前完整TARGET及已绑定用户验收；不追认三案历史" });
  write("03-excalidraw/construction_plan.json", plan); write("03-excalidraw/scene_manifest.json", sceneManifest); write("03-excalidraw/construction_gate.json", gate); write("04-rendered/render_manifest.json", renderManifest);
  if (editor) write("03-excalidraw/construction_human_approval.json", { schema_version: "1.0", kind: "human_approval", stage: "construction", status: "accepted", artifact_hashes: { construction_plan: canonical(plan), scene_manifest: canonical(sceneManifest), editor_review: record.editor_review.sha256 }, reviewed_by: "Codex：用户授权的真实编辑器交互检查", reviewed_at: now, note: "检查记录明确由Codex执行，不冒称用户亲自操作；工件不变。整包仍需当前材料验收。" });
  console.log(JSON.stringify({ status: editor ? "pass" : "needs_editor_review", pages: record.pages.length }));
} catch (error) { console.error(JSON.stringify({ status: "fail", message: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; }
