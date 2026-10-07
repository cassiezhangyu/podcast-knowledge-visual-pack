---
name: podcast-knowledge-visual-pack
description: 将小宇宙播客单集转成可追溯的内容梳理、内容拆分、知识信息图和可编辑 Excalidraw；适用于需要完整保留论点、案例、边界并按用户授权逐页确认或整包制作的播客知识视觉生产。
---

# Podcast Knowledge Visual Pack Skill

> **Development note:** `SKILL.md` defines runtime behavior of the finished Skill. Repository development is governed separately by `AGENTS.md` and `ROADMAP.md`. Do not mix development protocol into runtime reasoning.


## 安装入口与工具位置

存在 `RUNTIME_ROOT.json` 时先读取其 `runtime_root`，后续所有 npm、scripts 和 workers 命令都以该仓库为工作目录；资源参考按本 Skill 所在目录解析。直接从仓库使用时以仓库根目录执行。仓库移动后重新安装入口；入口里不安装 node_modules、保存生产工作区或构建 dist。

## 0. Mission
输入一个小宇宙播客单集 URL，建立可追溯的节目证据层，重建知识结构，再寻找能让读者“看见这个结构”的视觉表达，最终输出：系列化、内容驱动的封面 + 经内容与真实阅读容量验证的节目级 Overview + N 张 Deep Dive + 可编辑 Excalidraw 源文件 + 来源与 QA 底账。Overview 用一张图汇总全文核心内容并建立理解框架，具体知识展开进入 Deep Dive；续页必要性按 `rules/overview_page_production.md` 验证核心框架本身的容量。

不要把任务理解为“摘要播客并把摘要装进信息图”。

### 核心质量原则
- Evidence before Interpretation.
- Argument before Chronology.
- Mechanism before Layout.
- Information Budget before Decoration.
- Visual Explanation before Editorial Styling.
- Package-level coherence before single-page prettiness.
- Novelty serves understanding; novelty is never an independent goal.

### 已批准页面的恢复入口

新页面的草图与审核分别检验解释收益和整页构图，按 `rules/visual_reasoning.md` 的构图证据与实际相邻页比较执行；解释方法不同不能代签宏观构图不同。用户授权继续下一页时保留前页真实验收状态，风格偏好不自动变成固定排布或页面批准。

恢复已通过内容与页面规划的制作时，协调者核验当前审批、页号映射、资产与本页必看参考，再按 [逐页创作上下文](rules/visual_creation_context.md) 建立本页精简输入包。新创作者从理解任务、可见依据、主体与支撑职责和实际参考做法形成绘制决定，按 [视觉创作](rules/visual_reasoning.md) 验证整页草图；已有认可基线时先明确此次改善目标。核心充分性、整页构图与完整构建准备度通过后才加载完整实现检查。音频、内容阶段与历史返工按需要回查；已批准的上游不会因换创作上下文重做。

## 1. Input Contract
必填：`episode_url`。
可选：`focus`, `audience`, `max_deep_dive_pages`, `exploration_mode`, `transcription_policy`, `output_language`。
默认：中文；exploration_mode=`balanced`。**整包硬上限为 18 张：封面 + 全部总览页（含续页）+ 全部 Deep Dive；随组图交付的附录视觉页也占名额。** 单页总览时 Deep Dive 最多 16 张；总览增加一页，Deep Dive 名额相应减一。`max_deep_dive_pages` 若由用户给出，只能进一步收紧上限，不能突破整包 18 张。页数在《内容拆分》通过后按独立问题、证据边界和手机容量确定；超过上限时先重排能共享一个问题的内容与证据去向，保持每条必留细节可追溯，不得靠删内容、微字或把两种无关问题硬塞一页达标。无法同时满足完整性、可读性与 18 张上限时，停止页面制作并提交具体冲突与可审的范围调整方案，不能生成超额正式页面。

## 2. Phase 0 — Episode Intake
1. 验证 URL 是单集页面。
2. 解析 episode id、标题、Show Notes、发布日期、时长、主播/嘉宾、节目名、封面、可访问音频信息。
3. 生成 `episode_metadata.json` 和 `audio_manifest.json`。
4. 若音频不可获取，停止视觉生产；请求用户提供音频或可用 transcript，不得从不完整片段假装完成整期理解。

## 3. Phase 1 — Podcast Intelligence
严格遵循 `rules/audio_pipeline.md`。

在已验证的稳定本地 MLX 环境中，默认将完整音频一次性交给 `DIRECT` 转写；不得仅因节目较长就预切为 30 秒片段。只有用户明确选择、执行环境受限或确实需要分段恢复时才能使用 `SEGMENTED`。`DIRECT` 失败时停止并报告，不得静默切换策略或 provider。

输出三层 transcript：
- raw：证据层，不润色观点；
- clean：理解层，只做断句、标点、轻度口癖清理；
- grounded：生产层，对专名、数字、speaker 等有证据纠正并保留 provenance。

必须通过 Transcript Gate 后才能进入知识建模。转写与纠正完成后按 `rules/audio_pipeline.md` 的“QA、导出与进度”规则验证当前 Grounded QA；内容入口会检查其哈希与证据是否仍有效。

## 4. Phase 2 — 内容梳理
严格遵循 `rules/content_pipeline.md`。基于 grounded transcript，同时允许回查 raw transcript 和 Show Notes。

先按语义边界重新梳理全文，生成机器可校验的 `episode_content_inventory.json` 和供用户阅读的《内容梳理》`内容梳理.md`：
- 每个 Grounded span 必须且只能被一个连续覆盖片段记账；广告、寒暄、重复和节目公告也要显式标注，不能直接消失；
- 每个有语义价值的内容单元保存完整摘要、论点、机制、案例、具体对象、动作、成立条件、边界、反例、不确定性和证据锚点；
- 核心单元在用户可读稿中说明主问题、决定性机制与案例/反证/边界各自的职责；原文只给案例时保留这个限制，不让易画的例子替代解释重心；
- 允许压缩重复表达，但重要论点、论据、案例、产品过程、具体物件和关键转折不得只剩抽象结论；
- 后来补充的理论解释不得倒写成当时的设计依据；个人经验不得无条件改写为普遍规律；
- 文档按内容逻辑组织，不能按固定十分钟窗口充当章节，也不能提前按页面数量删减材料。

完成后进入 **Content Review Gate**。用户确认《内容梳理》完整、准确前，必须停止；不得生成《内容拆分》、页面规划或图片。

机器覆盖、schema 与证据检查通过后，状态仍保持 `needs_human_review`。只有用户明确通过并记录 Inventory 哈希与审批产物，才能进入下一阶段。
使用 `npm run content:gate -- --workspace <workspace> --stage inventory --action check` 执行机器检查；用户明确通过后再以 `--action approve` 生成绑定当前哈希的审批产物。

## 5. Phase 3 — 内容拆分

只在《内容梳理》获得用户确认后开始。生成供用户阅读的《内容拆分》`内容拆分.md`，以及机器可检查的 `content_split.json` 和 `content_split_coverage.json`。

《内容拆分》必须先回答：
- **整期在讲什么问题或道理**：一句完整的节目级主命题，以及它不能被误解成什么；
- **可以拆成几个模块**：数量由内容逻辑决定，不预设固定页数；
- **模块之间是什么关系**：递进、并列、因果、条件、反例、人物线或应用线；没有证据的关系不得强接；
- **每个模块怎样展开和论证**：模块问题、结论、推理步骤、论据、案例、具体细节、边界和来源；
- **内容去向**：内容梳理中的每个核心/支撑单元进入哪个模块，作为何种作用；未进入主模块的内容必须说明保留位置或排除理由。

逐个核心单元核对“主问题→决定性机制→案例/反证→边界”的相对职责；来源只提供案例时如实标记，不补造机制。模块中同一方法的总图、操作与检验要区分论证层级，避免下游深度页反复讲同一句结论。详见 `rules/content_pipeline.md`。

全局 Knowledge Graph 用于表达论证关系，不负责替代《内容梳理》。允许合并重复表达，不允许为了模块整齐而压掉重要支撑或案例。

完成后进入 **Content Split Review Gate**。用户确认整期主命题、模块数量、模块边界、展开逻辑和内容去向前，必须停止；不得进入画图规划。

机器的 100% 去向记账不能替代语义审核。只有用户明确通过并记录 Split、Coverage 哈希与审批产物，图片内容规划才能读取该版本。
使用 `npm run content:gate -- --workspace <workspace> --stage split --action check` 执行去向检查；用户明确通过后再以 `--action approve` 关闭门禁。该命令会验证上游《内容梳理》审批仍有效。

## 6. Phase 4 — 图片内容规划
先执行 `rules/page_content_planning.md` 的页面职责、全文核心覆盖和逐页存在性审查：封面、总览与深度页按其阅读任务分工；每张 Deep Dive 要指出它比总览新增的理解、真正回答标题的机制或关系、证据与边界、和相邻页不能合并的理由；按内容及手机阅读容量记录需要拆页的具体触发条件。单元与细节的去向完整只证明记账，不能证明总览已覆盖全文核心或页面值得存在。审查未完成或发现重复/混杂时，先改页面合同，不进入构图。
根据已确认的《内容拆分》生成 `knowledge_graph.json`、`editorial_plan.json` 和 `coverage_matrix.json`，形成图片内容规划：
- Overview 让读者只看一张图就能复述整期问题、主要知识或核心观点及其关系；按 `rules/overview_page_production.md` 区分核心框架的容量问题与应交给深度页的展开任务，不能按时长或既往期数预设总览页数；
- N 个 Deep Dive：每页对应一个已确认模块或一个需要独立展开的问题；
- 每页明确 page question、takeaway、论证路径、相邻主要模块的内容关系与自然追问、必留案例/细节、边界与 evidence anchors；在用户可读规划中同时列出新增理解、合页/拆页理由与容量待验证点。
- 记录已通过 Content Inventory、Content Split、Content Split Coverage 的哈希和两次人工审核状态；任一输入改变时，本阶段及下游页面失效。

先交付 `图片内容规划.md` 与 `page_content_plan_proposal.json`、`page_content_coverage_proposal.json` 供用户审核。用户通过后，核对内容与规划的审批哈希，生成下游读取的 `knowledge_base.json`、`knowledge_graph.json`、`knowledge_gate.json`、`editorial_plan.json`、`coverage_matrix.json`、`editorial_gate.json`，并记录规划审批。组装实现必须读取当前节目已审批的内容与规划；若只有上一期的内容专属脚本，保持本阶段待实现状态，不把换标题或复用语义组件当作完成。此门禁只证明已审批内容到页面合同的可追溯重排；不得称其证明逐字转写已完成人工校对。旧的 `knowledge:prepare` / `knowledge:assemble` / `editorial:assemble` 属于 transcript-window 路线，不用于已走 Content Inventory / Split 的任务。

原则：尊重论证而不是播放顺序。除非时间本身构成证据，不得把节目直接画成时间线。

模块数不等于 Deep Dive 页数，也不存在固定换算比例：一个模块可以在一页内完整解释，也可以因包含多个不能压缩到同一阅读路径的问题而拆成多页；多个模块只有在共享同一页面问题、合并后仍能保留各自证据与边界时才允许同页。不得从节目时长、模块数量、既往项目页数或经验区间倒推本期页数。

### Overview
建立节目级 mental model：首次接触者只读这一张完整图能复述全文核心判断及其关系；复习者一个月后用它快速恢复 whole picture。制作 Overview 必须读取 `rules/overview_page_production.md`，先核对核心覆盖、建立内容骨架和关系台账，再决定构图。主要板块须有实质判断，导航名称不能代替解释；具体案例、完整机制和主题专属限定由深度页展开。“平行问题线”是来源满足条件时才使用的可选结构，不是每期必备。

### Deep Dive
每页围绕一个值得理解的问题，而不是宽泛主题。回答“为什么成立 / 怎样发生 / 什么证据 / 什么边界 / 如何使用”中与该页相关的部分。

## 7. Phase 5 — Information Budget
每页先决定信息预算，再做视觉方案。
优先级：重要性 × 证据强度 × 对整体论证的必要性；Visualizability 只影响表达方式，不决定内容是否重要。
超预算时，先将信息改为可读的对象、动作、关系或空间结构，再合并/删除重复内容、压缩关系并重构层级，最后才精简文字。只有延续确实损害可读性或论证完整性时才拆页；不得为了满足留白比例拆页。禁止无限缩小字号。

每次拆页都要留下理由：指出当前页无法同时容纳的独立问题、论证路径或必留证据，并说明为什么合并会造成信息折损或手机阅读失败。不得因为上一模块拆成多页，就沿用相同页数。

## 8. Phase 6 — Visual Reasoning
编辑标题默认用具体陈述，非必要不用问句；标题、核心结论和副标题各司其职，句式随内容变化。拟定和终校标题时执行 `rules/page_visual_production.md → 通用标题表达`，内部 `page_question` 不直接作为成图标题；官方单集标题与必要的来源问题保持忠实。

开始新节目第一张正式视觉页前，必须在当前对话展示 `assets/color-library.png` 色卡，等待用户选择 01–12 中的一组或给出自定义主辅色；色值以 `assets/color-library.json` 为准。用户明确要求重选颜色或指出本次未经历选色确认时，即使文件中已有旧选择，也要再次展示色卡并等待新的选择，旧 `selected_palette.json` 此时仅作历史记录。不要把色卡授权、其他节目的配色、历史默认值或助手的推荐视为本次选择。用户在**当前这次选色步骤**回答后，将色库版本、编号、实际 HEX、正文色、派生浅底色、选择日期和用户原话写入本集 `selected_palette.json`，再用于 construction spec 与 scene。一个制作周期内后续页面沿用已选颜色，不逐页重复询问；用户改选时重新记录并重检受影响页面。编号按白底知识信息图的通用适用性排序，不代表对每期内容的绝对审美判定。用中深色强调关键文字与线条，以同色高明度浅阶铺面；辅色只作局部提示，正文保持深色。这里的“弹出”是在对话中显示色卡并等待选择，不依赖系统弹窗。

**选色先于构图。** 本集 `selected_palette.json` 必须在第一张 scene 生成前存在；每张新画或重画的页面都在当版 `REFERENCE_PREFLIGHT.json` 记录该文件路径、SHA-256、实际色值和颜色职责，并核对 scene 使用的是同一组 HEX。换色后重做受影响页的预检、渲染和颜色语义审查。持续使用已选配色不意味着每张图都让用户重新选一次。

首次出图前向用户复述刚选定的色卡编号、名称和主辅色 HEX。用户要求重选时先等待其本次回答，不能沿用旧记录直接构图。

严格遵循 `rules/visual_reasoning.md`、`rules/page_visual_production.md`、`rules/independent_visual_review.md` 和 `taste.md`。制作 Cover 时必须读取 `rules/cover_page_production.md`；制作 Overview 时必须读取 `rules/overview_page_production.md`；制作 Deep Dive 时必须读取 `rules/deep_dive_page_production.md`。所有内页还须执行 `rules/inner_page_module_contract.md`：保留页眉、标题／核心结论、主内容、整包地图、本页提纲及来源页脚的模块分工，正文构图仍由内容决定。Cover、Overview 与每张 Deep Dive 都是独立的逐页闭环。开始视觉制作、精修或整包交付时必须执行 `rules/visual_pack_execution.md`：默认三案选择；用户已授权整包连续制作时自主逐页完成后一次交付；要求先验一页时仅做样稿。各模式均保留内容门禁、真实渲染和独立审核，批量授权不等于用户验收。两轮返工限质例外按逐页协议记录，不能冒称页面通过。

构图前先执行内容、案例与审美联合预检并保存 `REFERENCE_PREFLIGHT.json`：创作者分别读取完整 Page Content Pack；实际打开正例、反例和同系列已通过页；读取当前 `taste.md` 与 `design_tokens.json`。记录各输入哈希、每个案例的可见观察及其对本页的具体影响，以及主解释结构、页内相邻模块的内容关系、阅读路径、图文分工、手机字号和禁用画法；另按 `rules/page_visual_production.md` 声明本期跨页颜色职责。字段及示例见该规则。三类输入不能互相替代；审核者后来读取规范不能补签创作者缺失的预检。送审命令会校验该记录与当前输入的哈希及其文件时间早于 scene；未完成时禁止构图与送审。
选图时先执行 `rules/acceptance_case_index.md` 的参考选择与解读：优先查看本次用户指定参考，按理解任务补充内置案例；各页协议要求的基准图仍须查看。把实际打开的文件全部列入预检和隔离审核包。

新页面或主结构重构按 `rules/visual_creation_context.md` 和 `rules/visual_reasoning.md` 执行：精简输入与新创作上下文 → 实看正反参考 → 视觉策略探索 → 原生整页草图 → 隔离确认核心充分性与完整构建准备度 → 完整构建与审美精修。关系读懂不直接放行完整精修；准备度的证据字段与完成条件统一见 `visual_reasoning.md` 第4节。参考记录同时包含理解收益、画面完成度和本页绘制决定；不只记录禁令。

默认保留每页三案、逐页选定。三案须有实质视觉策略差异，不要求同一事实发明三种逻辑机制；用户明确指定机制差异时另记约束。先使最有把握的一案达到完整独立 TARGET，再补齐其余案。展示仍要求至少一完整 TARGET、其余至少 REJECT-B 且无阻断，执行 `visual_pack_execution.md`。正式交付不降低 TARGET。

## 9. Phase 7 — Excalidraw Construction

每次构图、线条精修与重新导出必须执行 `rules/handdrawn_strokes.md`；所有有效非文字图元声明 `customData.stroke_role`，严格读取 `design_tokens.json → stroke.role_settings`，构建后运行 `python3 scripts/check_strokes.py <scene或目录>`。再以真实原尺寸、390px和灰度图审核笔触、对象完整性及文字间隔。

每次构图、字号精修和送审必须执行 `rules/typography_hierarchy.md`。字号唯一读取 `design_tokens.json → typography.role_sizes`；所有文字声明 `customData.typography_role`，内页主标题、结论、模块／栏目入口按该规则形成可见强字重，副标题不得误用辅助弱色。构建后运行 `python3 scripts/check_typography.py <scene或scene目录> --design-tokens <当前design_tokens.json>`；若报单行宽度风险，先换行或重分空间。脚本通过后仍要与正例并排核对原图、390px 与灰度图的颜色、字重、阅读层级和每处文字到边框的真实间距，不能用 scene 宽度宣告无越界。
1. Cover 先完成 `COVER_BRIEF.md`；所有页以当前内容规划、视觉方案和 token 哈希生成 `02-visual-plan/construction_spec.json`，显式记录原生图元、几何、来源与构图职责。内页保持外围语法，正文按问题决定，不复制旧坐标或对象。
2. 正式内容图仅使用原生可编辑元素：`image` 为0、`files` 为空。全套每页右上角均放对应官方专辑封面；按 `rules/inner_page_module_contract.md` 的品牌合同，在导出时确定性合成并记录来源、尺寸、位置与哈希。新 `construction_spec` 声明 `album_art_policy: "all_pages"`，每页填写同一 `brand_asset`。运行 `npm run construct -- --workspace <workspace>`；再按 `docs/RENDER_BROWSER_ENVIRONMENT.md` 用已验证权限执行 `npm run render:checked -- --workspace <workspace>`，同一scene导出原图、390px与灰度。局部渲染也先通过同环境 `npm run render:preflight`；预检失败即停止。
3. 真实打开全部scene，验证文字、对象、组及适用的绑定箭头编辑；无绑定箭头时明确记录不适用。中文字形、换行、边界与碰撞以真实PNG为准，不能由静态坐标代证。实际操作完成后运行 `npm run construction:closeout -- --workspace <workspace>`。
4. 完整出图后按 `rules/page_visual_production.md` 对照内容包、正反例和真实像素，保存绑定当前scene/PNG的 `RENDERED_PAGE_CHECK.md/json`；覆盖、图形解释、参考比较、文字几何与手机可读性任一失败则保持 `rejected_by_creator`。返工后重新渲染并重跑受影响层；不能以更整洁为理由丢失案例、条件或边界。
5. 对象的整体识别、部件装配、状态、归属与视觉权重按逐页规则检查；图文结合必须增加理解。只有可隔离局部问题才按对应页协议进入 `SCOPED_REPAIR`，冻结基线及允许元素、验证其余未变、重渲整页并隔离审核；新增主结构仍从原型开始。

每次出图或整包精修必须读取 `rules/handdrawn_strokes.md`、`rules/typography_hierarchy.md` 与 `rules/footer_source_ranges.md`：按角色校准自然笔触，核心结论高于模块标题，深读页注明对应转写时段。已认可风格不构成复用固定模板的要求。

## 10. Phase 8 — Quality Gates
严格执行 `rules/design_gates.md`：Transcript → Content → Editorial → Visual → Package。
**每一页从规划开始都以 `TARGET` 为目标。** `TARGET` 的可见标准以当前 `taste.md`、相关已通过正例和反例及逐页协议为准；初版之前就核对整页问题、决定性关系、具体对象或文字结构、标题层级、手机阅读和来源边界，尽量通过充分规划在初版或一至两轮实质修改内达到标准。`REJECT-A`／`REJECT-B` 是失败诊断与返工路由，不是创作目标或常规出图、交付标准；机械检查通过、相对上一版改善、达到返工上限都不能把它们升级为 `TARGET`。
`TARGET` 仍是正式视觉通过标准；`REJECT-A` 不得作为限质输出。返工上限只规定停止重复制作；用户另行明确授权限质展示时，若初版后两轮实质修改仍未达到 `TARGET`，可展示其中内容与来源边界正确、经独立审核为 `REJECT-B` 的最佳版本，并明确标为限质输出、说明未达标原因及当前哈希。它不自动进入正式发布门禁，也不改写独立审核结论。
三案选择是**并列构图探索**，不是同一失败结构反复重画。新主结构先执行 visual_reasoning 的独立原型充分性检查；三案并排视觉策略审核在三案形成后、展示或批量放行前执行；报告须绑定当前输入和真实工件，不能仅凭作者观察或文件存在放行。三案展示用 --stage selection 验证至少一案完整 TARGET；单张 B 的保存资格不赋予全 B 三案展示资格。用户明确选定后可按授权继续。无人逐页选图的批量模式执行visual_pack_execution第1节质量关卡：本页所需完整候选均TARGET且策略差异成立后才扩产；用户指定限质范围另记例外。原型、整页报告使用scripts/check_visual_progression.py验证记录一致性，机械校验不承担视觉判级。
返工必须回到导致失败的上游阶段；禁止只靠换颜色、字号、间距修复结构性失败。

每张页面按以下顺序执行，不能因上一页通过而跳步：
1. 每次出图前，包括三案中的每一案和每个返工版本，先核对已通过的完整内容梳理、拆分、页面规划和本页内容包，实际重新打开正例、反例及同系列已通过页，读取当前 `taste.md` 和 `design_tokens.json`，保存本版 `REFERENCE_PREFLIGHT_Vn.json`；旧版预检不得代签。本版 scene 必须晚于本版预检创建。真实 PNG 后逐条对照规范与可见像素。遮字仅用于诊断图中对象与线索；最终看图文结合后是否比纯文字更清楚、生动地说明本页问题。若图只是通用图标或空框、未增加理解，或文字主导页缺少清楚的主次、关系和证据，即使机械检查通过也如实记为 REJECT-B；三案模式按 `rules/visual_pack_execution.md` 的候选审查与选择步骤处理，不强迫同案无限返工。
2. 正式审核路径：创作者自检合格后运行 `npm run visual:review:prepare -- --page-id <id> --role <cover|overview|deep_dive> --creator-context-id <创作任务ID> --scene <scene> --png <原图> --phone <390px图> --content <Page Content Pack> --positive <正例> --negative <反例> --taste taste.md --design-tokens design_tokens.json --preflight <构图前的REFERENCE_PREFLIGHT.json> --page-check <当前RENDERED_PAGE_CHECK.json> --design-gates rules/design_gates.md --review-protocol rules/independent_visual_review.md --output <审核输入包.json>`。按需重复 `--positive`、`--negative`。命令必须拒绝缺失、过时或事后补签的预检，也拒绝当前图形解释、内容、几何或手机可读性自检失败；输入包只携带预检与自检哈希，不向审核者披露创作者方案、自评或相对改进记录。
满足授权限质条件但未通过视觉解释自检的候选，另按 `rules/visual_pack_execution.md` 第 5 节建立限质独立审核输入；不伪造五项 pass，也不调用正式 prepare / closeout。
3. 将该输入包交给**隔离执行上下文中的只读审核者**，由审核者自行打开图片与规范，按正例最低交付线输出可见证据和 `TARGET`/`REJECT-A`/`REJECT-B`，并在报告中写入自己的 `reviewer_context_id`。创作者不得兼任审核；closeout 会检查审核者与创作者 ID 不同。无隔离审核能力时保持 `independent_review_required`。
4. 审核报告每页必须写入当前审核输入包的 `review_packet_sha256`。审核拒绝时按最早失败层返工并用新 PNG 重新送审，但应遵守用户授权的返工次数上限。审核 `TARGET` 后先以 `npm run visual:closeout -- --workspace <workspace> --review <独立审核.json> --packet <本页审核输入包.json> --action submit` 登记；多页重复 `--packet`。命令会复核报告、审核包、当前 scene/PNG 与参考输入的哈希，状态仍为 `needs_human_review`；向用户展示当前图片。只有用户明确通过**当前哈希的页面**，才用同一报告和审核包加 `--action approve --user-approved` 记录人工批准。限质 `REJECT-B` 只按页面协议记录与展示，不伪造 `TARGET` 报告或调用要求 `TARGET` 的 closeout。

机器检查、真实渲染、自检、相对进步、独立审核 `TARGET` 或上一张页面通过，均不能替代用户对当前页的确认。审核的细节与拒绝标准以 `rules/independent_visual_review.md` 为准。

全部当前 PNG 获完整隔离审核 `TARGET` 且用户明确通过这些当前版本（逐页或明确验收当前整包）后，运行带 `--action approve --user-approved` 的 closeout。审核文件必须绑定当前 `render_manifest.json`、每页审核包和 PNG 哈希；任何页面变化都会使该门禁失效。

## 11. Phase 9 — Package Review

按 `rules/visual_pack_execution.md` 的整包精修与交付版本流程横向审查，含主标题策略、模块标题与提纲编号、导航底色、线条密度和设计通过后的首读文案终校。先逐句核验七层语义职责，再核验字号和真实像素；任何改字都由当前 scene 重渲并复看原图、390px 与灰度图，局部审查不升级原整体等级。所有内容、伴读文案和报告完成后再冻结清单、当前规范快照与ZIP，逐文件核对目录和压缩包的hash，禁止混装历史版本。
伴读文案围绕有来源的分享主线自然展开，避免逐模块报目录，并匹配实际交付范围；单页总览作为最终交付时，也配套标题、正文和话题。先按 `rules/public_copy_production.md` 完成小红书草稿、Humanizer 表达处理、AI 痕迹人工检查和忠实度回归，运行 `npm run public-copy:check -- --workspace <workspace>`。Humanizer 只处理表达层，不承担内容理解或事实修复。
正式打包用 `npm run package` 的文案门禁；集中查看包或限质包采用手工归档时，打 ZIP 前还须按 `rules/visual_pack_execution.md` 运行 `npm run public-copy:bundle-check`，核对归档中的五份伴读文件与当前 `06-delivery` 一致。缺失时不得宣称整包交付完成。

检查：
- Cover 在系列视觉语言、信息层级、品牌与页尾合同上强一致，中心知识图随本期核心问题变化；
- Overview 真正提供 whole picture；
- 连续 Overview 能让读者说清前页留下的问题为何由后页接着回答，页间关系有来源支持且不制造错误因果或一一对应；
- Deep Dive 互补而非重复；
- 术语、主题色、视觉语义跨页一致；
- 连续两页避免重复同一主解释结构，除非重复本身有叙事意义；
- 手机宽度可读；
- 高信息密度本身不是失败；当信息层级、阅读路径或关系表达失效时才返工。
- 来源、页码、文件命名完整。

## 12. Phase 10 — Taste Discovery
用户反馈分为 Content / Visual / Taste 三类。
只有明确的 Taste Feedback 才进入长期审美候选。
记录“为什么意外表达有效”，而不是只记录“喜欢某个版式”。新候选先进入 `Discovered Preferences`，不要自动升级为硬规则。

## 13. Output Contract
最少输出：
- `00-cover.png`
- `COVER_BRIEF.md`、`COVER_RENDERED_CHECK.md`、封面隔离审核报告与用户审批记录
- `01-overview.png`；确有续页时按获批页面合同依序输出，并同步 Editorial Plan、Coverage Matrix、页面清单和后续页码
- `02-xx.png ...`
- 对应 `.excalidraw`
- `package.md`
- `内容梳理.md`
- `episode_content_inventory.json`
- `content_review_human_approval.json`
- `content_review_gate.json`
- `内容拆分.md`
- `content_split.json`
- `content_split_coverage.json`
- `content_split_human_approval.json`
- `content_split_gate.json`
- `knowledge_graph.json`
- `knowledge_gate.json`
- `editorial_plan.json`
- `editorial_gate.json`
- `construction_spec.json`
- `visual_gate.json`
- `construction_human_approval.json`
- `construction_gate.json`
- 每张内页的 `RENDERED_PAGE_CHECK.md`、隔离审核报告与用户审批记录
- 原尺寸、390px 与灰度 PNG
- `render_gate.json`
- `xiaohongshu-draft.md`、`xiaohongshu.md`、`xiaohongshu-review.md`
- `public_copy_record.json`、`public_copy_gate.json`
- `delivery_manifest.json`、`package_gate.json`
- `05-qa/*`

## 14. Hard Stops
以下情况禁止假装完成：
- 无法获取足够节目内容；
- transcript 覆盖明显不完整；
- 全文内容台账存在 span 缺口、重叠、悬空证据，或重要内容未记录去向；
- 《内容梳理》尚未获用户确认，却已生成《内容拆分》、页面规划或图片；
- 《内容拆分》尚未获用户确认，却已进入图片内容规划、视觉方案或绘制；
- 内容产物哈希与审批记录不匹配，或上游语义变化后仍沿用旧审批；
- Construction Gate 尚未通过可编辑性人工检查；
- 关键归因无法确认；
- Overview 只是目录；
- Visual Gate 为 REJECT-A/B；
- 缺少隔离审核，或隔离审核尚未达到 `TARGET`；
- 页面存在严重溢出/遮挡/不可读字号。
- 页面 scene 含任何嵌入位图、`image` 元素或非空 `files`；全页官方专辑封面的受控导出例外必须有来源与哈希，其他位图一律禁止。
- 创作者没有留下可核对的内容、案例与审美联合预检记录。
- 联合预检声称拒绝的失败模式仍出现在当前真实 PNG，或关键对象连同必要短标签仍无法辨认、与正文结合后仍无解释增益。
- 默认逐页确认模式下，当前页尚未获用户通过且不满足获准限质继续条件就开始下一页。已授权批量模式按visual_pack_execution执行；各模式均不得把未获验收页面记为accepted，或让未满足条件的正式发布门禁放行。
- 默认逐页三案模式下，三案未达到 visual_pack_execution 的展示门槛或尚未获得用户选定，就把某案当选定版或进入下一页；批量模式按visual_pack_execution的质量关卡推进。选定REJECT-B不能写成TARGET、正式accepted或RELEASED。

返工时按当前故障类型选择性读取 `rules/acceptance_case_index.md`，不要默认加载全部历史案例。
