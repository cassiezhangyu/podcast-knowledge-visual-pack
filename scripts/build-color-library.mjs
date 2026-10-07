import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');
const catalog = JSON.parse(fs.readFileSync(path.join(assets, 'color-library.json'), 'utf8'));

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const blendWhite = (hex, fraction) => '#'+rgb(hex).map((v) =>
  Math.round(v * (1 - fraction) + 255 * fraction).toString(16).padStart(2, '0')).join('').toUpperCase();
const luminance = (hex) => {
  const linear = rgb(hex).map((v) => v / 255).map((v) =>
    v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
};
const contrast = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
};

if (catalog.palettes.length !== 12 || new Set(catalog.palettes.map((p) => p.id)).size !== 12) {
  throw new Error('色卡需要 12 组唯一编号的配色');
}
for (const p of catalog.palettes) {
  if (contrast(p.primary, catalog.paper) < 5 || contrast(p.accent, catalog.paper) < 5) {
    throw new Error(`${p.id} 的正文强调色在白底上的对比不足 5:1`);
  }
}

const cards = catalog.palettes.map((p) => {
  const cool = blendWhite(p.primary, catalog.surface_blend.primary_with_white);
  const warm = p.accent_surface ?? blendWhite(p.accent, catalog.surface_blend.accent_with_white);
  if (contrast(catalog.ink, cool) < 4.5 || contrast(catalog.ink, warm) < 4.5) {
    throw new Error(`${p.id} 的浅色铺面不能承载黑色文字`);
  }
  return `<article class="card">
    <header><span class="id">${p.id}</span><strong>${p.name}</strong><em>${p.mood}</em></header>
    <div class="surfaces">
      <div class="cool" style="background:${cool};border-color:${p.primary}">
        <b>冷色主视觉</b><span>浅色铺面 ${cool}</span><i style="background:${p.primary}"></i>
      </div>
      <div class="warm" style="background:${warm};border-color:${p.accent}">
        <b>暖色点睛</b><span>局部提示 ${warm}</span><i style="background:${p.accent}"></i>
      </div>
    </div>
    <div class="sample">
      <b>页面标题保持黑色</b>
      <span style="color:${p.primary}">核心结论由冷色引导</span>
      <small><mark style="color:${p.accent}">边界 / 反证</mark>　正文仍以深色阅读</small>
    </div>
    <div class="hex"><span>主色文字 / 线条 <code>${p.primary}</code></span><span>辅色文字 / 线条 <code>${p.accent}</code></span></div>
  </article>`;
}).join('');

const cautions = catalog.not_recommended.map((p) => `
  <div class="caution"><span class="bad-swatches"><i style="background:${p.primary}"></i><i style="background:${p.accent}"></i></span><span><b>${p.name}</b><small>${p.reason}</small></span></div>`).join('');

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>知识视觉包色彩库 · 冷主暖辅</title><style>
*{box-sizing:border-box}html,body{margin:0;background:#fff;color:${catalog.ink};font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}main{width:2100px;margin:auto;padding:52px 60px 48px}.top{display:flex;justify-content:space-between;align-items:end;padding-bottom:21px;border-bottom:2px solid #5b6870}.kicker{font-size:19px;color:#72808a;letter-spacing:2.7px}.title{font-size:48px;font-weight:650;margin-top:8px}.intro{font-size:21px;line-height:1.5;color:#616d74;text-align:right}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:25px}.card{height:335px;border:1px solid #d6dfe3;border-radius:8px;padding:18px 21px;background:#fff}.card header{display:flex;align-items:baseline;gap:10px;white-space:nowrap}.card header .id{font-size:20px;color:#809099;font-weight:650}.card header strong{font-size:26px;font-weight:650}.card header em{font-size:17px;color:#879298;font-style:normal;margin-left:auto}.surfaces{display:grid;grid-template-columns:1.65fr 1fr;gap:9px;margin-top:15px;height:108px}.surfaces>div{position:relative;border:1px solid;padding:12px 14px;display:flex;flex-direction:column;gap:7px;overflow:hidden}.surfaces b{font-size:21px}.surfaces span{font-size:16px;color:#5c6870}.surfaces i{position:absolute;bottom:0;left:0;width:100%;height:8px}.sample{height:105px;margin-top:12px;padding:10px 13px;border-left:3px solid #d9e1e4;background:white;display:flex;flex-direction:column;gap:4px}.sample b{font-size:20px;font-weight:600}.sample>span{font-size:20px;font-weight:650}.sample small{font-size:17px;color:#343c44}.sample mark{background:none;font-weight:650}.hex{display:flex;gap:15px;margin-top:10px;font-size:16px;color:#6e7a81}.hex span{flex:1;white-space:nowrap}.hex code{color:#343c44;font-family:inherit;font-weight:650}.cautions{margin-top:26px;padding:16px 20px;border-top:1px solid #cdd7db;border-bottom:1px solid #cdd7db;display:flex;align-items:center;gap:25px}.cautions h2{font-size:22px;margin:0 12px 0 0;white-space:nowrap}.caution{display:flex;align-items:center;gap:12px;flex:1}.bad-swatches{display:flex;gap:4px}.bad-swatches i{display:block;width:43px;height:38px;border:1px solid #d4dade}.caution b,.caution small{display:block}.caution b{font-size:18px}.caution small{font-size:15px;color:#768189;margin-top:3px}.footer{display:flex;justify-content:space-between;margin-top:18px;font-size:18px;color:#66737b}.footer strong{color:#30343e}
</style></head><body><main><div class="top"><div><div class="kicker">PODCAST KNOWLEDGE VISUAL PACK · COLOR LIBRARY ${catalog.version}</div><div class="title">清亮冷色，暖色点睛</div></div><div class="intro">有力度的冷色用于重点文字与线条；高明度浅底让页面明亮。<br>按通用推荐顺序排列，选定后仍以真实页面和手机图复核。</div></div><div class="grid">${cards}</div><div class="cautions"><h2>避免这样用</h2>${cautions}</div><div class="footer"><span>主辅色在白底的文字对比均高于 5:1；浅色铺面只配深色文字。所有 HEX 可用于 Excalidraw 原生元素。</span><strong>回复 01—12 选色</strong></div></main></body></html>`;
fs.writeFileSync(path.join(assets, 'color-library.html'), html);
console.log(path.join(assets, 'color-library.html'));
