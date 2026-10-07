# Design Gates & Revision Routing

## Gate 0 — Transcript
Coverage, timestamps, speaker attribution, high-risk terms. Fail → Audio/Transcript pipeline.

## Gate 1 — Content
分为两个不可合并的人工停点：

- **Content Review Gate**：Grounded span 连续且唯一记账；重要论点、机制、案例、对象、动作、条件、反例、边界和不确定性保留；事实可追溯；归因正确；模型推断有标记。Fail → 内容梳理。
- **Content Split Review Gate**：节目级主命题覆盖全文；模块边界和关系有来源；每个内容单元和重要细节都有明确去向；合并、降级或排除有内容理由。Fail → 内容拆分。

机器覆盖或 100% disposition 不能替代两次 Human Review。详细协议见 `rules/content_pipeline.md`。

## Gate 2 — Editorial
输入绑定两份已通过内容产物及 Coverage 哈希？各页面类型完成 `rules/page_content_planning.md` 第 0 节的阅读任务？Overview 单张能否复述全文核心判断及其关系，核心覆盖与细节去向是否分别核对？Deep Dives 是否各有新增理解？相邻页面与页内主要模块的例证、推进、并列或对照有无来源支持？顺序服务理解？页面 Coverage 无重大缺口或重复？Fail → 图片内容规划；若缺口来自上游内容，则返回对应 Content Gate。

## Gate 3 — Visual
- Cover 必须通过 `rules/cover_page_production.md`：原节目标题为第一层级，编辑钩子忠于整期主命题，中心知识图提供不可由纯文字替代的解释，页尾和品牌信息不争抢注意力。
- 主解释结构成立：可以是单一主图、多个协同局部图示，或有清楚层级、证据和关系的文字型知识图。
- 实际画出的图形须降低对应、比较、定位或追踪负担；图文共同提供理解帮助。不要求超过已含相同有效关系的最优图文替代，不为图形数量添加空对象。
- 有来源支持的机制、变化或并列关系必须在构图中可辨认，不能只列节点名称；不得把并列关系画成必经步骤。
- No Card Grid / Bubble Map / Box Everything / Article Layout / Abstract→Abstract；文字型知识图若能清楚呈现内容专属的主次、关系、证据和边界，不因没有实物图而拒绝。
- 5-second scan + 30–60-second read works.
- High information density is acceptable only when hierarchy, reading path, and relationship expression remain clear; blank space is not a pass criterion by itself.
- Mobile-readable; no overflow/overlap.
- Every content sentence has a clear claim/evidence/mechanism/boundary role; navigation text is not mistaken for explanation.
- 实际绘制的对象图须通过两步检查：暂略长说明，辨认主要对象和有意义的可见线索；恢复必要文字后，判断图文是否共同支持同一论点，并比纯文字更清楚地解释关系。不要求图独自复述完整论证。文字与关系主导的区域则检查层级、关系、证据和边界能否直接读懂。
- 每期声明主色、辅色与正文／辅助文字的职责，跨页同一职责保持一致；颜色不是唯一的信息编码。页眉、页脚、来源和页码遵守整套页面合同。

Classification:
- REJECT-A: obvious structural failure → regenerate visual hypotheses.
- REJECT-B: 画面整洁但仍主要靠等权文字块、通用对象或装饰图标堆放内容 → 重新推导内容专属关系、证据层级及适合的图文分工。
- TARGET: proceed.

## Gate 4 — Package
Cover consistency, terminology, semantic colors, page rhythm, overview↔deep-dive mapping, no accidental repeated main structures, source/page-number completeness.

## Programmatic QA
Bounds, overlaps, min font, arrow/text collision, parseability, canvas size.

## Vision QA
Hierarchy, reading path, main explanatory structure, explanatory value, density/overload judgment, anti-patterns, cross-page repetition, aesthetic coherence.

## Per-page gate and revision evidence

Follow `rules/cover_page_production.md` for Cover and `rules/page_visual_production.md` for every Overview and Deep Dive. A page may enter Human Review only with a current original-size PNG, its matching editable scene, content coverage, sentence review, graphic-object review, series-contract check and mechanical results. 全页官方专辑封面必须提交品牌资产来源、哈希和最终合成记录，实际核对同包身份一致、位置尺寸和标题避让。保持needs_human_review直到用户明确验收当前版本。默认三案选择模式在用户选定当前候选后开始下一页，所选 `REJECT-B` 保留质量待办并阻断正式发布；用户明确改用单案逐页确认或批量制作时按visual_pack_execution执行，不自动写入accepted。

The creator cannot award the Visual Gate. Follow `rules/independent_visual_review.md`: a context-isolated, read-only reviewer must compare the rendered page with the accepted positive reference and return `TARGET` before Human Review. If isolation is unavailable, keep `independent_review_required`; never substitute creator self-review.

Route failures to the earliest failed layer. Rebuild the visual model for structural or semantic failures; refine the existing scene only for local typography, spacing, collision or alignment defects. Re-render after every revision and rerun the affected layer plus all later layers.

## 精修与交付的独立检查

执行visual_pack_execution：语义角色、参数一致性、当前像素分开验；整页结论必须回答主问题。样稿批准仅授权所述迁移，不是全包验收。局部审核通过只证明该范围，不替代完整Visual Gate。Package Gate核验选定页版本、当前规范快照、来源范围、文案与审核报告，目录/manifest/ZIP必须一致，旧整体评级只能保留为标有依据版本的历史记录。
