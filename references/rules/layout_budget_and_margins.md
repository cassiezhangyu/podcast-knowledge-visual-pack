# 排版预算与边距留白审计（作者自检必做项）

> 从 v0.6.3 移植（v0.4.1-local）。由当前主会话执行，不创建审核 agent。

## 1. 出图前：排版预算

正式渲染前先算版面，免得画完才发现挤或空：

- 计划阶段：`python3 scripts/layout_budget.py budget.json`。budget 写 `body_top`、`footer_rule_y`、`min_gap`、`footer_gap` 与各块估算高度（行数 × 该级行高 + 图形高度）。超出页脚留白或任何间距小于 `min_gap` 即 exit 1。
- 草稿 scene：`python3 scripts/layout_budget.py --scene draft.excalidraw [--min-gap 12] [--footer-gap 12]`，按每个文字元素的字号 × 行高 × 行数估算真实高度，检查纵向重叠与页脚线上方留白。
- 超出时删字或重排，**不缩小字号**抢救。

## 2. 渲染后：重叠、边距与页眉页脚留白

`python3 scripts/audit_overlap_margins.py <scene.excalidraw> [scale]`（需已 `npm run build`；分层渲染器 `scripts/render_scene.mjs` 只作诊断，不用于交付图）。exit 1 的条件：

- 文字×线条、文字×排线、文字×文字的像素重叠（含 2px 膨胀，即"碰线"也算）；
- 墨迹超出 x∈[80,1120]（专辑封面位除外）；
- 左右边距不对称 >6px；
- 页面顶端首个墨迹 <40px；
- 页眉线到正文首个墨迹 <12px；正文末墨迹到页脚线 <12px。

结果记入当前 `RENDERED_PAGE_CHECK.json` 的 `layout_budget` 与 `margin_audit`（命令、exit code、关键数值）。任一失败不得记 `self_check_passed`。机器通过仍须按 `page_quality_check.md` 第15、24、25项亲眼核对原图。
