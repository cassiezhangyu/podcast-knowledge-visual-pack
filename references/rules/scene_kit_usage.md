# 绘图工具包 scene_kit 用法与物件完成度下限

`scripts/lib/scene_kit.py` 让任何模型、任何平台写出的 scene 都遵守同一套字号、笔触、色阶和页面合同件。它**不提供构图模板**：主视觉画什么、放哪里、怎样表达关系，仍按 `visual_reasoning.md` 与当期创作包决定。

## 1. 最小用法

```python
import sys; sys.path.insert(0, "<skill>/scripts/lib")
from scene_kit import Board, Palette

p = Palette.from_library("04")          # 由色卡派生 dark/mid/tint/soft 与 under_text 色阶
b = Board("p01", p)                     # 字号、笔触从 assets/design_tokens.json 读取
b.chrome(meta="节目名 / 知识总览", title="……", subtitle="……", conclusion="……")
# ……主视觉：b.rect / b.ellipse / b.poly / b.line / b.text，多部件物件自行组合……
b.outline(1436, "① …  ② …  ③ …")
b.footer(["节目：《…》", "回听：整期 0:00:00–…"], "第01页 / 共01页")
b.finish("03-visual/<case>/P01.excalidraw")   # 未通过检查即抛出 SceneKitError，不写文件
```

- `text(x, y, s, role)` 的 `role` 必须是 `typography.role_sizes` 里的角色；强角色自动加 0.8px 重影。不接受直接传字号。
- 图形的 `role` 必须是 `stroke.role_settings` 里的角色；宽度超过 60px 的椭圆遇到 roughness > 1 自动改用 `curve`。
- 需要承载文字的底色传 `under_text=True`，颜色用 `p.under_text_primary` / `p.under_text_accent`。传入更深的颜色时立即报错，因为压线审计会把它当墨迹。
- 页面背景等确需铺满画布的元素传 `allow_outside=True`。
- 派生色可以按当期需要覆盖属性（如 `p.accent_soft = "#FFF0E4"`），但覆盖后放在文字下的颜色仍须通过 `under_text_ok()`。

## 2. finish() 出图前检查

`finish()` 在写文件前拦下这些问题，不必等到渲染后才返工：

- 文字超出 x∈[80,1120] 或画布；
- 两段文字的外框相交（强角色重影除外）；
- 文字压在实心图形上（`solid=False` 的装饰线与 `under_text=True` 的浅底除外）；
- roughness ≥1.6 的图形（`object`、`relation`、`emphasis` 等）离安全区边缘不足 3px：这类笔触会外溢 2–4px，触发渲染后边距审计失败。roughness ≤1.4 的徽章、细节和信息框放在 x=80 时实测墨迹约 77.5，正好达标，可以贴边。文字宽度是估算值（中文偏宽约 3%），越界判断已扣除这部分。

通过 `finish()` 只说明几何上没有明显碰撞。渲染后的像素级压线、边距、留白与字形检查仍由 `render-scene-checked.mjs` 执行。

## 3. 页面合同件

`chrome()`、`outline()`、`footer()` 固定页眉、本页提纲和页脚的位置与角色：栏目标签 y=64，主标题 y=100，副标题 y=162，页眉线 y=206，整页结论 y=220；页脚线 y=1512，来源两行 y=1524/1552，页码右对齐。副标题只写本页内容陈述，不写节目名、专辑名或期号（见 `typography_hierarchy.md`「副标题」）。

## 4. 物件完成度下限（校准参考，不是硬参数）

工具包里的 `crate`、`folder`、`cup`、`parcel`、`book` 只用来校准“画到什么程度才算一个物件”，不要求每页使用。自画物件时对照下面几条，达不到就继续画，不要用文字标签代替：

1. **至少三个部件**：主体 + 能识别类别的结构件（壶嘴、提手、封条、屋顶）+ 一处细节（刻度、纹路、蒸汽）。只有一个矩形或圆加文字，不算物件。
2. **有填色层次**：主体用 tint 或 soft，结构件用同色相更深一级，细节线用 mid。整页不能全是空心线框。
3. **大小服从解释职责**：承担主解释的对象明显大于辅助物件；同级场景里的物件大小一致。
4. **笔触按角色**：主体 `object` 或 `object_simple`，细节 `detail`，曲线 `curve`。不要用高 roughness 的折线拼曲线。
5. **离文字留空**：物件与它的说明文字之间至少空出 8px，说明文字不压物件。

本期 EP86 总览定稿（`assets/examples/positive/ep86-overview-delivery-flow-user-approved-2026-10-24`）里的管道、漏斗、包裹和泡茶小场景，可以作为这一下限的实例。
