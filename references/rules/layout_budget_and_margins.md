# 排版预算与边距留白审计（作者自检必做项）

由当前主会话执行，不创建审核 agent。

## 1. 出图前：排版预算

正式渲染前先算版面，免得画完才发现挤或空：

- 计划阶段：`python3 scripts/layout_budget.py budget.json`。budget 写 `body_top`、`footer_rule_y`、`min_gap`、`footer_gap` 与各块估算高度（行数 × 该级行高 + 图形高度）。超出页脚留白或任何间距小于 `min_gap` 即 exit 1。
- 草稿 scene：`python3 scripts/layout_budget.py --scene draft.excalidraw [--min-gap 12] [--footer-gap 12]`，按每个文字元素的字号 × 行高 × 行数估算真实高度，检查纵向重叠与页脚线上方留白。
- 用 `scripts/lib/scene_kit.py` 绘制时，`finish()` 会先拦下文字互叠、文字压实心图形和图形贴边（见 `scene_kit_usage.md`）。
- 超出时删字或重排，**不缩小字号**抢救。

## 2. 导出时自动执行：重叠、边距与页眉页脚留白

`render-scene-checked.mjs` 在真实导出前自动运行 `layout_budget.py --scene`（封面除外）和 `audit_overlap_margins.py`。任一失败即停止，**不生成候选图**；结果写入输出目录的 `LAYOUT_BUDGET.txt`、`OVERLAP_MARGIN_AUDIT.json`，并绑定进 `MECHANICAL_RENDER_RECORD.json` 的 `layout_budget` 与 `overlap_margin_audit`。需要单独诊断时也可手动运行 `python3 scripts/audit_overlap_margins.py <scene.excalidraw> [scale]`。失败条件：

- 文字×线条、文字×排线、文字×文字的像素重叠（含 2px 膨胀，即"碰线"也算）；
- 墨迹超出 x∈[80,1120]（专辑封面位除外）；
- 左右边距不对称 >6px；
- 页面顶端首个墨迹 <40px；
- 页眉线到正文首个墨迹 <12px；正文末墨迹到页脚线 <12px。

### 两条容易踩的像素规则

1. **文字下的底色必须足够浅。** 审计把 `765 − (R+G+B) > 40` 的像素当作墨迹，所以放文字的底色合计 RGB 须 ≥ 725。例如 `#F1F7FA`、`#FFF6EE` 可以，`#E7F1F6`、`#FFF0E4` 会被判为文字压图形。用 `scene_kit` 的 `palette.under_text_primary / under_text_accent`，或用 `under_text_ok()` 先算。
2. **粗笔触图形离安全区边缘留 3–5px。** roughness ≥1.6 的图形（object、relation、emphasis），实际笔触会越过坐标 2–4px；坐标贴在 x=80 或 1120 时，审计会报出界和左右不对称。roughness ≤1.4 的徽章、细节、信息框和排版线贴在 x=80 时实测墨迹约 77.5，正好达标。

结果记入当前 `RENDERED_PAGE_CHECK.json` 的 `layout_budget` 与 `margin_audit`；`author-check:init` 会从机械记录自动填入命令、状态和记录绑定。任一失败不得记 `self_check_passed`。机器通过后，仍须按 `page_quality_check.md` 第15、24、25项亲眼核对原图。
