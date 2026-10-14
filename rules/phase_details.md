# 阶段补充细则

> 总流程、确认点和必跑检查只看 `rules/main_workflow_sop.md`；各阶段的主规则见 SKILL.md 的阶段索引。本文件只保留其它规则里没有写到的补充细节。

## 已批准页面的恢复入口

新页面的草图与审核分别检验解释收益和整页构图，按 `rules/visual_reasoning.md` 的构图证据与实际相邻页比较执行；解释方法不同不能代签宏观构图不同。用户授权继续下一页时保留前页真实验收状态，风格偏好不自动变成固定排布或页面批准。

恢复已通过内容与页面规划的制作时，协调者核验当前审批、页号映射、资产与本页必看参考，再按 `rules/visual_creation_context.md` 建立本页精简输入包。新创作者从理解任务、可见依据、主体与支撑职责和实际参考做法形成绘制决定，按 `rules/visual_reasoning.md` 验证整页草图；已有认可基线时先明确此次改善目标。核心充分性、整页构图与完整构建准备度通过后才加载完整实现检查。音频、内容阶段与历史返工按需要回查；已批准的上游不会因换创作上下文重做。

## 单集解析与转写

1. 验证 URL 是单集页面；解析 episode id、标题、Show Notes、发布日期、时长、主播／嘉宾、节目名、封面和可访问音频信息，生成 `episode_metadata.json` 与 `audio_manifest.json`。
2. 音频不可获取时停止视觉生产，请用户提供音频或可用 transcript；不得从不完整片段假装完成整期理解。
3. 三层 transcript：raw 是证据层，不润色观点；clean 是理解层，只做断句、标点、轻度口癖清理；grounded 是生产层，对专名、数字、speaker 等有证据地纠正并保留 provenance。

## 内容梳理补充

- 每个 Grounded span 必须且只能被一个连续覆盖片段记账；广告、寒暄、重复和节目公告也要显式标注，不能直接消失。
- 核心单元在用户可读稿中说明主问题、决定性机制与案例／反证／边界各自的职责；原文只给案例时保留这个限制，不让易画的例子替代解释重心。
- 允许压缩重复表达，但重要论点、论据、案例、产品过程、具体物件和关键转折不得只剩抽象结论。
- 后来补充的理论解释不得倒写成当时的设计依据；个人经验不得无条件改写为普遍规律。
- 文档按内容逻辑组织，不能按固定十分钟窗口充当章节，也不能提前按页面数量删减材料。
- 机器覆盖、schema 与证据检查通过后，状态仍保持 `needs_human_review`；用户明确通过并记录哈希与审批产物后才进入下一阶段（命令见 `main_workflow_sop.md`）。split 阶段的 approve 会同时验证上游《内容梳理》审批仍有效。
- 《内容拆分》的模块关系只用有来源的类型：递进、并列、因果、条件、反例、人物线或应用线；没有证据的关系不得强接。
- 全局 Knowledge Graph 用于表达论证关系，不替代《内容梳理》；不允许为了模块整齐而压掉重要支撑或案例。

## 图片内容规划补充

- 先交付 `图片内容规划.md`、`page_content_plan_proposal.json`、`page_content_coverage_proposal.json` 供用户审核；通过后核对内容与规划的审批哈希，生成 `knowledge_base.json`、`knowledge_graph.json`、`knowledge_gate.json`、`editorial_plan.json`、`coverage_matrix.json`、`editorial_gate.json`，并记录规划审批。
- 组装实现必须读取当前节目已审批的内容与规划；若只有上一期的内容专属脚本，保持本阶段待实现，不把换标题或复用语义组件当作完成。此门禁只证明已审批内容到页面合同的可追溯重排，不能证明逐字转写已完成人工校对。
- 规划记录 Content Inventory、Content Split、Coverage 的哈希和两次人工审核状态；任一输入改变时，本阶段及下游页面失效。
- 尊重论证而不是播放顺序；除非时间本身构成证据，不得把节目直接画成时间线。
- 模块数不等于 Deep Dive 页数，没有固定换算比例；不得从节目时长、模块数量、既往页数或经验区间倒推本期页数。
- Overview 建立节目级 mental model：首次接触者只读这一张图能复述全文核心判断及其关系；复习者一个月后用它快速恢复全貌。Deep Dive 每页围绕一个值得理解的问题，回答“为什么成立／怎样发生／什么证据／什么边界／如何使用”中与该页相关的部分。

## 信息预算

每页先定信息预算，再做视觉方案。优先级：重要性 × 证据强度 × 对整体论证的必要性；可画性只影响表达方式，不决定内容是否重要。超预算时，先把信息改成可读的对象、动作、关系或空间结构，再合并／删除重复、压缩关系、重构层级，最后才精简文字。只有延续确实损害可读性或论证完整性时才拆页，不为留白比例拆页；禁止无限缩小字号。每次拆页都写理由（本页容纳不下的独立问题、论证路径或必留证据，以及合并为何造成折损或手机阅读失败），不得因上一模块拆成多页就沿用相同页数。

## 选色细节

- 在对话里显示 `assets/color-library.png` 色卡并等待选择（不是系统弹窗）；色值以 `assets/color-library.json` 为准。不要把色卡授权、其他节目的配色、历史默认值或助手推荐当作本次选择。
- 用户明确要求重选，或指出本次没经历选色时，即使已有旧选择也重新展示并等待；旧 `selected_palette.json` 只作历史记录。
- 用户在本次选色步骤回答后，把色库版本、编号、实际 HEX、正文色、派生浅底色、选择日期和用户原话写入 `selected_palette.json`，再用于 construction spec 与 scene。首次出图前向用户复述色卡编号、名称和主辅色 HEX。
- 同一制作周期内后续页面沿用已选颜色，不逐页重问；改选时重新记录并重做受影响页的预检、渲染和颜色语义审查。
- 每张新画或重画的页面在当版 `REFERENCE_PREFLIGHT.json` 记录 `selected_palette.json` 路径、SHA-256、实际色值和颜色职责，并核对 scene 使用同一组 HEX。编号按白底知识图的通用适用性排序，不代表对每期内容的绝对审美判定。

## 构图前预检细节

`REFERENCE_PREFLIGHT.json`：创作者分别读取完整 Page Content Pack；实际打开正例、反例和同系列已通过页；读取当前 `taste.md` 与 `design_tokens.json`。记录各输入哈希、每个案例的可见观察及其对本页的影响，以及主解释结构、页内相邻模块关系、阅读路径、图文分工、手机字号和禁用画法；按 `rules/page_visual_production.md` 声明本期跨页颜色职责。三类输入不能互相替代；审核者后来读取规范不能补签创作者缺失的预检。送审命令会校验该记录的哈希且文件时间早于 scene。选参考按 `rules/acceptance_case_index.md`：优先本次用户指定参考，再按理解任务补充内置案例；实际打开的文件全部列入预检和隔离审核包。编辑标题默认具体陈述，拟定与终校时执行 `rules/page_visual_production.md → 通用标题表达`，内部 `page_question` 不直接作为成图标题。

## 构建与导出命令

1. Cover 先完成 `COVER_BRIEF.md`；所有页以当前内容规划、视觉方案和 token 哈希生成 `02-visual-plan/construction_spec.json`，显式记录原生图元、几何、来源与构图职责。
2. 正式内容图只用原生可编辑元素（`image` 为 0、`files` 为空）。每页右上角放官方专辑封面，按 `rules/inner_page_module_contract.md` 品牌合同在导出时确定性合成并记录来源、尺寸、位置与哈希；`construction_spec` 声明 `album_art_policy: "all_pages"`，每页填写同一 `brand_asset`。
3. 运行 `npm run construct -- --workspace <ws>`；按 `docs/RENDER_BROWSER_ENVIRONMENT.md` 执行 `npm run render:checked -- --workspace <ws>`，同一 scene 导出原图、390px 与灰度；局部渲染先过 `npm run render:preflight`，失败即停。
4. 真实打开全部 scene，验证文字、对象、组及适用的绑定箭头编辑（无绑定箭头时记录不适用），然后 `npm run construction:closeout -- --workspace <ws>`。
5. 完整出图后保存绑定当前 scene/PNG 的 `RENDERED_PAGE_CHECK.md/json`；任一项失败保持 `rejected_by_creator`。只有可隔离的局部问题才进入 `SCOPED_REPAIR`（冻结基线及允许元素、验证其余未变、重渲整页并隔离审核）；新增主结构仍从原型开始。
6. 所有有效非文字图元声明 `customData.stroke_role`，所有文字声明 `customData.typography_role`；数值只读 `design_tokens.json`（`stroke.role_settings`、`typography.role_sizes`）。
7. 字号检查带上 tokens：`python3 scripts/check_typography.py <scene> --design-tokens <当前 design_tokens.json>`；报单行宽度风险时先换行或重分空间。

## 整包审查补充

- 所有内容、伴读文案和报告完成后，再冻结清单、当前规范快照与 ZIP，逐文件核对目录与压缩包的 hash，禁止混装历史版本。
- 除 `design_gates.md` Gate 4 外还要检查：连续 Overview 能说清前页留下的问题为何由后页接着回答（页间关系有来源，不造错误因果）；手机宽度可读；高信息密度本身不是失败，只有层级、阅读路径或关系表达失效时才返工。

## 审美反馈记录

用户反馈分为 Content／Visual／Taste 三类；只有明确的 Taste Feedback 才进入长期审美候选。记录“为什么意外表达有效”，而不是只记录“喜欢某个版式”；新候选先进入 `taste.md` 的 `Discovered Preferences`，不自动升级为硬规则。
