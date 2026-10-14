# 历史背景（从规则正文移出）

> 这里保存规则“为什么这样定”的排查经过，供需要时查阅；现行规则以 rules/ 为准，版本记录见 CHANGELOG.md。

## 抖线根因（handdrawn_strokes.md 移出，ETF E177 总览 A-V7，2026-10-13）

下面 v0.5.1 的规则现在就是 `design_tokens.json` 的 `stroke.path_limits`（≤6 点；>220px 路径与 >60px 椭圆 roughness ≤1.0），`relation`／`emphasis` 下调到 1.4；`audit_stroke_shapes.py` 直接读 token。按 token 选角色即可，不需要另作绕行。手绘感保留：curve 0.9、frame 1.1、短 object 2.0。

## v0.5.1 抖线根因（ETF E177 总览，Cassie 2026-10-13）

A-V7 的“抖、颤”不是 token 数值错，而是**路径形状和角色分配**错：飞轮四段弧各 11 点且用 `relation`（roughness 2.0）、成分股大椭圆用 `object`（2.0）、S 曲线 21 点、长箭头用 `relation`。roughness 在每个顶点叠加偏移，点越多、路径越长越像手抖；`emphasis`（1.6）画在弧线上会出现可见的双线。硬规则：

A-V7 的“抖、颤”不是 token 数值错，而是**路径形状和角色分配**错：飞轮四段弧各 11 点且用 `relation`（roughness 2.0）、成分股大椭圆用 `object`（2.0）、S 曲线 21 点、长箭头用 `relation`。`emphasis`（1.6）画在弧线上会出现可见的双线。

## 简体字形根因（cjk_glyphs.md 移出，ETF E177 A-V34，2026-10-14）

- 场景文字用 Excalidraw 的 Helvetica（`fontFamily: 2`），它的回退链只有 `Segoe UI Emoji`，没有中文字体。
- 中文因此交给系统字体回退：Linux 上由 fontconfig 决定，Helvetica／sans-serif 的 CJK 回退解析为 `Noto Sans CJK JP`（另一台机器上没有语言提示时甚至落到韩文 NanumGothic）。
- 渲染页面没有 `lang`，Chromium 也没有中文 locale，没有任何东西把回退推向 SC。
- 结果：“门”“直”“骨”“关”等字是日文字形，冒号逗号居中。看起来“字有点怪”，脚本审计也查不出来。
