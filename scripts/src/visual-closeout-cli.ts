import { closeoutAuthorPages } from "./author-visual-closeout.js";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PipelineError } from "./contracts.js";
import { validateArtifact } from "./validate.js";
import { assertUnfamiliarReaderCheck } from "./unfamiliar-reader-check.js";
import { assertOverviewFrameworkCheck } from "./overview-framework-check.js";
import { packetPageId, assertUserRequirementsCheck } from "./review-packet.js";
type R = Record<string, unknown>;
const args = process.argv.slice(2), value = (name: string) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
const values = (name: string) => args.flatMap((arg, index) => arg === name && args[index + 1] ? [args[index + 1]] : []);
const workspace = value("--workspace"), reviewPath = value("--review"), action = value("--action") ?? "submit";
const packetPaths = values("--packet");
const reviewedBy = value("--reviewed-by") ?? "user";
if (workspace && !reviewPath) {
  try {
    const gate = closeoutAuthorPages(workspace, values("--page-check"), action, args.includes("--user-approved"), value("--note") ?? "");
    process.stdout.write(JSON.stringify({ status: gate.status, gate: "04-rendered/render_gate.json" }) + "\n");
  } catch (error) { process.stderr.write(JSON.stringify({code:"CONSTRUCTION_GATE_FAILED",message:String(error)})+"\n"); process.exitCode=1; }
  process.exit(process.exitCode ?? 0);
}
if (!workspace || !reviewPath || !packetPaths.length || !["submit", "approve"].includes(action)) { console.error("Usage: npm run visual:closeout -- --workspace <episode-workspace> --page-check <author-check.json> [--page-check ...] [--action submit|approve] [--user-approved]；旧报告兼容调用可显式使用--review及--packet"); process.exit(2); }
const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileHash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
try {
  const rendered = join(workspace, "04-rendered"), manifest = read<R>(join(rendered, "render_manifest.json"));
  const review = read<R>(reviewPath); validateArtifact("render_manifest", manifest); validateArtifact("independent_visual_review", review);
  if (review.render_manifest_sha256 !== hash(manifest)) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "独立审核绑定的 render manifest 已失效。", false);
  const reviewPages = review.pages as R[], manifestPages = manifest.pages as R[];
  const packets = packetPaths.map((path) => ({ path, value: read<R>(path), sha256: fileHash(path) }));
  if (packets.length !== manifestPages.length || new Set(packets.map(({ value }) => packetPageId(value))).size !== manifestPages.length) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "每张当前页面都必须有唯一的隔离审核输入包。", false);
  for (const page of manifestPages) {
    const result = reviewPages.find((item) => item.page_id === page.page_id);
    if (!result || result.png_sha256 !== page.png_sha256) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "独立审核未绑定全部当前 PNG。", false, { page_id: page.page_id });
    if (result.verdict === "TARGET") assertUnfamiliarReaderCheck(result.unfamiliar_reader_check, review.schema_version === "1.1");
    const packet = packets.find(({ value }) => packetPageId(value) === page.page_id);
    const current = packet?.value.current as R | undefined;
    if (!packet || packet.value.kind !== "independent_visual_review_packet" || result.review_packet_sha256 !== packet.sha256 || !current || (current.png as R)?.sha256 !== page.png_sha256 || (current.phone as R)?.sha256 !== page.phone_png_sha256 || (current.scene as R)?.sha256 !== page.scene_sha256 || typeof packet.value.preflight_sha256 !== "string" || typeof packet.value.rendered_page_check_sha256 !== "string") throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "隔离审核输入包与当前 scene、PNG、预检、自检或审核报告不匹配。", false, { page_id: page.page_id });
    if (typeof packet.value.creator_context_id !== "string" || packet.value.creator_context_id.length < 2 || packet.value.creator_context_id === review.reviewer_context_id) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "创作者与隔离审核者必须来自不同的执行上下文。", false, { page_id: page.page_id });
    for (const item of [current.png, current.phone, current.scene, packet.value.content, ...((packet.value.positive as R[] | undefined) ?? []), ...((packet.value.negative as R[] | undefined) ?? []), ...Object.values((packet.value.standards as R | undefined) ?? {}), packet.value.mechanical_render_record] as R[]) {
      if (typeof item?.path !== "string" || typeof item?.sha256 !== "string" || fileHash(item.path) !== item.sha256) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "隔离审核输入文件已变化或缺失。", false, { page_id: page.page_id, path: item?.path });
    }
    const mechanical = read<R>((packet.value.mechanical_render_record as R).path as string);
    const checks = mechanical.checks as R[] | undefined;
    const required = ["preconstruction_reference_plan", "native_scene", "typography_roles_sizes_strong_weight", "stroke_roles", "static_text_geometry", "reader_facing_text", "outline_alignment", "current_input_bindings", "same_scene_real_export"];
    if (mechanical.kind !== "mechanical_render_record" || mechanical.status !== "pass" || !required.every((name) => checks?.some((item) => item.name === name && item.status === "pass"))) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "机械记录缺项或未通过。", false);
    const outline = mechanical.outline_check as R | undefined;
    const preflight = mechanical.preflight as R;
    const preflightData = read<R>(preflight.path as string), role = preflightData.role;
    const preflightInputs = preflightData.inputs as R;
    const requirementBindings: R[] = [];
    if (preflightInputs?.user_requirements) requirementBindings.push(preflightInputs.user_requirements as R);
    for (const key of ["creation_packet", "page_contract"]) {
      const bound = preflightInputs?.[key] as R | undefined;
      if (!bound) continue;
      if (typeof bound.path !== "string" || fileHash(bound.path) !== bound.sha256) throw new Error("用户条件链输入已变化或缺失。");
      const source = read<R>(bound.path);
      const declared = (key === "creation_packet" ? source.inputs as R : source)?.user_requirements as R | undefined;
      if (declared) requirementBindings.push(declared);
    }
    const requirement = (packet.value.standards as R)?.user_requirements as R | undefined;
    if (requirementBindings.length && !preflightInputs?.user_requirements) throw new Error("预检漏传已登记的用户验收条件。");
    if (requirementBindings.some((bound) => !requirement || bound.path !== requirement.path || bound.sha256 !== requirement.sha256) || (requirement && !requirementBindings.length)) throw new Error("用户验收条件在创作、预检和审核包之间漏传或版本不一致。");
    if (requirement) {
      if (fileHash(requirement.path as string) !== requirement.sha256) throw new Error("用户验收条件文件已变化。");
      if (result.verdict === "TARGET") assertUserRequirementsCheck(requirement, read<R>(requirement.path as string), result.user_requirements_check as R | undefined);
    } else if (result.user_requirements_check) throw new Error("用户条件审核结果缺少对应输入。");
    if (packet.value.role !== role) throw new Error("审核包页面类型与绘图前预检不一致。");
    if (role === "overview") {
      const basis = (preflightData.inputs as R)?.framework_basis as R | undefined;
      const packetBasis = packet.value.framework_basis as R | undefined;
      if (!basis || basis.path !== packetBasis?.path || basis.sha256 !== packetBasis?.sha256) throw new Error("审核包与绘图前的批准关系台账绑定不同。");
      if (result.verdict === "TARGET") assertOverviewFrameworkCheck((result.unfamiliar_reader_check as R)?.overview_framework_check, basis, String(packet.value.page_id));
    }
    const nested = [mechanical.tokens, mechanical.preflight, mechanical.renderer, mechanical.brand_asset, ...Object.values(mechanical.current as R)];
    nested.push(...Object.values((mechanical.diagnostics as R | undefined) ?? {}));
    if (page.delivery_png && ((current.delivery as R)?.sha256 !== page.delivery_png_sha256 || mechanical.delivery_scale !== page.delivery_scale)) throw new Error("高清交付图与审核包或导出比例不一致。");
    if ((mechanical.current as R).delivery && !page.delivery_png) throw new Error("渲染清单遗漏了当前高清交付图。");
    if (role === "overview" || role === "deep_dive") {
      if (outline?.status !== "pass" || !outline.regions) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "内页缺少提纲区域核验。", false);
      nested.push(outline.regions);
    } else if (role !== "cover" || outline?.status !== "not_applicable" || outline.reason !== "cover") throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "提纲检查适用范围无效。", false);
    for (const item of nested as R[]) {
      if (typeof item?.path !== "string" || typeof item?.sha256 !== "string" || fileHash(item.path) !== item.sha256) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "机械检查绑定输入或工件已变化。", false, { path: item?.path });
    }
    for (const key of ["scene", "png", "phone", "gray", ...((mechanical.current as R).delivery ? ["delivery"] : [])]) {
      const actual = (mechanical.current as R)[key] as R, expected = current[key] as R;
      if (actual?.path !== expected?.path || actual?.sha256 !== expected?.sha256) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "机械导出与送审工件不一致。", false, { key });
    }
  }
  if (reviewPages.length !== manifestPages.length) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "独立审核页数与当前渲染页数不一致。", false);
  const allTarget = reviewPages.every((page) => page.verdict === "TARGET");
  if (action === "approve" && !allTarget) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "只有全部当前页面经隔离审核判为 TARGET 才能记录用户通过。", false);
  if (action === "approve" && !args.includes("--user-approved")) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "缺少用户明确通过的操作标记 --user-approved；独立审核 TARGET 不能代替用户批准。", false);
  writeFileSync(join(rendered, "independent_visual_review.json"), `${JSON.stringify(review, null, 2)}\n`);
  if (action === "submit") {
    rmSync(join(rendered, "visual_page_human_approval.json"), { force: true });
    const gate: R = { schema_version: "1.0", kind: "render_gate", status: allTarget ? "needs_human_review" : "fail", render_manifest_sha256: hash(manifest), checks: [{ name: "same_scene_real_png_export", status: "pass", details: { pages: manifestPages.length } }, { name: "original_phone_grayscale_review", status: "needs_human_review", details: { user_approval_required: true } }, { name: "independent_visual_review", status: allTarget ? "pass" : "fail", details: { review_sha256: hash(review), verdict: allTarget ? "TARGET" : "REJECT" } }], human_review_required: true, independent_review_required: false };
    validateArtifact("render_gate", gate); writeFileSync(join(rendered, "render_gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ status: gate.status, pages: manifestPages.length, gate: "04-rendered/render_gate.json" })}\n`);
    process.exit(0);
  }
  const artifactHashes = Object.fromEntries(manifestPages.map((page) => [String(page.page_id), String(page.png_sha256)]));
  const approval: R = { schema_version: "1.0", kind: "human_approval", stage: "visual_page", status: "accepted", artifact_hashes: artifactHashes, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString(), note: value("--note") ?? "" };
  validateArtifact("human_approval", approval); writeFileSync(join(rendered, "visual_page_human_approval.json"), `${JSON.stringify(approval, null, 2)}\n`);
  const gate: R = { schema_version: "1.0", kind: "render_gate", status: "pass", render_manifest_sha256: hash(manifest), checks: [{ name: "same_scene_real_png_export", status: "pass", details: { pages: manifestPages.length } }, { name: "original_phone_grayscale_review", status: "pass", details: { user_approval_sha256: hash(approval) } }, { name: "independent_visual_review", status: "pass", details: { review_sha256: hash(review), verdict: "TARGET" } }], human_review_required: false, independent_review_required: false };
  validateArtifact("render_gate", gate); writeFileSync(join(rendered, "render_gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: "pass", pages: manifestPages.length, gate: "04-rendered/render_gate.json" })}\n`);
} catch (error) { const payload = error instanceof PipelineError ? error.toJSON() : { code: "CONSTRUCTION_GATE_FAILED", stage: "construction_gate", message: error instanceof Error ? error.message : String(error), recoverable: false }; process.stderr.write(`${JSON.stringify(payload)}\n`); process.exitCode = 1; }
