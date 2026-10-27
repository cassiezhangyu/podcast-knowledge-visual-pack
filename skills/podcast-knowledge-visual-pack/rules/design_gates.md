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
- 创作与自检采用 `visual_reasoning.md` 第1节、同版taste与当前页型合同；创作者从规划、试画到输出前检查主动落实，由当前主会话完成自检。下列条目用于分流，不形成另一条质量线。
- Cover 必须通过 `rules/cover_page_production.md`：原节目标题为第一层级，编辑钩子忠于整期主命题，中心知识图提供不可由纯文字替代的解释，页尾和品牌信息不争抢注意力。
- 主解释结构成立：可以是单一主图、多个协同局部图示，或有清楚层级、证据和关系的文字型知识图。
- 实际画出的图形须降低对应、比较、定位或追踪负担；图文共同提供理解帮助。不要求超过已含相同有效关系的最优图文替代，不为图形数量添加空对象。
- 有来源支持的机制、变化或并列关系必须在构图中可辨认，不能只列节点名称；不得把并列关系画成必经步骤。
- 拒绝用等权卡片、空泛分支、段落排放或装饰对象代替必要关系；准确表达知识任务的流程、对照、层级、必要容器和文字型知识图均可使用，不因通用形状或没有实物而拒绝。
- 快速扫描可识别主问题与结构，正常阅读可理解判断及限定；未经实际计时不报告秒数达标，不以固定阅读秒数压缩复杂含义。
- High information density is acceptable only when hierarchy, reading path, and relationship expression remain clear; blank space is not a pass criterion by itself.
- Mobile-readable; no overflow/overlap.
- Every content sentence has a clear claim/evidence/mechanism/boundary role; navigation text is not mistaken for explanation.
- 实际绘制的对象图须通过两步检查：暂略长说明，辨认主要对象和有意义的可见线索；恢复必要文字后，判断图文是否共同支持同一论点，并比纯文字更清楚地解释关系。不要求图独自复述完整论证。文字与关系主导的区域则检查层级、关系、证据和边界能否直接读懂。
- 每期声明主色、辅色与正文／辅助文字的职责，跨页同一职责保持一致；颜色不是唯一的信息编码。页眉、页脚、来源和页码遵守整套页面合同。

Classification:
- REJECT-A: obvious structural failure → regenerate visual hypotheses.
- REJECT-B: 画面整洁但仍主要靠等权文字块、通用对象或装饰图标堆放内容 → 重新推导内容专属关系、证据层级及适合的图文分工。
- 完整自检通过: proceed.

## Gate 4 — Package
Cover consistency, terminology, semantic colors, page rhythm, overview↔deep-dive mapping, no accidental repeated main structures, source/page-number completeness.

## Programmatic QA
Bounds, overlaps, min font, arrow/text collision, parseability, canvas size.

## Vision QA
Hierarchy, reading path, main explanatory structure, explanatory value, density/overload judgment, anti-patterns, cross-page repetition, aesthetic coherence.

## Per-page gate and revision evidence

Follow `rules/cover_page_production.md` for Cover and `rules/page_visual_production.md` for every Overview and Deep Dive. A page may enter Human Review only with a current original-size PNG, its matching editable scene, content coverage, sentence review, graphic-object review, series-contract check and mechanical results. 全页官方专辑封面必须提交品牌资产来源、哈希和最终合成记录，实际核对同包身份一致、位置尺寸和标题避让。保持needs_human_review直到用户明确验收当前版本。默认三案选择模式在用户选定当前候选后开始下一页，所选 `REJECT-B` 保留质量待办并阻断正式发布；用户明确改用单案逐页确认或批量制作时按visual_pack_execution执行，不自动写入accepted。

当前主会话按page_quality_check完成作者自检，技术检查通过后输出给用户；不要求独立报告或审核上下文，作者自检仍须通过。

按最早失败层及影响范围返修：主体、主关系或全页拓扑失效时重构；有效结构中的局部语义、图文配对、字形、间距与对齐问题限定修复。每次重渲并复核受影响层与后续层，不将所有语义问题自动升级为全页重建。

## 精修与交付的独立检查

执行visual_pack_execution：语义角色、参数一致性、当前像素分开验；整页结论必须回答主问题。样稿批准仅授权所述迁移，不是全包验收。局部审核通过只证明该范围，不替代完整Visual Gate。Package Gate核验选定页版本、当前规范快照、来源范围、文案与审核报告，目录/manifest/ZIP必须一致，旧整体评级只能保留为标有依据版本的历史记录。

## 生产范围

原生图导入（accepted-artwork:import）与打包（package）同样按生产范围计页：只核对、只打包范围内页面；范围外不要求封面简报等工件，交付文件名按页面身份命名。

成图文字只面向读者：生产范围、暂缓、未出页等制作状态不得出现在页面上（`scripts/check_reader_facing_text.py`）。编辑过程用语（本页整理、分组、松散、归类、归属由…）同样拦截。提醒／边界／页脚备注只写读者需要知道的事实（例：“提醒：没有标准答案，这四种来源也常常重叠。”），不解释作者如何整理或归类。

`production_scope` 只决定制作哪些页面，不放宽任何门禁。范围内的每一页照常执行 Gate 0–4；范围外的页面不进入构图、渲染和交付，它们的细节在 coverage matrix 里记为 `deferred_out_of_scope`，必须可追溯。

## 规则冲突

排版与内容邻近冲突时，按 `visual_pack_execution.md`「规则冲突先后」：例子紧挨所属步骤优先，并先问用户。
