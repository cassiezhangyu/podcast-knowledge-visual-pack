// v0.6.1 shared launcher: every renderer must use this so CJK resolves to Simplified Chinese glyphs.
// Root cause it fixes: Excalidraw's Helvetica (fontFamily 2) carries no CJK fallback, so Chromium asks
// fontconfig, which on Linux boxes resolves Helvetica/sans-serif CJK to "Noto Sans CJK JP" (门/骨/直/关…
// in JP forms, full-width ：，；centred). We force a fontconfig preferring Noto Sans CJK SC + zh-CN locale.
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
export const FONTCONF = join(dirname(fileURLToPath(import.meta.url)), "..", "fontconfig", "pkvp-fonts.conf");
export const ZH_HTML_HEAD = '<!doctype html><html lang="zh-Hans"><meta charset="utf-8">';
export function zhLaunchOptions(extra = {}) {
  // PKVP_GLYPH_NEGATIVE_CONTROL=1 is only for proving audit_cjk_glyphs catches JP fallback; never for production renders.
  if (process.env.PKVP_GLYPH_NEGATIVE_CONTROL === "1") return { headless: true, ...extra };
  if (!existsSync(FONTCONF)) throw new Error(`missing ${FONTCONF}`);
  return { headless: true, ...extra, args: ["--lang=zh-CN", ...(extra.args || [])],
    env: { ...process.env, ...(extra.env || {}), FONTCONFIG_FILE: FONTCONF, LANG: "zh_CN.UTF-8" } };
}
export async function launchZh(extra = {}) {
  const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath = process.env.PODCAST_MAP_CHROME_PATH || (process.platform === "darwin" && existsSync(macChrome) ? macChrome : undefined);
  return chromium.launch(zhLaunchOptions({ ...(executablePath ? { executablePath } : {}), ...extra }));
}
export async function newZhPage(browser, opts = {}) { return browser.newPage({ locale: "zh-CN", ...opts }); }
