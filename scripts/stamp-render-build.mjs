// 构建成功后绑定源代码与浏览器产物，防止忘记重建而沿用旧门禁。
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const paths=['scripts/src/scene-mechanics.ts','scripts/src/excalidraw-preview-browser.ts','dist/scene-mechanics.js','dist/excalidraw-preview-browser.js','scripts/render-scene-checked.mjs','scripts/check_fixed_chrome.py','scripts/lib/zh_browser.mjs','scripts/lib/rendered-geometry.mjs','scripts/fontconfig/pkvp-fonts.conf','scripts/audit_cjk_glyphs.mjs','scripts/audit_scene_layout.py'];
writeFileSync('dist/render-build.json',JSON.stringify({kind:'render_build',files:paths.map(path=>({path,sha256:sha(path)}))},null,2)+'\n');
