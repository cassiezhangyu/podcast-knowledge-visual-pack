#!/usr/bin/env node
// Vendored scene renderer (ported v0.6.3 -> v0.4.1-local; used by audit_overlap_margins.py).
// Diagnostic layer renderer only: skips the export mechanics gate. Never use it for delivery PNGs. usage: node scripts/render_scene.mjs in.excalidraw out.png scale [in out scale ...]
// Resolves the bundle relative to this script (or $PKVP_RUNTIME), so it works from any cwd.
// v0.6.1: CJK text must use Simplified Chinese glyphs: Chromium gets a fontconfig that prefers
// Noto Sans CJK SC (scripts/fontconfig/pkvp-fonts.conf), --lang=zh-CN, and <html lang="zh-Hans">.
import { launchZh, newZhPage, ZH_HTML_HEAD } from "./lib/zh_browser.mjs";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
const root = process.env.PKVP_RUNTIME || resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(root, "dist/excalidraw-preview-browser.js");
if (!existsSync(bundle)) { console.error(`missing ${bundle}: run npm run build in the runtime root or set PKVP_RUNTIME`); process.exit(2); }
const args = process.argv.slice(2);
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
