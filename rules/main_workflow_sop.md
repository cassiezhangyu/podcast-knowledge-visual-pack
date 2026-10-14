# 主工作流 SOP（v0.6.0，Cassie 2026-10-14）

> 本文件先于其它规则读取。三个 SOP 依次执行，**每个都以用户确认结束**；未确认不进入下一个。其它 rules/ 文件是各步的细则。

**主动汇报：** 每到一个里程碑（转写完成、梳理待确认、构思待确认、每一版成图、阻塞）立即主动向用户汇报，不等用户来问。阻塞写清原因、已做的部分和需要用户决定的事。

## SOP A · 内容梳理确认

1. **可信转写**：幻觉复核（片头／静音段同模型重跑，见 `rules/transcription_guide.md`）；去掉音乐、广告、口播；修正误听术语与人名；列出仍不确定的地方。
2. **一句话本期**：用一句话说清本期讲了什么。
3. **框架**：先找节目自带的框架；没有就自己归纳，并明说“这是归纳的”。
4. **骨架**：按论证关系（因果／对比／条件／递进）而非时间顺序搭骨架，每层附证据（时间戳＋原话要点）。
5. **分拣**：主线／支线／彩蛋。
6. **只问关键问题**：只问会改变结果的问题，每个附推荐答案。
7. **记录决定**后再往下做 → 用户确认。

细则：`rules/content_pipeline.md` §0、`rules/page_content_planning.md`。

## SOP B · 主图构思确认

1. 从论证关系出发，不从版式出发。
2. **逐模块可画机制测试**：这个模块能不能画成一个会动的机制（状态变化、流向、对比）？不能就降为读数／入口／出口。
3. **一个连通的视觉中心**（约半页）；其它模块作为读数、入口或出口挂在中心上。
4. **关系底账**：每条箭头／相邻关系写明含义，并列“读者不得推断的关系”。
5. 其它模块与导航按空间放置，写理由。
6. 用大白话向用户讲构思（不讲术语）→ **用户确认后才画**。

细则：`rules/visual_reasoning.md`、`rules/overview_page_production.md` §0。

## SOP C · 画图

1. **先 preflight 再画**：REFERENCE_PREFLIGHT 在第一笔之前写好；画完再补的 preflight = REJECT。
2. **先画中心**，再画外围模块和导航。
3. **布局预算**：首次渲染前跑 `scripts/layout_budget.py`（估算模块高度与间距），渲染后跑 `scripts/audit_overlap_margins.py`；两者都通过才能第一次给人看。
4. **颜色职责**：`rules/visual_quality_bar.md` R4b；颜色重量来自有含义的实心信号块。
5. **线条角色**：`design_tokens.json` stroke.role_settings + path_limits；`rules/handdrawn_strokes.md`。
6. **版面美观**：页眉页脚合同；四边边距一致；模块间距足够；导航按空间放；边框只给有语义的对象（不 Box Everything）。
7. **自动审计是下限**：check_strokes、audit_stroke_shapes、audit_overlap_margins、audit_cjk_glyphs（简体字形，`rules/cjk_glyphs.md`）、check_typography、check_reader_facing_text 全部 exit 0。
8. **亲眼看**：1x + 4K 局部 + 与锚点并排，按 解释力 → 构图 → 细节 的顺序评判。
9. **两轮互相牵连的修补仍不成立 → 重新构图**，不要继续打补丁。
10. 多方案同等完成度；如实报告差距。
