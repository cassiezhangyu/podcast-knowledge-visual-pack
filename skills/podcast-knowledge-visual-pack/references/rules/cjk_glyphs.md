# 中文字形规则：一律简体中文字形

**规则：** 成图里的所有中文字符和全角标点，都必须用简体中文字形（Noto Sans CJK SC 或其它 SC 字体）渲染；不得落到日文（JP）、繁体（TC/HK）或韩文（KR）字形。全角标点（，。、：；！？）也必须是简体中文位置（靠左下），不是日文的居中位置。

> 作者自检必做项；平台参考与实现细节见 `render_diagnostics.md`。

## 做法（所有渲染器必须一致）

1. 所有渲染器都通过 `scripts/lib/zh_browser.mjs` 启动 Chromium（`zhLaunchOptions` / `launchZh` / `newZhPage` / `ZH_HTML_HEAD`）：
   - `FONTCONFIG_FILE=scripts/fontconfig/pkvp-fonts.conf`（lang=zh-cn；Helvetica、sans-serif、Segoe UI Emoji 优先 Noto Sans CJK SC）；
   - `--lang=zh-CN`、`LANG=zh_CN.UTF-8`、页面 `locale: "zh-CN"`；
   - 渲染页面 `<html lang="zh-Hans">`。
   `scripts/src/render.ts`（`npm run render`）用同样的设置。Mac 上的 Chrome 不读 fontconfig，靠 lang/locale 选 SC。
2. 新写的渲染器不得直接 `chromium.launch()`；必须用上面的启动器。

## 门禁（交付前必跑）

`node scripts/audit_cjk_glyphs.mjs <scene.excalidraw> [report.json] [contact-sheet.png]`

- 列出场景所有文字元素中的每个中文字符与全角标点（按字体族分组）；
- 在真实渲染路径里逐字渲染，与“同一主字体 + Noto Sans CJK SC”“同一主字体 + Noto Sans CJK JP”参照对比（二值化、1px 容差，只比字形不比抗锯齿）；
- 用 CDP `CSS.getPlatformFontsForNode` 确认实际使用的平台字体是 SC；
- 任何一个字不等于 SC 参照，或平台字体是 JP/TC/KR/HK → exit 1。
- 可选输出 SC≠JP 字的对照图（渲染 | SC | JP），交付前亲眼看一遍。
- 反向对照：`PKVP_GLYPH_NEGATIVE_CONTROL=1` 只用于证明审计能抓到错误回退，不得用于正式渲染。

## 默认字体与语言

- 中文默认字体：Linux 为 Noto Sans CJK SC，Mac 为 PingFang SC；页面语言 `zh-CN` locale、`<html lang="zh-Hans">`。
- 自检记录 `cjk_glyph_audit`：当前 scene、报告路径、exit code、实际平台字体；失败或缺字体不得记 `self_check_passed`，也不得展示给用户。
