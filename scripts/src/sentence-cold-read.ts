/** 逐句冷读（必做）、数字溯源、标签撞名、提纲只写章节名、比喻只放主图；以及“只改字”路线的几何指纹。
 * 来自 EP88 6ab11c95-v045 R7 改字轮（05-qa/R7_TEXT_CHANGES.diff）。 */
import { createHash } from "node:crypto";
type R = Record<string, any>;
const longText = (v: unknown, n = 2) => typeof v === "string" && v.trim().length >= n;
export const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, "");
/** 节目内部说法/比喻示例：在页面正文里出现即须改白话或当场解释（不是完整词表，作者仍须逐句判断）。 */
export const SHORTHAND_EXAMPLES = ["像森林", "不像房子", "长进去", "种子", "少即是多", "破了不会马上立"];
/** 容易被读成人名、品牌、书名的词（示例，作者须逐条扫描并记录）。 */
export const COLLISION_TERMS = ["木心", "鲁迅", "三毛", "老舍", "冰心", "金庸", "三体", "活着", "围城", "小米", "华为", "苹果", "得到", "知乎", "樊登", "罗辑思维", "原则"];
export const NUM_RE = /[0-9０-９]+(?:\.[0-9]+)?|[一二两三四五六七八九十百千万半]+(?=[个次周天本期粒年月日分小条步层种点遍份倍成%])/g;
export function sceneTexts(scene: R): string[] {
  return (scene?.elements ?? []).filter((e: R) => e?.type === "text" && !e.isDeleted && norm(e.text)).map((e: R) => String(e.text));
}
/** 几何指纹：除文字外所有元素（线、箭头、形状、图片）的类型、位置、尺寸、点列和绑定；文字改了不影响。 */
export function geometryHash(scene: R): string {
  const r = (n: unknown) => (typeof n === "number" ? Math.round(n) : n ?? null);
  const items = (scene?.elements ?? []).filter((e: R) => e && !e.isDeleted && e.type !== "text").map((e: R) => [e.type, r(e.x), r(e.y), r(e.width), r(e.height), r(e.angle ?? 0), (e.points ?? []).map((p: number[]) => p.map(r)), e.startBinding?.elementId ?? null, e.endBinding?.elementId ?? null, e.fileId ?? null]);
  items.sort((a: unknown[], b: unknown[]) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256").update(JSON.stringify(items)).digest("hex");
}
/** 自检字段 checks.sentence_cold_read：
 *  items[]: {text, flagged, resolution: plain|rewritten|explained_on_page, original?, reason}
 *  number_trace[]: {text, quote, timestamp} 或 {text, kind:"structural", reason}
 *  label_collision: {status:"pass", findings:[{term, ruling}]}
 *  metaphor_body_plain: {status:"pass", evidence}
 *  outline_items: [章节名…] */
export function assertSentenceColdRead(c: R, scene: R, jargon: string[] = []): void {
  const s = c.checks?.sentence_cold_read;
  if (!s || s.status !== "pass") throw new Error("作者自检缺少逐句冷读 sentence_cold_read（必做，未通过不得展示或登记）");
  const items: R[] = Array.isArray(s.items) ? s.items : [];
  const texts = sceneTexts(scene);
  if (!items.length) throw new Error("sentence_cold_read.items 为空：每句文字须单独记录");
  const covered = new Set(items.map((x) => norm(x?.text)));
  const missing = texts.filter((t) => !covered.has(norm(t)));
  if (missing.length) throw new Error("逐句冷读漏句：" + missing.slice(0, 5).join(" / "));
  for (const x of items) {
    if (!longText(x?.text, 1) || typeof x.flagged !== "boolean" || !longText(x.reason, 2)) throw new Error("逐句冷读条目缺 text/flagged/reason：" + String(x?.text ?? ""));
    if (x.flagged && !(x.resolution === "explained_on_page" && longText(x.explanation, 4))) throw new Error("页面上仍有未改白话的比喻/自造词/节目内部说法：" + x.text);
    if (x.resolution === "rewritten" && !longText(x.original, 1)) throw new Error("rewritten 须写 original（原句）：" + x.text);
  }
  const all = texts.join("\n");
  for (const term of jargon) for (const t of texts.filter((x) => norm(x).includes(norm(term)))) {
    const ok = items.some((x) => norm(x.text) === norm(t) && x.flagged === true && x.resolution === "explained_on_page" && longText(x.explanation, 4));
    if (!ok) throw new Error(`本期术语“${term}”出现在“${t.replace(/\n/g, "")}”，须改白话，或标 flagged 并写明页面上哪里解释了它`);
  }
  const left = SHORTHAND_EXAMPLES.filter((w) => all.includes(w) && !items.some((x) => norm(x.text).includes(w) && x.resolution === "explained_on_page"));
  if (left.length) throw new Error("页面含已知节目内部说法，须改白话或标 explained_on_page：" + left.join("、"));
  if (s.metaphor_body_plain?.status !== "pass" || !longText(s.metaphor_body_plain?.evidence, 6)) throw new Error("缺 metaphor_body_plain：比喻只放主图，正文须直说结论");
  const trace: R[] = Array.isArray(s.number_trace) ? s.number_trace : [];
  for (const t of texts) for (const m of t.match(NUM_RE) ?? []) {
    const ok = trace.some((n) => norm(t).includes(norm(n?.text)) && norm(n?.text).includes(m) && ((longText(n.quote, 4) && longText(n.timestamp, 3)) || (n.kind === "structural" && longText(n.reason, 4))));
    if (!ok) throw new Error(`数字/单位“${m}”（${t.replace(/\n/g, "")}）缺逐字稿原句与时间戳 number_trace`);
  }
  const lc = s.label_collision;
  if (lc?.status !== "pass" || !Array.isArray(lc.findings)) throw new Error("缺 label_collision 标签撞名扫描（人名/品牌/书名）");
  const hits = COLLISION_TERMS.filter((w) => all.includes(w) && !lc.findings.some((f: R) => f?.term === w && longText(f.ruling, 4)));
  if (hits.length) throw new Error("标签可能被读成人名/品牌/书名，须改或写明裁定：" + hits.join("、"));
  const outline = s.outline_items;
  if (!Array.isArray(outline)) throw new Error("缺 outline_items（本页提纲逐项，无提纲写 []）");
  const bad = outline.filter((o: unknown) => /[（(【\[]/.test(String(o)));
  if (bad.length) throw new Error("提纲只写章节名，不加括号注释：" + bad.join("、"));
}
