#!/usr/bin/env node
// v0.6.1 CJK glyph audit. usage: node scripts/audit_cjk_glyphs.mjs scene.excalidraw [report.json] [sheet.png]
// For every unique CJK char / full-width punctuation in the scene's text elements, render it in the real
// render path (zh launcher + the element's Excalidraw font string) and compare against reference renders in
// "<same primary family>, Noto Sans CJK SC" and "..., Noto Sans CJK JP" (same metrics, only the CJK fallback differs). Also asks Chromium (CDP CSS.getPlatformFontsForNode) which
// platform font each char used. Exit 1 if any char is not pixel-identical to SC or resolves to a non-SC face.
import { readFileSync, writeFileSync } from "node:fs";
import { launchZh, newZhPage, ZH_HTML_HEAD } from "./lib/zh_browser.mjs";
const [scenePath, reportPath, sheetPath] = process.argv.slice(2);
if (!scenePath) { console.error("usage: audit_cjk_glyphs.mjs scene.excalidraw [report.json] [sheet.png]"); process.exit(2); }
const FAM = { 1: "Virgil", 2: "Helvetica", 3: "Cascadia", 5: "Excalifont", 6: "Nunito", 7: "Lilita One", 8: "Comic Shanns", 9: "Liberation Sans" };
const isCJK = (c) => { const o = c.codePointAt(0); return (o >= 0x2e80 && o <= 0x9fff) || (o >= 0x3000 && o <= 0x303f) || (o >= 0xff00 && o <= 0xffef) || (o >= 0xf900 && o <= 0xfaff); };
const els = JSON.parse(readFileSync(scenePath, "utf8")).elements.filter((e) => e.type === "text" && !e.isDeleted);
if (els.some(e => e.fontFamily !== 2)) throw new Error("当前字形审计只适用于已验证的 fontFamily=2。");
const byFam = {};
for (const e of els) { const f = FAM[e.fontFamily] || "Helvetica"; (byFam[f] ||= new Set()); for (const c of e.text) if (isCJK(c)) byFam[f].add(c); }
const browser = await launchZh();
const page = await newZhPage(browser);
await page.setContent(`${ZH_HTML_HEAD}<body></body>`);
const results = [];
try {
for (const [fam, set] of Object.entries(byFam)) {
  const chars = [...set].sort();
  if (fam !== "Helvetica") throw new Error("当前正式字体合同仅支持 fontFamily=2；其他字体须另行验证字形路径。");
  const famStr = process.env.PKVP_GLYPH_NEGATIVE_CONTROL === "1" ? 'Helvetica, "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP"' : `${fam}, Segoe UI Emoji`;
  const pix = await page.evaluate(async ([chars, famStr, fam, scFont, jpFont]) => {
    const S = 96, cv = document.createElement("canvas"); cv.width = S * 3; cv.height = S; const g = cv.getContext("2d");
    const draw = (c, f, x) => { g.font = `72px ${f}`; g.fillStyle = "#000"; g.textBaseline = "alphabetic"; g.fillText(c, x + 12, 76); };
    const grab = (x) => g.getImageData(x, 0, S, S).data;
    const out = [];
    for (const c of chars) {
      g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
      draw(c, famStr, 0); draw(c, `${fam}, "${scFont}"`, S); draw(c, `${fam}, "${jpFont}"`, 2 * S);
      // binarise and compare with 1px tolerance, so anti-aliasing / hinting noise is ignored and only glyph form counts
      const bin = (d) => { const m = new Uint8Array(S * S); for (let i = 0; i < m.length; i++) m[i] = d[i * 4] < 128 ? 1 : 0; return m; };
      const dil = (m) => { const o = new Uint8Array(m.length); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (m[y * S + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < S && xx >= 0 && xx < S) o[yy * S + xx] = 1; } return o; };
      const diff = (p, q) => { const dp = dil(p), dq = dil(q); let n = 0; for (let i = 0; i < p.length; i++) if ((p[i] && !dq[i]) || (q[i] && !dp[i])) n++; return n; };
      const a = bin(grab(0)), b = bin(grab(S)), j = bin(grab(2 * S));
      const dSC = diff(a, b), dJP = diff(a, j), dSJ = diff(b, j);
      out.push({ c, dSC, dJP, dSJ, scDiffersFromJP: dSJ > 12, png: dSJ > 12 ? cv.toDataURL() : null });
    }
    return out;
  }, [chars, famStr, fam, process.platform === "darwin" ? "PingFang SC" : "Noto Sans CJK SC", process.platform === "darwin" ? "Hiragino Kaku Gothic ProN" : "Noto Sans CJK JP"]);
  // CDP: which platform font did layout actually use, per char
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  await page.evaluate(([chars, famStr]) => { document.body.innerHTML = chars.map((c, i) => `<span id="c${i}" style="font:40px ${famStr}">${c}</span>`).join(""); }, [chars, famStr]);
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const node of document.querySelectorAll('span')) node.getBoundingClientRect();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  for (let i = 0; i < chars.length; i++) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `#c${i}` });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    const r = pix[i]; r.family = fam; r.platformFonts = fonts.map((f) => f.familyName).join(" | ");
    r.ok = r.dSC <= 12 && (!r.scDiffersFromJP || r.dJP > r.dSC) && /CJK SC|PingFang SC|Heiti SC|Songti SC/.test(r.platformFonts) && !/CJK (JP|TC|KR|HK)|Hiragino|PingFang (TC|HK)/.test(r.platformFonts);
    results.push(r);
  }
}
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok), affected = results.filter((r) => r.scDiffersFromJP);
const summary = { scene: scenePath, unique_chars: results.length, resolve_sc: results.length - bad.length,
  failures: bad.map((r) => ({ c: r.c, family: r.family, platformFonts: r.platformFonts, dSC: r.dSC })),
  sc_differs_from_jp: affected.map((r) => r.c).join(""), pass: bad.length === 0 };
if (reportPath) writeFileSync(reportPath, JSON.stringify({ ...summary, detail: results.map(({ png, ...r }) => r) }, null, 1));
if (sheetPath && affected.length) {
  // contact sheet: each affected char as [render path | SC ref | JP ref]
  const b2 = await launchZh(); const p2 = await newZhPage(b2, { viewport: { width: 1400, height: 400 } });
  const cols = 4, cells = affected.map((r) => `<div style="display:inline-block;margin:6px;border:1px solid #ccc"><img src="${r.png}" width="288"><div style="font:14px sans-serif;text-align:center">${r.c} · render | SC | JP</div></div>`);
  await p2.setContent(`${ZH_HTML_HEAD}<body style="margin:8px;width:${cols * 306}px;background:#fff">${cells.join("")}</body>`);
  await p2.screenshot({ path: sheetPath, fullPage: true }); await b2.close();
}
console.log(JSON.stringify(summary));
process.exit(summary.pass ? 0 : 1);
