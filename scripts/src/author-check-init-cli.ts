#!/usr/bin/env node
/** 生成作者自检草稿：机械字段从记录自动填入，判断字段留“待作者填写”，收尾门禁会拒绝任何未改的占位。 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPREHENSION_ITEMS, readerJargon } from "./author-visual-closeout.js";
import { COLLISION_TERMS, NUM_RE, norm, sceneTexts } from "./sentence-cold-read.js";
type R = Record<string, any>;
export const TODO = "待作者填写";
const fileHash = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const read = (p: string): R => JSON.parse(readFileSync(p, "utf8"));
const ref = (p: string) => ({ path: resolve(p), sha256: fileHash(p) });
const judged = () => ({ status: TODO, visible_evidence: TODO });

export function initAuthorCheck(workspace: string, recordPath: string, extra: R = {}): R {
  const mech = read(recordPath);
  if (mech.kind !== "mechanical_render_record" || mech.status !== "pass") throw new Error("机械记录未通过，不能生成自检草稿");
  const cur = mech.current, pre = read(mech.preflight.path), inputs = pre.inputs ?? {};
  const scene = read(cur.scene.path), texts = [...new Set(sceneTexts(scene))];
  const out = dirname(resolve(recordPath));
  const overlap = mech.overlap_margin_audit?.record ? read(mech.overlap_margin_audit.record.path) : undefined;
  const budget = mech.layout_budget?.record ? readFileSync(mech.layout_budget.record.path, "utf8").trim().split("\n").pop() : undefined;
  const glyph = mech.diagnostics?.glyphs ? read(mech.diagnostics.glyphs.path) : undefined;
  const jargon = pre.role === "cover" ? [] : readerJargon(workspace);
  const checks: R = {
    content_coverage: judged(), visual_explanation: judged(), reference_alignment: judged(), text_geometry: judged(), mobile_readability: judged(),
    cold_reader_check: {
      status: TODO, entry_and_path: TODO, one_sentence_restatement: TODO, breakpoints: [TODO], minimal_fixes: [TODO], visible_evidence: TODO,
      comprehension_checklist: Object.fromEntries(COMPREHENSION_ITEMS.map(k => [k, { status: TODO, evidence: TODO }])),
      plain_restatement: texts.filter(t => norm(t).length > 8).slice(0, 12).map(t => ({ page_text: t, stranger_restatement: TODO, clear: false })),
    },
    layout_budget: budget ? { status: "pass", visible_evidence: `layout_budget.py --scene exit 0：${budget}`, record: mech.layout_budget.record } : judged(),
    margin_audit: overlap?.pass ? { status: "pass", visible_evidence: `audit_overlap_margins exit 0：issues ${overlap.issues.length}，墨迹左${overlap.ink_left} 右${overlap.ink_right}，不对称${overlap.side_margin_asymmetry}px，页眉线到正文${overlap.gap_header_rule_to_body}px，正文到页脚线${overlap.gap_body_to_footer_rule}px。`, record: mech.overlap_margin_audit.record } : judged(),
    cjk_glyph_audit: glyph?.pass ? { status: "pass", visible_evidence: `CJK_GLYPH_AUDIT：${glyph.unique_chars} 个字符按简体中文字形解析，failures ${glyph.failures.length}。`, record: mech.diagnostics.glyphs } : judged(),
    side_by_side_reference_comparison: {
      status: TODO, visible_evidence: TODO,
      positive: (inputs.positive ?? []).map((x: R) => ({ path: x.path, comparison: TODO })),
      negative: (inputs.negative ?? []).map((x: R) => ({ path: x.path, comparison: TODO })),
      quality_bar: { R11: TODO, R17: TODO, R18: TODO },
    },
    text_and_scale_lock: judged(),
    content_text_min_size: judged(),
    arrow_audit: (() => {
      const arrows = (scene.elements ?? []).filter((e: R) => e.type === "arrow" && !e.isDeleted);
      return arrows.length
        ? { status: TODO, arrows: arrows.map((e: R) => ({ id: e.id, start: TODO, via: TODO, end: TODO, reads_as: TODO, misread: null })) }
        : { status: "not_applicable", reason: "场景里没有箭头。" };
    })(),
    sentence_cold_read: {
      status: TODO,
      items: texts.map(t => {
        const term = jargon.find(j => norm(t).includes(norm(j)));
        return term ? { text: t, flagged: true, resolution: "explained_on_page", reason: `“${t.replace(/\s+/g, "").slice(0, 10)}”含本期术语“${term}”`, explanation: TODO } : { text: t, flagged: false, resolution: "plain", reason: TODO };
      }),
      number_trace: texts.flatMap(t => [...new Set(t.match(NUM_RE) ?? [])].map(m => ({ text: t, number: m, kind: "structural", reason: TODO }))),
      label_collision: { status: "pass", findings: COLLISION_TERMS.filter(w => texts.join("\n").includes(w)).map(term => ({ term, ruling: TODO })) },
      metaphor_body_plain: { status: TODO, evidence: TODO },
      outline_items: [TODO],
    },
  };
  if (mech.dead_whitespace_audit?.record) checks.dead_whitespace_audit = { status: mech.dead_whitespace_audit.status, record: mech.dead_whitespace_audit.record };
  const check: R = {
    schema_version: "1.0", kind: "author_rendered_page_check", page_id: mech.page_id, ...extra, status: "draft",
    note: "由 author-check:init 生成；逐项按当前 @2x 图写实际证据，全部写完后把 status 改为 self_check_passed。",
    current: Object.fromEntries(["scene", "png", "phone", "gray", "delivery", "review2x"].filter(k => cur[k]).map(k => [k, cur[k]])),
    mechanical_render_record: ref(recordPath), preflight: mech.preflight, checks,
    visual_gain_counterproof: { simple_alternative: TODO, remove_subject: TODO },
  };
  if (pre.role === "overview" && inputs.framework_basis) {
    const data = read(inputs.framework_basis.path);
    const ledger: R[] = Array.isArray(data) ? data : data.overview_relation_ledger ?? data.relations ?? [];
    check.overview_framework_check = {
      basis: inputs.framework_basis, status: TODO, framework_readback: TODO, missing_relations: [], misread_relations: [],
      relations: ledger.filter(r => (r.page_id ?? mech.page_id) === mech.page_id).map(r => ({ from_component: r.from_component ?? r.from, to_component: r.to_component ?? r.to, relation_type: r.relation_type, match: null, observed: TODO, visible_evidence: TODO })),
    };
  }
  if (inputs.user_requirements) {
    const req = read(inputs.user_requirements.path);
    check.user_requirements_check = { basis: inputs.user_requirements, results: (req.required_outcomes ?? []).map((x: R) => ({ id: x.id, requirement: x.requirement, status: TODO, visible_evidence: TODO })) };
  }
  if (!existsSync(out)) throw new Error("输出目录不存在：" + out);
  return check;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = (k: string) => { const i = args.indexOf(k); return i === -1 ? undefined : args[i + 1]; };
  const workspace = value("--workspace"), record = value("--record"), output = value("--out");
  if (!workspace || !record || !output) { console.error("用法：npm run author-check:init -- --workspace <工作区> --record <MECHANICAL_RENDER_RECORD.json> --out <RENDERED_PAGE_CHECK.json> [--case A] [--version v1]"); process.exit(2); }
  if (existsSync(output) && !args.includes("--force")) { console.error(`已存在 ${output}；确需覆盖时加 --force`); process.exit(2); }
  try {
    const extra: R = {};
    if (value("--case")) extra.case = value("--case");
    if (value("--version")) extra.version = value("--version");
    const check = initAuthorCheck(workspace, record, extra);
    writeFileSync(join(output), JSON.stringify(check, null, 2) + "\n");
    const todo = JSON.stringify(check).split(TODO).length - 1;
    console.log(JSON.stringify({ status: "draft", output, fields_to_fill: todo }));
  } catch (error) { console.error(JSON.stringify({ status: "fail", message: String((error as Error).message ?? error) })); process.exit(1); }
}
