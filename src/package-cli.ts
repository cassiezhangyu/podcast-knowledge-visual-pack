import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { PipelineError } from "./contracts.js";
import { validateArtifact } from "./validate.js";
import { verifyAcceptedImport } from "./accepted-artwork-import.js";
type R = Record<string, unknown>;
const args = process.argv.slice(2), value = (name: string) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
const workspace = value("--workspace"), action = value("--action") ?? "assemble";
if (!workspace || !["assemble", "approve"].includes(action)) { console.error("Usage: npm run package -- --workspace <episode-workspace> [--action <assemble|approve>] [--reviewed-by name] [--note text]"); process.exit(2); }
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const hashBuffer = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const hashJson = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const hashText = (value: string) => createHash("sha256").update(value).digest("hex");
const ensurePass = (name: string, gate: R) => { if (gate.status !== "pass") throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", `${name} 尚未通过。`, false, { status: gate.status }); };
const stop = (message: string, details?: R): never => { throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", message, false, details); };
const checkDetails = (gate: R, name: string) => (((gate.checks as R[]).find((check) => check.name === name)?.details as R | undefined) ?? {});
const delivery = join(workspace, "06-delivery");
const importPath = join(workspace, "02-visual-plan", "accepted_artwork_import.json");
const importedArtwork = existsSync(importPath);

function verifyDeliveryManifest(manifest: R) {
  if (importedArtwork) verifyAcceptedImport(workspace!);
  const root = `${resolve(delivery)}${sep}`;
  for (const file of manifest.files as R[]) {
    const path = resolve(delivery, file.path as string);
    if (!path.startsWith(root) || hashBuffer(readFileSync(path)) !== file.sha256) stop("交付文件在整包审批前发生变化。", { path: file.path });
  }
  const currentInputs: R = {
    content_review_gate: hashJson(read<R>(join(workspace!, "01-understanding", "content_review_gate.json"))),
    content_split_gate: hashJson(read<R>(join(workspace!, "01-understanding", "content_split_gate.json"))),
    render_gate: hashJson(read<R>(join(workspace!, "04-rendered", "render_gate.json"))),
    public_copy_gate: hashJson(read<R>(join(delivery, "public_copy_gate.json"))),
  };
  if (importedArtwork) currentInputs.accepted_artwork_import = hashJson(read<R>(importPath));
  for (const [key, current] of Object.entries(currentInputs)) if ((manifest.input_hashes as R)[key] !== current) stop("交付包的上游门禁在整包审批前发生变化。", { key });
}
try {
  mkdirSync(delivery, { recursive: true });
  if (action === "approve") {
    const manifest = read<R>(join(delivery, "delivery_manifest.json")); validateArtifact("delivery_manifest", manifest);
    verifyDeliveryManifest(manifest);
    const approval: R = { schema_version: "1.0", kind: "human_approval", stage: "package", status: "accepted", artifact_hashes: { delivery_manifest: hashJson(manifest) }, reviewed_by: value("--reviewed-by") ?? "user", reviewed_at: new Date().toISOString(), note: value("--note") ?? "" };
    validateArtifact("human_approval", approval); writeFileSync(join(delivery, "package_human_approval.json"), `${JSON.stringify(approval, null, 2)}\n`);
    const gate: R = { schema_version: "1.0", kind: "package_gate", status: "pass", delivery_manifest_sha256: hashJson(manifest), checks: [{ name: "package_completeness", status: "pass", details: { files: (manifest.files as R[]).length } }, { name: "human_package_review", status: "pass", details: { approval_sha256: hashJson(approval) } }], human_review_required: false, human_review: { approval_sha256: hashJson(approval) } };
    validateArtifact("package_gate", gate); writeFileSync(join(delivery, "package_gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ status: "pass", gate: "06-delivery/package_gate.json" })}\n`); process.exit(0);
  }
  const contentGate = read<R>(join(workspace, "01-understanding", "content_review_gate.json"));
  const splitGate = read<R>(join(workspace, "01-understanding", "content_split_gate.json"));
  const renderGate = read<R>(join(workspace, "04-rendered", "render_gate.json"));
  const copyGate = read<R>(join(delivery, "public_copy_gate.json"));
  validateArtifact("content_review_gate", contentGate); validateArtifact("content_split_gate", splitGate); validateArtifact("render_gate", renderGate); validateArtifact("public_copy_gate", copyGate);
  ensurePass("Content Review Gate", contentGate); ensurePass("Content Split Gate", splitGate); ensurePass("Render Gate", renderGate); ensurePass("Public Copy Gate", copyGate);
  const renderManifest = read<R>(join(workspace, "04-rendered", "render_manifest.json"));
  const sceneManifest = read<R>(join(workspace, "03-excalidraw", "scene_manifest.json"));
  validateArtifact("render_manifest", renderManifest); validateArtifact("scene_manifest", sceneManifest);

  const knowledgeGate = read<R>(join(workspace, "01-understanding", "knowledge_gate.json"));
  const editorialGate = read<R>(join(workspace, "01-understanding", "editorial_gate.json"));
  const visualGate = read<R>(join(workspace, "02-visual-plan", "visual_gate.json"));
  validateArtifact("knowledge_gate", knowledgeGate); validateArtifact("editorial_gate", editorialGate);
  if (importedArtwork) verifyAcceptedImport(workspace); else validateArtifact("visual_gate", visualGate);
  ensurePass("Knowledge Gate", knowledgeGate); ensurePass("Editorial Gate", editorialGate); ensurePass("Visual Gate", visualGate);

  const constructionGate = read<R>(join(workspace, "03-excalidraw", "construction_gate.json"));
  const constructionPlan = read<R>(join(workspace, "03-excalidraw", "construction_plan.json"));
  const constructionSpec = read<R>(join(workspace, "02-visual-plan", "construction_spec.json"));
  const selectedVisualPlan = importedArtwork ? {} : read<R>(join(workspace, "02-visual-plan", "selected_visual_plan.json"));
  const designTokens = read<R>(join(importedArtwork ? workspace : process.cwd(), "design_tokens.json"));
  const episodeMetadata = read<R>(join(workspace, "00-source", "episode_metadata.json"));
  validateArtifact("construction_gate", constructionGate);
  if (!importedArtwork) { validateArtifact("construction_plan", constructionPlan); validateArtifact("construction_spec", constructionSpec); validateArtifact("selected_visual_plan", selectedVisualPlan); }
  ensurePass("Construction Gate", constructionGate);
  if (!importedArtwork && (constructionGate.construction_plan_sha256 !== hashJson(constructionPlan) || constructionGate.scene_manifest_sha256 !== hashJson(sceneManifest) || (constructionPlan.input as R).construction_spec_sha256 !== hashJson(constructionSpec) || (constructionPlan.input as R).selected_visual_plan_sha256 !== hashJson(selectedVisualPlan) || (constructionPlan.input as R).visual_gate_sha256 !== hashJson(visualGate) || (constructionPlan.input as R).design_tokens_sha256 !== hashJson(designTokens))) stop("构图、视觉方案或设计 token 在渲染后发生变化。");

  const inventory = read<R>(join(workspace, "01-understanding", "episode_content_inventory.json"));
  const grounded = read<R>(join(workspace, "00-source", "transcript_grounded.json"));
  const contentDocument = readFileSync(join(workspace, "01-understanding", "内容梳理.md"), "utf8");
  const contentApproval = read<R>(join(workspace, "01-understanding", "content_review_human_approval.json"));
  validateArtifact("human_approval", contentApproval);
  const contentHashes = contentApproval.artifact_hashes as R;
  if (contentGate.episode_content_inventory_sha256 !== hashJson(inventory) || contentGate.grounded_transcript_sha256 !== hashJson(grounded) || contentGate.content_review_document_sha256 !== hashText(contentDocument) || contentHashes.episode_content_inventory !== hashJson(inventory) || contentHashes.grounded_transcript !== hashJson(grounded) || contentHashes.content_review_document !== hashText(contentDocument) || (contentGate.human_review as R).approval_sha256 !== hashJson(contentApproval)) stop("《内容梳理》或其人工审批已失效。");

  const split = read<R>(join(workspace, "01-understanding", "content_split.json"));
  const splitCoverage = read<R>(join(workspace, "01-understanding", "content_split_coverage.json"));
  const splitDocument = readFileSync(join(workspace, "01-understanding", "内容拆分.md"), "utf8");
  const splitApproval = read<R>(join(workspace, "01-understanding", "content_split_human_approval.json"));
  validateArtifact("human_approval", splitApproval);
  const splitHashes = splitApproval.artifact_hashes as R;
  if (splitGate.episode_content_inventory_sha256 !== hashJson(inventory) || splitGate.content_split_sha256 !== hashJson(split) || splitGate.content_split_coverage_sha256 !== hashJson(splitCoverage) || splitGate.content_split_document_sha256 !== hashText(splitDocument) || splitHashes.episode_content_inventory !== hashJson(inventory) || splitHashes.content_split !== hashJson(split) || splitHashes.content_split_coverage !== hashJson(splitCoverage) || splitHashes.content_split_document !== hashText(splitDocument) || (splitGate.human_review as R).approval_sha256 !== hashJson(splitApproval)) stop("《内容拆分》或其人工审批已失效。");

  const knowledgeGraph = read<R>(join(workspace, "01-understanding", "knowledge_graph.json"));
  if (knowledgeGate.knowledge_graph_sha256 !== hashJson(knowledgeGraph) || (knowledgeGate.episode_content_inventory_sha256 && knowledgeGate.episode_content_inventory_sha256 !== hashJson(inventory))) stop("知识模型门禁已失效。");
  if (knowledgeGate.knowledge_base_sha256) {
    const knowledgeBase = read<R>(join(workspace, "01-understanding", "knowledge_base.json"));
    const lossAudit = read<R>(join(workspace, "01-understanding", "understanding_loss_audit.json"));
    if (knowledgeGate.knowledge_base_sha256 !== hashJson(knowledgeBase) || knowledgeGate.understanding_loss_audit_sha256 !== hashJson(lossAudit)) stop("知识基底或信息损失审计已失效。");
  }
  const editorialPlan = read<R>(join(workspace, "01-understanding", "editorial_plan.json"));
  const coverageMatrix = read<R>(join(workspace, "01-understanding", "coverage_matrix.json"));
  const visualCandidates = importedArtwork ? {} : read<R>(join(workspace, "02-visual-plan", "visual_candidates.json"));
  if (editorialGate.knowledge_graph_sha256 !== hashJson(knowledgeGraph) || editorialGate.knowledge_gate_sha256 !== hashJson(knowledgeGate) || editorialGate.editorial_plan_sha256 !== hashJson(editorialPlan) || editorialGate.coverage_matrix_sha256 !== hashJson(coverageMatrix)) stop("知识或编辑规划门禁已失效。");
  if (!importedArtwork && (visualGate.visual_candidates_sha256 !== hashJson(visualCandidates) || visualGate.selected_visual_plan_sha256 !== hashJson(selectedVisualPlan) || visualGate.editorial_plan_sha256 !== hashJson(editorialPlan) || visualGate.editorial_gate_sha256 !== hashJson(editorialGate))) stop("视觉方案门禁已失效。");
  const specInput = constructionSpec.input as R;
  if (!importedArtwork && (specInput.episode_metadata_sha256 !== hashJson(episodeMetadata) || specInput.editorial_plan_sha256 !== hashJson(editorialPlan) || specInput.selected_visual_plan_sha256 !== hashJson(selectedVisualPlan) || specInput.visual_gate_sha256 !== hashJson(visualGate) || specInput.design_tokens_sha256 !== hashJson(designTokens))) stop("构图规格绑定的当前输入已失效。");

  if (renderGate.render_manifest_sha256 !== hashJson(renderManifest) || renderManifest.scene_manifest_sha256 !== hashJson(sceneManifest)) stop("渲染门禁或场景清单哈希已失效。");
  for (const page of renderManifest.pages as R[]) {
    const scene = (sceneManifest.pages as R[]).find((item) => item.page_id === page.page_id);
    if (!scene || scene.sha256 !== page.scene_sha256 || hashBuffer(readFileSync(join(workspace, scene.file as string))) !== scene.sha256) stop("当前 Excalidraw 场景与渲染记录不一致。", { page_id: page.page_id });
    for (const [pathKey, hashKey] of [["png", "png_sha256"], ["phone_png", "phone_png_sha256"], ["grayscale_png", "grayscale_png_sha256"]]) if (hashBuffer(readFileSync(join(workspace, page[pathKey] as string))) !== page[hashKey]) stop("当前 PNG 与渲染记录不一致。", { page_id: page.page_id, path: page[pathKey] });
  }
  const visualApproval = read<R>(join(workspace, "04-rendered", "visual_page_human_approval.json"));
  const independentReview = read<R>(join(workspace, "04-rendered", "independent_visual_review.json"));
  validateArtifact("human_approval", visualApproval); validateArtifact("independent_visual_review", independentReview);
  if (checkDetails(renderGate, "original_phone_grayscale_review").user_approval_sha256 !== hashJson(visualApproval) || checkDetails(renderGate, "independent_visual_review").review_sha256 !== hashJson(independentReview) || independentReview.render_manifest_sha256 !== hashJson(renderManifest)) stop("当前视觉审批或隔离审核已失效。");
  if (visualApproval.stage !== "visual_page" || visualApproval.status !== "accepted") stop("当前页面缺少用户明确通过记录。");
  for (const page of renderManifest.pages as R[]) {
    const reviewedPage = (independentReview.pages as R[]).find((item) => item.page_id === page.page_id);
    if ((visualApproval.artifact_hashes as R)[page.page_id as string] !== page.png_sha256 || !reviewedPage || reviewedPage.png_sha256 !== page.png_sha256 || reviewedPage.verdict !== "TARGET") stop("页面当前 PNG 与用户通过或隔离审核记录不一致。", { page_id: page.page_id });
  }

  const copyRecord = read<R>(join(delivery, "public_copy_record.json")); validateArtifact("public_copy_record", copyRecord);
  const publicDraft = readFileSync(join(delivery, "xiaohongshu-draft.md"), "utf8"), publicFinal = readFileSync(join(delivery, "xiaohongshu.md"), "utf8");
  if (copyGate.public_copy_record_sha256 !== hashJson(copyRecord) || copyRecord.content_split_human_approval_sha256 !== hashBuffer(readFileSync(join(workspace, "01-understanding", "content_split_human_approval.json"))) || copyRecord.draft_sha256 !== hashText(publicDraft) || copyRecord.final_sha256 !== hashText(publicFinal)) stop("小红书文案或忠实度门禁已失效。");
  const files: R[] = [];
  const addFile = (role: string, source: string, targetName: string) => {
    const target = join(delivery, targetName);
    if (resolve(source) !== resolve(target)) copyFileSync(source, target);
    files.push({ role, path: targetName, sha256: hashBuffer(readFileSync(target)) });
  };
  for (let index = 0; index < (renderManifest.pages as R[]).length; index++) {
    const page = (renderManifest.pages as R[])[index], scene = (sceneManifest.pages as R[]).find((item) => item.page_id === page.page_id)!;
    const pageName = index === 0 ? "00-cover" : index === 1 ? "01-overview" : `${String(index).padStart(2, "0")}-${String(page.page_id).replace(/^edp_dd_/, "")}`;
    for (const [role, source, extension] of [["page_png", page.png, ".png"], ["page_phone_png", page.phone_png, "-phone.png"], ["page_grayscale_png", page.grayscale_png, "-grayscale.png"], ["page_scene", scene.file, ".excalidraw"]] as string[][]) addFile(`${role}:${page.page_id}`, join(workspace, source), `${pageName}${extension}`);
    const renderSlug = basename(page.png as string, ".png");
    addFile(`rendered_page_check:${page.page_id}`, join(workspace, "04-rendered", "checks", `${renderSlug}.md`), `qa-${pageName}.md`);
  }
  for (const [role, source, name] of [
    ["content_review_document", join(workspace, "01-understanding", "内容梳理.md"), "内容梳理.md"],
    ["episode_content_inventory", join(workspace, "01-understanding", "episode_content_inventory.json"), "episode_content_inventory.json"],
    ["content_review_human_approval", join(workspace, "01-understanding", "content_review_human_approval.json"), "content_review_human_approval.json"],
    ["content_review_gate", join(workspace, "01-understanding", "content_review_gate.json"), "content_review_gate.json"],
    ["content_split_document", join(workspace, "01-understanding", "内容拆分.md"), "内容拆分.md"],
    ["content_split", join(workspace, "01-understanding", "content_split.json"), "content_split.json"],
    ["content_split_coverage", join(workspace, "01-understanding", "content_split_coverage.json"), "content_split_coverage.json"],
    ["content_split_human_approval", join(workspace, "01-understanding", "content_split_human_approval.json"), "content_split_human_approval.json"],
    ["content_split_gate", join(workspace, "01-understanding", "content_split_gate.json"), "content_split_gate.json"],
    ["knowledge_graph", join(workspace, "01-understanding", "knowledge_graph.json"), "knowledge_graph.json"],
    ["knowledge_gate", join(workspace, "01-understanding", "knowledge_gate.json"), "knowledge_gate.json"],
    ["editorial_plan", join(workspace, "01-understanding", "editorial_plan.json"), "editorial_plan.json"],
    ["editorial_gate", join(workspace, "01-understanding", "editorial_gate.json"), "editorial_gate.json"],
    ["construction_spec", join(workspace, "02-visual-plan", "construction_spec.json"), "construction_spec.json"],
    ["visual_gate", join(workspace, "02-visual-plan", "visual_gate.json"), "visual_gate.json"],
    ["cover_brief", join(workspace, "02-visual-plan", "COVER_BRIEF.md"), "COVER_BRIEF.md"],
    ["construction_human_approval", join(workspace, "03-excalidraw", "construction_human_approval.json"), "construction_human_approval.json"],
    ["construction_gate", join(workspace, "03-excalidraw", "construction_gate.json"), "construction_gate.json"],
    ["cover_rendered_check", join(workspace, "04-rendered", "COVER_RENDERED_CHECK.md"), "COVER_RENDERED_CHECK.md"],
    ["independent_visual_review", join(workspace, "04-rendered", "independent_visual_review.json"), "independent_visual_review.json"],
    ["visual_page_human_approval", join(workspace, "04-rendered", "visual_page_human_approval.json"), "visual_page_human_approval.json"],
    ["render_gate", join(workspace, "04-rendered", "render_gate.json"), "render_gate.json"],
    ["xiaohongshu_draft", join(delivery, "xiaohongshu-draft.md"), "xiaohongshu-draft.md"],
    ["xiaohongshu_final", join(delivery, "xiaohongshu.md"), "xiaohongshu.md"],
    ["xiaohongshu_review", join(delivery, "xiaohongshu-review.md"), "xiaohongshu-review.md"],
    ["public_copy_record", join(delivery, "public_copy_record.json"), "public_copy_record.json"],
    ["public_copy_gate", join(delivery, "public_copy_gate.json"), "public_copy_gate.json"],
  ] as string[][]) addFile(role, source, name);
  if (importedArtwork) addFile("accepted_artwork_import", importPath, "accepted_artwork_import.json");
  writeFileSync(join(delivery, "package.md"), `# 播客知识图交付包\n\n- 页面数量：${(renderManifest.pages as R[]).length}\n- 内容梳理：内容梳理.md\n- 内容拆分：内容拆分.md\n- 小红书文案：xiaohongshu.md\n- 当前状态：等待整包人工审核\n`);
  addFile("package_readme", join(delivery, "package.md"), "package.md");
  const manifest: R = { schema_version: "1.0", kind: "delivery_manifest", status: "completed", input_hashes: { content_review_gate: hashJson(contentGate), content_split_gate: hashJson(splitGate), render_gate: hashJson(renderGate), public_copy_gate: hashJson(copyGate), ...(importedArtwork ? { accepted_artwork_import: hashJson(read<R>(importPath)) } : {}) }, files, created_at: new Date().toISOString() };
  validateArtifact("delivery_manifest", manifest); writeFileSync(join(delivery, "delivery_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const gate: R = { schema_version: "1.0", kind: "package_gate", status: "needs_human_review", delivery_manifest_sha256: hashJson(manifest), checks: [{ name: "package_completeness", status: "pass", details: { files: files.length } }, { name: "human_package_review", status: "needs_human_review", details: { required: true } }], human_review_required: true };
  validateArtifact("package_gate", gate); writeFileSync(join(delivery, "package_gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: "needs_human_review", files: files.length, gate: "06-delivery/package_gate.json" })}\n`);
} catch (error) { const payload = error instanceof PipelineError ? error.toJSON() : { code: "CONSTRUCTION_GATE_FAILED", stage: "construction_gate", message: error instanceof Error ? error.message : String(error), recoverable: false }; mkdirSync(delivery, { recursive: true }); writeFileSync(join(delivery, "package.error.json"), `${JSON.stringify(payload, null, 2)}\n`); process.stderr.write(`${JSON.stringify(payload)}\n`); process.exitCode = 1; }
