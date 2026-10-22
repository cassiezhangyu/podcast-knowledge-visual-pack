import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkReview2x, pngSize, REVIEW_SIZE } from "./review-2x.js";
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
/** v0.4.5-local：陌生读者必查清单与逐句白话复述（来自 6ad48f83 复盘）。 */
export const COMPREHENSION_ITEMS = ["memes_slang_plain", "english_terms_chinese", "no_literal_contradiction", "reminder_items_on_page", "example_outcome_and_feeling", "one_caption_per_example_adjacent", "diagram_labels_match_text", "subtitle_reader_takeaway"] as const;
export function assertComprehensionChecklist(c: R): void {
  const cold = c.checks?.cold_reader_check;
  const list = cold?.comprehension_checklist;
  if (!list || typeof list !== "object") throw new Error("cold_reader_check 缺少 comprehension_checklist（陌生读者必查清单）");
  for (const item of COMPREHENSION_ITEMS) {
    const v = list[item];
    if (!v || !["pass", "not_applicable"].includes(v.status) || !longText(v.evidence, 6)) throw new Error("comprehension_checklist 缺项或未通过：" + item);
  }
  const rows = cold.plain_restatement;
  if (!Array.isArray(rows) || rows.length < 3) throw new Error("cold_reader_check 缺少 plain_restatement 逐句白话复述表（至少3行）");
  for (const r of rows) {
    if (!r || !longText(r.page_text, 2) || !longText(r.stranger_restatement, 4) || r.clear !== true) throw new Error("plain_restatement 有读不懂或缺复述的句子：" + String(r?.page_text ?? ""));
  }
}
/** v0.4.5-local：先锁字号和终稿文字，再精修图形。 */
export function assertTextLock(c: R): void {
  const lock = c.checks?.text_and_scale_lock;
  if (!lock || lock.status !== "pass" || !longText(lock.visible_evidence, 8)) throw new Error("作者自检缺少实际证据：text_and_scale_lock（字号与终稿文字须在精修图形前锁定）");
}
/** v0.4.7-local P0：死白审计必做——自检须绑定 audit_dead_space.py 的记录，且记录对应当前 1x 或 @2x 图并通过。 */
export function assertDeadSpaceAudit(c: R): void {
  const d = c.checks?.dead_whitespace_audit;
  if (!d || d.status !== "pass" || !d.record) throw new Error("作者自检缺少实际证据：dead_whitespace_audit（运行 scripts/audit_dead_space.py 并绑定记录）");
  bound(d.record);
  const rec = read(d.record.path);
  if (rec.kind !== "dead_whitespace_audit" || rec.status !== "pass" || (Array.isArray(rec.dead_zones) && rec.dead_zones.length)) throw new Error("dead_whitespace_audit 未通过：正文区仍有死白块");
  const current = [c.current?.png?.sha256, c.current?.review2x?.sha256].filter(Boolean);
  if (!current.includes(rec.png_sha256)) throw new Error("dead_whitespace_audit 记录不是当前图的审计结果");
}
/** v0.4.7-local P0：每条箭头逐条写 起点→经过→终点 与陌生人读法；场景里有箭头就不能空着。 */
export function assertArrowAudit(c: R, scene?: R): void {
  const a = c.checks?.arrow_audit;
  const sceneArrows = (scene?.elements ?? []).filter((e: R) => e.type === "arrow" && !e.isDeleted).length;
  if (!a) throw new Error("作者自检缺少 arrow_audit（逐条箭头 起点→经过→终点）");
  if (a.status === "not_applicable") { if (sceneArrows || !longText(a.reason, 4)) throw new Error("arrow_audit 不能标 not_applicable：场景里有箭头或缺原因"); return; }
  const list = a.arrows;
  if (a.status !== "pass" || !Array.isArray(list) || !list.length) throw new Error("arrow_audit 未通过或没有逐条箭头记录");
  if (list.length < sceneArrows) throw new Error(`arrow_audit 只记了 ${list.length} 条，场景里有 ${sceneArrows} 条箭头`);
  for (const x of list) {
    if (!x || !longText(x.start, 1) || !longText(x.end, 1) || typeof x.via !== "string" || !longText(x.reads_as, 4) || x.misread !== false) throw new Error("arrow_audit 有箭头缺 起点/经过/终点/读法，或存在误读：" + String(x?.id ?? ""));
  }
}
/** v0.4.7-local P1：改版须附上一版并排图与可见改动清单；声称已改但清单为空或看不出差异即拒绝。 */
export function assertRoundDiff(c: R): void {
  if (!c.revision_of) return;
  const d = c.checks?.round_diff;
  if (!d?.record) throw new Error("改版自检缺少 round_diff（与上一版并排图＋可见改动清单）");
  bound(d.record);
  const rec = read(d.record.path);
  if (rec.kind !== "round_diff" || rec.status !== "pass" || !Array.isArray(rec.visible_diffs) || !rec.visible_diffs.length) throw new Error("round_diff 未通过：声称已改但没有可见改动清单或看不出差异");
  checkBindings({ side: rec.side_by_side, prev: rec.previous });
  if (![c.current?.png?.sha256, c.current?.review2x?.sha256].includes(rec.current?.sha256)) throw new Error("round_diff 比较的不是当前图");
}
/** v0.4.7-local P1：<24px 的文字由作者按内容逐条判定；承载内容的不得 <24px。 */
export function assertContentTextSize(c: R): void {
  const t = c.checks?.content_text_min_size;
  if (!t || t.status !== "pass" || !longText(t.visible_evidence, 8)) throw new Error("作者自检缺少实际证据：content_text_min_size（<24px 文字逐条判定是否承载内容）");
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
    assertComprehensionChecklist(c);
    assertTextLock(c);
    assertDeadSpaceAudit(c);
    assertRoundDiff(c);
    assertContentTextSize(c);
    bound(c.mechanical_render_record);
    const mechanical = read(c.mechanical_render_record.path);
    const required = ["preconstruction_reference_plan", "native_scene", "typography_roles_sizes_strong_weight", "stroke_roles", "static_text_geometry", "reader_facing_text", "outline_alignment", "current_input_bindings", "same_scene_real_export"];
    if (mechanical.kind !== "mechanical_render_record" || mechanical.status !== "pass" || required.some(name => !mechanical.checks?.some((x: R) => x.name === name && x.status === "pass"))) throw new Error("必要机械检查缺项或失败。");
    checkBindings(mechanical);
    const outputKeys: R = { scene: [null, "scene_sha256"], png: ["png", "png_sha256"], phone: ["phone_png", "phone_png_sha256"], gray: ["grayscale_png", "grayscale_png_sha256"] };
    if (page.delivery_png) outputKeys.delivery = ["delivery_png", "delivery_png_sha256"];
    if (mechanical.current?.delivery && !page.delivery_png) throw new Error("清单遗漏高清图。");
    checkReview2x(mechanical, page, (p) => resolve(workspace, p));
    if (page.review_png && c.current?.review2x) outputKeys.review2x = ["review_png", "review_png_sha256"];
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
    const sceneData = read(c.current.scene.path);
    assertArrowAudit(c, sceneData);
    assertSceneMechanics(sceneData as any, read(mechanical.tokens.path) as any);
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
