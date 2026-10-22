import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
type R = Record<string, any>;
export const REVIEW_SCALE = 2;
export const REVIEW_SIZE: [number, number] = [2400, 3200];
export function pngSize(path: string): [number, number] {
  const b = readFileSync(path);
  if (b.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error("不是PNG：" + path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
/** v0.4.6：@2x 是给用户看图和交付的版本；1x 仅内部检查。旧记录（无 review_2x）按历史版本放行，标注 legacy。 */
export function checkReview2x(mechanical: R, page?: R, resolvePath: (p: string) => string = (p) => p): { status: "pass" | "legacy_1x_only" } {
  const current = mechanical.current as R;
  if (!mechanical.review_2x && !current?.review2x && !page?.review_png) return { status: "legacy_1x_only" };
  const meta = mechanical.review_2x as R | undefined, art = current?.review2x as R | undefined;
  if (!meta || !art?.path || !existsSync(art.path)) throw new Error("缺少 @2x 看图/交付图（P01@2x.png）。");
  if (createHash("sha256").update(readFileSync(art.path)).digest("hex") !== art.sha256) throw new Error("@2x 图文件已变化。");
  if (meta.scene_sha256 !== current.scene?.sha256 || (page?.scene_sha256 && page.scene_sha256 !== current.scene?.sha256 && page.scene_sha256 !== meta.scene_sha256)) throw new Error("@2x 图与 1x 不是同一 scene。");
  const [w, h] = pngSize(art.path), [w1, h1] = pngSize(current.png.path);
  if (w !== REVIEW_SIZE[0] || h !== REVIEW_SIZE[1] || meta.scale !== REVIEW_SCALE) throw new Error(`@2x 尺寸应为 ${REVIEW_SIZE.join("×")}，实际 ${w}×${h}。`);
  if (w * h1 !== h * w1 || w !== w1 * REVIEW_SCALE) throw new Error("@2x 与 1x 比例不一致。");
  if (page) {
    if (!page.review_png || page.review_png_sha256 !== art.sha256) throw new Error("渲染清单遗漏或错绑 @2x 图。");
    if (resolvePath(page.review_png) !== art.path && createHash("sha256").update(readFileSync(resolvePath(page.review_png))).digest("hex") !== art.sha256) throw new Error("清单中的 @2x 图与机械记录不一致。");
  }
  return { status: "pass" };
}
