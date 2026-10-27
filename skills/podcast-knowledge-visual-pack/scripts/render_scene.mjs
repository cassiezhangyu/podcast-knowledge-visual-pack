#!/usr/bin/env node
// Vendored scene renderer (ported v0.6.3 -> v0.4.1-local; used by audit_overlap_margins.py).
// Diagnostic layer renderer only: skips the export mechanics gate. Never use it for delivery PNGs. usage: node scripts/render_scene.mjs in.excalidraw out.png scale [in out scale ...]
// Resolves the bundle relative to this script (or $PKVP_RUNTIME), so it works from any cwd.
// CJK text must use Simplified Chinese glyphs: Chromium gets a fontconfig that prefers
// Noto Sans CJK SC (scripts/fontconfig/pkvp-fonts.conf), --lang=zh-CN, and <html lang="zh-Hans">.
import { launchZh, newZhPage, ZH_HTML_HEAD } from "./lib/zh_browser.mjs";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
const root = process.env.PKVP_RUNTIME || resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(root, "dist/excalidraw-preview-browser.js");
if (!existsSync(bundle)) { console.error(`missing ${bundle}: run npm run build in the runtime root or set PKVP_RUNTIME`); process.exit(2); }
let args = process.argv.slice(2);
// hard gate: no scene may be rendered before a passing REFERENCE_PREFLIGHT.
// Only the internal layered audit (audit_overlap_margins.py) sets PKVP_AUDIT_LAYER=1.
import { spawnSync } from "node:child_process";
let preflight = null;
const pi = args.indexOf("--preflight");
if (pi >= 0) { preflight = args[pi + 1]; args.splice(pi, 2); }
if (!preflight && process.env.PKVP_AUDIT_LAYER !== "1") { console.error("拒绝渲染：缺少 --preflight <REFERENCE_PREFLIGHT.json>。构图前参考硬门禁见 references/rules/page_visual_production.md §2。"); process.exit(3); }
if (preflight) for (let i = 0; i < args.length; i += 3) {
  const r = spawnSync("python3", [join(root, "scripts/check_reference_preflight.py"), "--scene", resolve(args[i]), "--preflight", resolve(preflight)], { encoding: "utf8" });
  if (r.status !== 0) { console.error("拒绝渲染：联合预检未通过\n" + (r.stderr || r.stdout)); process.exit(3); }
}
if (args.length === 0 || args.length % 3) { console.error("usage: render_scene.mjs in out scale [...]"); process.exit(2); }
const temp = mkdtempSync(join(tmpdir(), "pkvp-render-"));
writeFileSync(join(temp, "p.html"), `${ZH_HTML_HEAD}<script src="${pathToFileURL(bundle).href}"></script>`);
const browser = await launchZh();
try {
  const page = await newZhPage(browser, { viewport: { width: 1280, height: 1800 } });
  await page.goto(pathToFileURL(join(temp, "p.html")).href);
  for (let i = 0; i < args.length; i += 3) {
    const scene = JSON.parse(readFileSync(resolve(args[i]), "utf8"));
    const url = await page.evaluate(async ([s, k]) => window.renderSceneLayerForAudit(s, k), [scene, Number(args[i + 2])]);
    writeFileSync(resolve(args[i + 1]), Buffer.from(url.split(",")[1], "base64"));
    console.log("ok", args[i + 1]);
  }
} finally { await browser.close(); }
