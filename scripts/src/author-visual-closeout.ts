import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateArtifact } from "./validate.js";
import { assertSceneMechanics } from "./scene-mechanics.js";
import { assertOverviewFrameworkCheck } from "./overview-framework-check.js";
import { assertUserRequirementsCheck } from "./review-packet.js";
type R = Record<string, any>;
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const fileHash = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const read = (p: string): R => JSON.parse(readFileSync(p, "utf8"));
const bound = (v: R) => {
  if (!v || typeof v.path !== "string" || typeof v.sha256 !== "string" || fileHash(v.path) !== v.sha256) throw new Error("自检绑定的文件缺失或已变化。");
};
function checkBindings(v: any): void {
  if (!v || typeof v !== "object") return;
  if ("path" in v && "sha256" in v) bound(v);
  else for (const item of Object.values(v)) checkBindings(item);
}
const longText = (v: unknown, n = 12) => typeof v === "string" && v.trim().length >= n;
/** v0.4.2-local：没有正反例并排比较与视觉收益反证，不能记self_check_passed。 */
export function assertComparisonAndCounterproof(c: R): void {
  const cmp = c.checks?.side_by_side_reference_comparison;
  if (!cmp || cmp.status !== "pass" || !longText(cmp.visible_evidence)) throw new Error("作者自检缺少实际证据：side_by_side_reference_comparison");
  for (const kind of ["positive", "negative"]) {
    const list = cmp[kind];
    if (!Array.isArray(list) || !list.length || list.some((x: R) => !x || typeof x.path !== "string" || !longText(x.comparison))) throw new Error(`side_by_side_reference_comparison 缺少${kind === "positive" ? "正例" : "反例"}逐图比较`);
  }
  for (const rule of ["R11", "R17", "R18"]) if (!longText(cmp.quality_bar?.[rule], 6)) throw new Error("side_by_side_reference_comparison 缺少视觉质量硬线证据：" + rule);
  const proof = c.visual_gain_counterproof;
  if (!proof || !longText(proof.simple_alternative) || !longText(proof.remove_subject)) throw new Error("作者自检缺少 visual_gain_counterproof（simple_alternative 与 remove_subject）");
}
export function verifyAuthorPageChecks(workspace: string, manifest: R, paths: string[]): R[] {
  const pages = manifest.pages as R[];
  if (!paths.length || paths.length !== pages.length) throw new Error("每张当前页面须有一份作者自检。");
  const checks = paths.map(path => ({ path: resolve(path), sha256: fileHash(path), data: read(path) }));
  const ids = checks.map(x => String(x.data.manifest_page_id ?? x.data.page_id));
  if (new Set(ids).size !== pages.length) throw new Error("作者自检页号重复。");
  for (const page of pages) {
    const record = checks.find(x => (x.data.manifest_page_id ?? x.data.page_id) === page.page_id);
    const c = record?.data;
    if (!c || c.status !== "self_check_passed") throw new Error("当前页面作者自检未通过。");
    for (const name of ["content_coverage", "visual_explanation", "reference_alignment", "text_geometry", "mobile_readability", "cold_reader_check", "layout_budget", "margin_audit", "cjk_glyph_audit"]) {
      if (c.checks?.[name]?.status !== "pass" || typeof c.checks[name].visible_evidence !== "string" || c.checks[name].visible_evidence.trim().length < 8) throw new Error("作者自检缺少实际证据：" + name);
    }
    assertComparisonAndCounterproof(c);
    bound(c.mechanical_render_record);
    const mechanical = read(c.mechanical_render_record.path);
    const required = ["preconstruction_reference_plan", "native_scene", "typography_roles_sizes_strong_weight", "stroke_roles", "static_text_geometry", "reader_facing_text", "outline_alignment", "current_input_bindings", "same_scene_real_export"];
    if (mechanical.kind !== "mechanical_render_record" || mechanical.status !== "pass" || required.some(name => !mechanical.checks?.some((x: R) => x.name === name && x.status === "pass"))) throw new Error("必要机械检查缺项或失败。");
    checkBindings(mechanical);
    const outputKeys: R = { scene: [null, "scene_sha256"], png: ["png", "png_sha256"], phone: ["phone_png", "phone_png_sha256"], gray: ["grayscale_png", "grayscale_png_sha256"] };
    if (page.delivery_png) outputKeys.delivery = ["delivery_png", "delivery_png_sha256"];
    if (mechanical.current?.delivery && !page.delivery_png) throw new Error("清单遗漏高清图。");
    for (const [key, [pathKey, hashKey]] of Object.entries(outputKeys) as [string, [string | null, string]][]) {
      const actual = c.current?.[key]; bound(actual);
      if (actual.sha256 !== page[hashKey] || mechanical.current?.[key]?.sha256 !== actual.sha256 || resolve(mechanical.current[key].path) !== resolve(actual.path) || (pathKey && resolve(workspace, page[pathKey]) !== resolve(actual.path))) throw new Error("作者自检、机械记录与当前渲染不一致：" + key);
    }
    bound(mechanical.preflight);
    const preflight = read(mechanical.preflight.path), inputs = preflight.inputs;
    if (preflight.page_id !== c.page_id || !["cover", "overview", "deep_dive"].includes(preflight.role)) throw new Error("自检与预检页号或页型不一致。");
    if (preflight.status !== "completed_before_construction") throw new Error("当前制作预检未通过。");
    checkBindings(inputs);
    if (["overview", "deep_dive"].includes(preflight.role) && mechanical.outline_check?.status !== "pass") throw new Error("内页提纲检查未通过。");
    if (preflight.role === "overview" && !c.overview_framework_check) throw new Error("总览作者自检缺少 overview_framework_check");
    if (preflight.role === "overview") assertOverviewFrameworkCheck(c.overview_framework_check, inputs?.framework_basis, c.page_id);
    const requirements: R[] = [];
    if (inputs?.user_requirements) requirements.push(inputs.user_requirements);
    for (const key of ["creation_packet", "page_contract"]) {
      if (!inputs?.[key]) continue;
      const source = read(inputs[key].path);
      const v = (key === "creation_packet" ? source.inputs : source)?.user_requirements;
      if (v) requirements.push(v);
    }
    if (requirements.length && (!inputs.user_requirements || requirements.some(v => v.path !== inputs.user_requirements.path || v.sha256 !== inputs.user_requirements.sha256))) throw new Error("用户要求在创作与预检之间漏传或不一致。");
    assertUserRequirementsCheck(inputs?.user_requirements, inputs?.user_requirements ? read(inputs.user_requirements.path) : undefined, c.user_requirements_check);
    bound(mechanical.tokens);
    assertSceneMechanics(read(c.current.scene.path) as any, read(mechanical.tokens.path) as any);
  }
  return checks.map(({ path, sha256 }) => ({ path, sha256 }));
}
export function closeoutAuthorPages(workspace: string, paths: string[], action: string, userApproved: boolean, note = ""): R {
  if (!["submit", "approve"].includes(action)) throw new Error("动作须为submit或approve。");
  const out = join(workspace, "04-rendered"), manifest = read(join(out, "render_manifest.json"));
  validateArtifact("render_manifest", manifest);
  const pageChecks = verifyAuthorPageChecks(workspace, manifest, paths);
  if (action === "approve" && !userApproved) throw new Error("记录用户通过需要--user-approved。");
  const gate: R = {schema_version:"1.0",kind:"render_gate",status:action==="approve"?"pass":"needs_human_review",render_manifest_sha256:hash(manifest),checks:[{name:"author_self_check",status:"pass",details:{page_checks:pageChecks}},{name:"same_scene_real_png_export",status:"pass",details:{pages:manifest.pages.length}},{name:"original_phone_grayscale_review",status:action==="approve"?"pass":"needs_human_review",details:{}}],human_review_required:action!=="approve",independent_review_required:false};
  if (action === "approve") {
    const approval: R = {schema_version:"1.0",kind:"human_approval",stage:"visual_page",status:"accepted",artifact_hashes:Object.fromEntries(manifest.pages.map((v:R)=>[v.page_id,v.png_sha256])),reviewed_by:"user",reviewed_at:new Date().toISOString(),note};
    validateArtifact("human_approval",approval);writeFileSync(join(out,"visual_page_human_approval.json"),JSON.stringify(approval,null,2)+"\n");
    gate.checks[2].details.user_approval_sha256=hash(approval);
  } else rmSync(join(out,"visual_page_human_approval.json"),{force:true});
  validateArtifact("render_gate",gate);writeFileSync(join(out,"render_gate.json"),JSON.stringify(gate,null,2)+"\n");return gate;
}
