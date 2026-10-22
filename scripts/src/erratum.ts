/** v0.4.7-local P1：批准后勘误通道。只允许错别字/原词修正（如 ASR 误词“狐狸训练”→“壶铃训练”），
 * 由用户确认后：只改 JSON 的字符串值与 Markdown 正文（不改键、ID、哈希字段），再把下游所有批准与门禁里
 * 指向旧哈希的地方换成新哈希，直到不再变化；整条批准链保留，并写 01-understanding/errata.json 留痕。 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
type R = Record<string, any>;
export type Replacement = { old: string; new: string };
export type ErratumRequest = { kind: "typo" | "original_word"; replacements: Replacement[]; confirmed_by: string; confirmed_at: string; note?: string; dirs?: string[] };
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const PROTECTED_KEY = /(^id$|_id$|_ids$|sha256|^path$|_path$|hash)/;
const SKIP_TEXT = /(approval|gate|errata)[^/]*\.json$/;
const MAX_LEN = 24;
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(json|md)$/.test(n)) out.push(p); }
  return out;
}
function mapStrings(v: any, f: (s: string, key: string) => string, key = ""): any {
  if (typeof v === "string") return f(v, key);
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, f, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, f, k)]));
  return v;
}
function validate(req: ErratumRequest): void {
  if (!["typo", "original_word"].includes(req.kind)) throw new Error("勘误只接受 typo（错别字）或 original_word（原词修正）。");
  if (!req.confirmed_by?.trim() || Number.isNaN(Date.parse(req.confirmed_at))) throw new Error("勘误须写明用户确认人与确认时间。");
  if (!req.replacements?.length) throw new Error("勘误须列出 旧→新 文本。");
  for (const r of req.replacements) {
    if (!r.old || !r.new || r.old === r.new) throw new Error("勘误的旧文本和新文本须不同且非空。");
    if (r.old.length > MAX_LEN || r.new.length > MAX_LEN) throw new Error(`勘误单条不超过 ${MAX_LEN} 字；改意思请走重新审批。`);
  }
}
export function applyErratum(workspace: string, req: ErratumRequest): R {
  validate(req);
  const dirs = (req.dirs ?? ["01-understanding", "02-visual-plan", "03-excalidraw", "04-rendered", "05-qa"]).map((d) => join(workspace, d));
  const files = dirs.flatMap((d) => walk(d)).filter((p) => !p.endsWith("errata.json"));
  const hashMap: Record<string, string> = {}; const changed: R[] = [];
  const record = (p: string, before: string, after: string) => {
    const e: R = { file: relative(workspace, p), file_sha256: [sha(before), sha(after)] };
    hashMap[sha(before)] = sha(after);
    if (p.endsWith(".json")) { const b = sha(JSON.stringify(JSON.parse(before))), a = sha(JSON.stringify(JSON.parse(after))); hashMap[b] = a; e.json_sha256 = [b, a]; }
    changed.push(e);
  };
  const textScope = files.filter((p) => p.includes("/01-understanding/") && !SKIP_TEXT.test(p));
  const counts: Record<string, number> = {};
  for (const p of textScope) {
    const before = readFileSync(p, "utf8"); let after: string;
    const swap = (s: string) => req.replacements.reduce((acc, r) => { const n = acc.split(r.old).length - 1; if (n) counts[r.old] = (counts[r.old] ?? 0) + n; return acc.split(r.old).join(r.new); }, s);
    if (p.endsWith(".md")) after = swap(before);
    else { const v = JSON.parse(before); const nv = mapStrings(v, (s, k) => PROTECTED_KEY.test(k) ? s : swap(s)); if (JSON.stringify(nv) === JSON.stringify(v)) continue; after = JSON.stringify(nv, null, 2) + "\n"; }
    if (after !== before) { writeFileSync(p, after); record(p, before, after); }
  }
  for (const r of req.replacements) if (!counts[r.old]) throw new Error(`没有找到要勘误的原文：${r.old}`);
  // 下游批准/门禁/预检里的旧哈希换新哈希，迭代到不再变化
  for (let round = 0; round < 12; round++) {
    let moved = false;
    for (const p of files.filter((f) => f.endsWith(".json"))) {
      const before = readFileSync(p, "utf8"); let v: any; try { v = JSON.parse(before); } catch { continue; }
      const nv = mapStrings(v, (s) => hashMap[s] ?? s);
      if (JSON.stringify(nv) === JSON.stringify(v)) continue;
      const after = JSON.stringify(nv, null, 2) + "\n"; writeFileSync(p, after); record(p, before, after); moved = true;
    }
    if (!moved) break;
  }
  const logPath = join(workspace, "01-understanding", "errata.json");
  const log: R = existsSync(logPath) ? JSON.parse(readFileSync(logPath, "utf8")) : { kind: "errata_log", version: "0.4.7-local", entries: [] };
  const entry = { kind: req.kind, replacements: req.replacements, occurrences: counts, confirmed_by: req.confirmed_by, confirmed_at: req.confirmed_at, note: req.note ?? "", applied_at: new Date().toISOString(), approvals_preserved: true, changed_files: changed };
  log.entries.push(entry); writeFileSync(logPath, JSON.stringify(log, null, 2) + "\n");
  return entry;
}
