/** 最终交付图边距：重新测量而非相信作者手填的pass；旧记录必须重检。 */
import {readFileSync, existsSync, realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {isDeepStrictEqual} from "node:util";
type R = Record<string, any>;
const here = dirname(fileURLToPath(import.meta.url));
const script = [resolve(here, "../scripts/audit_rendered_margins.py"), resolve(here, "../audit_rendered_margins.py")].find(existsSync);
function binding(v: R, expected?: R): void {
  if (!v?.path || !v.sha256 || createHash("sha256").update(readFileSync(v.path)).digest("hex") !== v.sha256 ||
      (expected && (realpathSync(v.path) !== realpathSync(expected.path) || v.sha256 !== expected.sha256))) {
    throw new Error("完整边距检查绑定过期或不属于当前工件");
  }
}
export function measureRenderedMargins(mechanical: R): R {
  if (!script || !mechanical.current?.scene || !mechanical.tokens || !mechanical.current.review2x || !mechanical.current.delivery) throw new Error("完整边距检查缺少当前输入");
  const result = spawnSync("python3", [script, "--scene", mechanical.current.scene.path, "--design-tokens", mechanical.tokens.path,
    "--review-png", mechanical.current.review2x.path, "--delivery-png", mechanical.current.delivery.path], {encoding:"utf8"});
  if (result.error || result.status !== 0) throw new Error("真实图片边距未通过：" + (result.stdout || result.stderr || result.error));
  return JSON.parse(result.stdout);
}
export function assertRenderedMargins(mechanical: R, author?: R): R {
  if (!script) throw new Error("缺少完整边距测量脚本");
  if (!mechanical.current?.scene || !mechanical.tokens) throw new Error("完整边距检查缺少当前scene或参数");
  const ref = mechanical.rendered_margin_audit?.record;
  if (mechanical.rendered_margin_audit?.status !== "pass" || !ref) throw new Error("缺少通过的完整边距检查，旧记录须重新检查");
  binding(ref);
  if (author) {
    if (author.checks?.rendered_margin_audit?.status !== "pass") throw new Error("作者记录缺少完整边距检查");
    binding(author.checks.rendered_margin_audit.record, ref);
  }
  const rec = JSON.parse(readFileSync(ref.path, "utf8"));
  if (rec.kind !== "rendered_margin_audit" || rec.schema_version !== "1.0" || rec.status !== "pass") throw new Error("完整边距记录失败或格式过期");
  binding(rec.scene, mechanical.current.scene); binding(rec.tokens, mechanical.tokens);
  for (const k of ["review2x", "delivery"]) {
    if (!mechanical.current[k] || !rec.images?.[k]) throw new Error("完整边距检查缺少当前交付图：" + k);
    binding(rec.images[k].artifact, mechanical.current[k]);
  }
  const measured = measureRenderedMargins(mechanical);
  if (!isDeepStrictEqual(measured, rec)) throw new Error("边距记录数值与当前图片重新测量不一致");
  return rec;
}
