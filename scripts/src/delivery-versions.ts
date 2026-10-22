/** v0.4.7-local P1：一页可登记多个交付版本；草图路线的用户批准可直接记作正式批准。
 * 不要求 construct 产出的 render_manifest：以每个版本自己的 scene、1x、@2x 与作者自检为准，
 * 现场重跑 @2x 尺寸、死白审计、字号/孤行检查，并核对箭头逐条记录。 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pngSize, REVIEW_SIZE } from "./review-2x.js";
import { assertArrowAudit } from "./author-visual-closeout.js";
import { validateArtifact } from "./validate.js";
import { assertSentenceColdRead, geometryHash } from "./sentence-cold-read.js";
type R = Record<string, any>;
const fileHash = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = [resolve(HERE, ".."), resolve(HERE, "../..")].find((d) => existsSync(join(d, "scripts", "audit_dead_space.py"))) ?? resolve(HERE, "..");
export type VersionInput = { version_id: string; scene: string; png: string; review_png: string; self_check: string };
export type RegisterRequest = { page_id: string; versions: VersionInput[]; approved_by: string; approved_at: string; approval_source: "sketch_route_selection" | "rendered_page_review"; route_approval_record?: string; note?: string; userApproved: boolean };
function py(script: string, args: string[]): R {
  const r = spawnSync("python3", [join(ROOT, "scripts", script), ...args], { encoding: "utf8" });
  try { return { code: r.status, out: JSON.parse(r.stdout) }; } catch { return { code: r.status, out: null, err: r.stderr }; }
}
/** v0.4.8-local：只改字路线——几何指纹与上一已登记版本相同时，箭头记录自动沿用该版本。 */
export type PrevVersion = { version_id: string; geometry_sha256: string; self_check: string };
export function checkVersion(workspace: string, v: VersionInput, prev: PrevVersion[] = []): R {
  const abs = (p: string) => resolve(workspace, p);
  for (const p of [v.scene, v.png, v.review_png, v.self_check]) if (!existsSync(abs(p))) throw new Error(`${v.version_id} 缺文件：${p}`);
  const errors: string[] = [];
  const [w, h] = pngSize(abs(v.review_png)), [w1, h1] = pngSize(abs(v.png));
  if (w !== REVIEW_SIZE[0] || h !== REVIEW_SIZE[1] || w !== w1 * 2 || h !== h1 * 2) errors.push(`@2x 尺寸应为 ${REVIEW_SIZE.join("×")}（1x 的两倍），实际 ${w}×${h}`);
  const dead = py("audit_dead_space.py", [abs(v.review_png)]);
  if (dead.out?.status !== "pass") errors.push("死白审计未通过：" + JSON.stringify(dead.out?.dead_zones ?? dead.err));
  const typo = py("check_typography.py", [abs(v.scene)]);
  if (!typo.out?.passed) errors.push("字号/孤行检查未通过：" + JSON.stringify(typo.out?.errors ?? typo.err));
  const check = JSON.parse(readFileSync(abs(v.self_check), "utf8"));
  const sceneData = JSON.parse(readFileSync(abs(v.scene), "utf8")), geo = geometryHash(sceneData);
  let inherited: R | undefined;
  try { assertArrowAudit(check, sceneData); } catch (e) {
    const p = prev.find((x) => x.geometry_sha256 === geo && existsSync(x.self_check));
    if (p) { try { const pc = JSON.parse(readFileSync(p.self_check, "utf8")); assertArrowAudit(pc, sceneData); inherited = { from_version: p.version_id, self_check: { path: p.self_check, sha256: fileHash(p.self_check) }, geometry_sha256: geo }; } catch (e2) { errors.push((e as Error).message + "（沿用上一版也失败：" + (e2 as Error).message + "）"); } }
    else errors.push((e as Error).message);
  }
  try { assertSentenceColdRead(check, sceneData); } catch (e) { errors.push((e as Error).message); }
  return { version_id: v.version_id, status: errors.length ? "fail" : "pass", errors,
    scene: { path: abs(v.scene), sha256: fileHash(abs(v.scene)) }, png: { path: abs(v.png), sha256: fileHash(abs(v.png)) },
    review_png: { path: abs(v.review_png), sha256: fileHash(abs(v.review_png)), size: [w, h] }, self_check: { path: abs(v.self_check), sha256: fileHash(abs(v.self_check)) },
    geometry_sha256: geo, arrow_audit_inherited: inherited ?? null,
    dead_whitespace_audit: dead.out, typography: { passed: typo.out?.passed, errors: typo.out?.errors ?? [], small_text_needs_author_ruling: typo.out?.small_text_needs_author_ruling ?? [] } };
}
export function registerDeliveryVersions(workspace: string, req: RegisterRequest): R {
  if (!req.userApproved) throw new Error("登记交付版本需要 --user-approved（用户明确批准）。");
  if (!req.approved_by?.trim() || Number.isNaN(Date.parse(req.approved_at))) throw new Error("须写明批准人与批准日期。");
  if (!req.versions.length || new Set(req.versions.map((v) => v.version_id)).size !== req.versions.length) throw new Error("交付版本为空或版本号重复。");
  if (req.approval_source === "sketch_route_selection" && !req.route_approval_record) throw new Error("草图路线批准须绑定用户选择记录（--route-approval）。");
  const regPath = join(workspace, "04-rendered", req.page_id, "delivery_versions.json");
  const prevReg = existsSync(regPath) ? JSON.parse(readFileSync(regPath, "utf8")) : null;
  const prev: PrevVersion[] = prevReg?.status === "registered" ? (prevReg.versions ?? []).map((x: R) => ({ version_id: x.version_id, geometry_sha256: x.geometry_sha256 ?? (existsSync(x.scene?.path ?? "") ? geometryHash(JSON.parse(readFileSync(x.scene.path, "utf8"))) : ""), self_check: x.self_check?.path ?? "" })) : [];
  const results = req.versions.map((v) => checkVersion(workspace, v, prev));
  const route = req.route_approval_record ? { path: resolve(workspace, req.route_approval_record), sha256: fileHash(resolve(workspace, req.route_approval_record)) } : undefined;
  const out = join(workspace, "04-rendered", req.page_id); mkdirSync(out, { recursive: true });
  const failed = results.filter((r) => r.status !== "pass");
  const registry: R = { kind: "delivery_versions", version: "0.4.8-local", page_id: req.page_id, status: failed.length ? "blocked" : "registered", approval_source: req.approval_source, approved_by: req.approved_by, approved_at: req.approved_at, route_approval_record: route, note: req.note ?? "", previous_registry: prevReg ? { sha256: fileHash(regPath), versions: prev.map((x) => x.version_id) } : null, versions: results, delivery_png_rule: "交付与看图用 review_png（@2x）", created_at: new Date().toISOString() };
  writeFileSync(join(out, "delivery_versions.json"), JSON.stringify(registry, null, 2) + "\n");
  if (failed.length) return registry;
  const approval: R = { schema_version: "1.0", kind: "human_approval", stage: "visual_page", status: "accepted", artifact_hashes: Object.fromEntries(results.map((r) => [`${req.page_id}:${r.version_id}`, r.review_png.sha256])), reviewed_by: req.approved_by, reviewed_at: new Date(req.approved_at).toISOString(), note: `${req.approval_source}；${req.note ?? ""}`.trim() };
  validateArtifact("human_approval", approval);
  writeFileSync(join(out, "delivery_versions_human_approval.json"), JSON.stringify(approval, null, 2) + "\n");
  registry.human_approval_sha256 = hash(approval);
  writeFileSync(join(out, "delivery_versions.json"), JSON.stringify(registry, null, 2) + "\n");
  return registry;
}
