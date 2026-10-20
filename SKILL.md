---
name: podcast-knowledge-visual-pack
description: 将小宇宙播客单集转成可追溯的内容梳理、内容拆分、知识信息图和可编辑 Excalidraw；适用于需要完整保留论点、案例、边界并按用户授权逐页确认或整包制作的播客知识视觉生产；也用于收录、修订和停用知识图正负向参考案例。
---

# Podcast Knowledge Visual Pack Skill

> 生产任务执行本 Skill；目录与安装维护见仓库 `README.md`，单集成果保存在用户指定工作区。


## 安装入口与工具位置

本项目直接在 `.agents/skills/podcast-knowledge-visual-pack/` 维护完整 Skill；所有 npm 与 scripts 命令在该根目录执行；源码与转写 worker 分别位于 `scripts/src/` 和 `scripts/workers/`。copy 安装包含同一套代码与资源，在复制后的根目录安装依赖并构建。仅旧精简入口仍读取 `RUNTIME_ROOT.json → runtime_root` 定位程序。规范资料按本 Skill 根目录解析；`references/` 保存规则与数据合同，`assets/` 保存模板、参数和案例。旧 `rules/`、`schemas/`、`templates/`、`examples/`、`taste.md` 和 `design_tokens.json` 是兼容链接，不另行维护。生产工作区放在 Skill 之外。

## 执行边界：主会话完成绘制与自检

按标准流程解析来源、整理内容、规划页面、绘制、真实渲染、作者自检并输出。此Skill不创建或调用审核agent，不自动派发独立审核、陌生首读或仲裁任务，也不把审核报告、reviewer_context_id或TARGET作为输出前置。

保留来源忠实、当前参数、真实图片、原生可编辑性及用户已确认的内容/页面范围。技术检查与作者自检如实记录；自检不冒充独立结论。用户确认按原有内容和选图停点处理，不额外增加审批。

## 读取顺序

通用质量判据归 `references/rules/visual_reasoning.md` 第1节维护；用户／系列偏好归 `references/taste.md` 与当前合同；具体修法归案例库。恢复时按本轮失败层读取对应规则，不将案例物件、坐标、色值或局部通过推广为通用模板。

创作开始即执行[同一标准在创作阶段的落实](references/rules/visual_reasoning.md#同一标准在创作阶段的落实)，由主会话完成自检后输出。

先按当前阶段读取下表；恢复任务先核对现有审批和当前工件，不重跑已有效的上游。主入口负责范围与阶段停点，细节在对应规则维护。

| 当前任务 | 必读规则 |
| --- | --- |
| 转写与来源复核 | `references/rules/audio_pipeline.md` |
| 内容梳理、拆分与页面规划 | `references/rules/content_pipeline.md`、`references/rules/page_content_planning.md` |
| 新页或主结构重构 | `references/rules/visual_creation_context.md`、`references/rules/visual_reasoning.md`、对应页型协议 |
| 构建、精修和导出 | `references/rules/visual_reasoning.md` 第1节共同标准、`references/taste.md` 与当前合同；`references/rules/page_visual_production.md` 按改动范围分支加载，外围合同见 `references/rules/inner_page_module_contract.md`，技术诊断见 `references/rules/render_diagnostics.md` |
| 作者自检与选图 | 同一共同标准、`references/taste.md` 与当前合同；执行 `references/rules/page_quality_check.md`、`references/rules/visual_pack_execution.md` |
| 最终文案与交付 | `references/rules/public_copy_production.md`、`references/rules/visual_pack_execution.md` |

独立维护案例库时直接执行 `references/rules/case_library_maintenance.md`，不要求单集URL，不重跑内容或作图流程。

## 0. Mission
输入一个小宇宙播客单集 URL，建立可追溯的节目证据层，重建知识结构，再寻找能让读者“看见这个结构”的视觉表达，最终输出：系列化、内容驱动的封面 + 经内容与真实阅读容量验证的节目级 Overview + N 张 Deep Dive + 可编辑 Excalidraw 源文件 + 来源与 QA 底账。Overview 用一张图汇总全文核心内容并建立理解框架，具体知识展开进入 Deep Dive；续页必要性按 `references/rules/overview_page_production.md` 验证核心框架本身的容量。

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

新页面的草图与审核分别检验解释收益和整页构图，按 `references/rules/visual_reasoning.md` 的构图证据与实际相邻页比较执行；解释方法不同不能代签宏观构图不同。用户授权继续下一页时保留前页真实验收状态，风格偏好不自动变成固定排布或页面批准。

恢复已通过内容与页面规划的制作时，主会话核验当前审批、页号映射、资产与本页必看参考，再按 [逐页创作上下文](references/rules/visual_creation_context.md) 建立本页精简输入包。从理解任务、可见依据、主体与支撑职责和实际参考做法形成绘制决定，按 [视觉创作](references/rules/visual_reasoning.md) 验证整页草图；已有认可基线时先明确此次改善目标。核心充分性、整页构图与完整构建准备度通过后才加载完整实现检查。音频、内容阶段与历史返工按需要回查；已批准的上游不会因恢复上下文重做。

## 1. Input Contract
生产任务必填：`episode_url`。
可选：`focus`, `audience`, `max_deep_dive_pages`, `exploration_mode`, `transcription_policy`, `output_language`, `production_scope`。

**`production_scope`（生产范围）**：本次要做哪些页面。缺省为整包。只有用户明确指定时才写入 `page_content_plan_proposal.json → production_scope`，并引用用户原话；助手不能自行缩小范围。

```json
{"pages": ["overview"], "source": "user_specified", "user_words": "只做总览，不要封面和深度页",
 "deep_dive_targets": [{"topic": "用户点名的主题", "module_ids": ["mod_02"], "unit_ids": []}]}
```

| 模式 | `pages` | 说明 |
|---|---|---|
| 整包（默认） | 省略 `production_scope` | 封面 + 总览 + 全部 Deep Dive，至少一张 Deep Dive |
| 仅封面 | `["cover"]` | `deep_dive_proposals` 须为空 |
| 仅总览 | `["overview"]` | 例：只做总览，给没听过节目的读者看全貌 |
| 仅 Deep Dive（全部） | `["deep_dive"]` | 不设 `deep_dive_targets`，模块按常规规划 |
| 定向 Deep Dive | `["deep_dive"]` + `deep_dive_targets` | 用户点名模块 id 或一个自由文本主题；规划者把它映射到 `module_ids`/`unit_ids`，写在《图片内容规划》里交用户审批。每张 Deep Dive 必须落在某个目标内 |
| 组合 | 如 `["cover","overview"]`、`["overview","deep_dive"]` + targets | 按 cover → overview → deep_dive 顺序生产 |

规则：
- 内容梳理、内容拆分和页面规划的门禁不随范围变化。总览骨架（问题、组件、关系台账）和封面副标题仍须在规划里写明，作为全包的知识骨架；范围外的页面只规划、不制作。
- 范围外页面的细节去向写 `OUT_OF_SCOPE`，或保留在不制作的总览/封面上。组装后它们记为 `deferred_out_of_scope`：继续追踪，不计入 18 张页数，也不是删除。整包默认模式下不能用 `OUT_OF_SCOPE`。
- 生产范围与暂缓状态只存在于工作产物，永不出现在成图上：整包内容地图只呈现面向读者的节目内容结构，不写“本轮范围／暂缓／未出页”。交付前运行 `scripts/check_reader_facing_text.py`。
- 页数只计算范围内的页面。构图（construct）、视觉候选、渲染和交付只处理范围内的页面；范围内页面的视觉、作者自检和用户确认门禁全部不变。
- 范围改变时，页面规划及其下游作废，须重新审批。
默认：中文；exploration_mode=`balanced`。**整包硬上限为 18 张：封面 + 全部总览页（含续页）+ 全部 Deep Dive；随组图交付的附录视觉页也占名额。** 单页总览时 Deep Dive 最多 16 张；总览增加一页，Deep Dive 名额相应减一。`max_deep_dive_pages` 若由用户给出，只能进一步收紧上限，不能突破整包 18 张。页数在《内容拆分》通过后按独立问题、证据边界和手机容量确定；超过上限时先重排能共享一个问题的内容与证据去向，保持每条必留细节可追溯，不得靠删内容、微字或把两种无关问题硬塞一页达标。无法同时满足完整性、可读性与 18 张上限时，停止页面制作并提交具体冲突与可审的范围调整方案，不能生成超额正式页面。

## 2. Phase 0 — Episode Intake
1. 验证 URL 是单集页面。
2. 解析 episode id、标题、Show Notes、发布日期、时长、主播/嘉宾、节目名、封面、可访问音频信息。
3. 生成 `episode_metadata.json` 和 `audio_manifest.json`。
4. 若音频不可获取，停止视觉生产；请求用户提供音频或可用 transcript，不得从不完整片段假装完成整期理解。

## 3. Phase 1 — Podcast Intelligence
严格遵循 `references/rules/audio_pipeline.md`。

在已验证的稳定本地 MLX 环境中，默认将完整音频一次性交给 `DIRECT` 转写；不得仅因节目较长就预切为 30 秒片段。只有用户明确选择、执行环境受限或确实需要分段恢复时才能使用 `SEGMENTED`。`DIRECT` 失败时停止并报告，不得静默切换策略或 provider。

输出三层 transcript：
- raw：证据层，不润色观点；
- clean：理解层，只做断句、标点、轻度口癖清理；
- grounded：生产层，对专名、数字、speaker 等有证据纠正并保留 provenance。

必须通过 Transcript Gate 后才能进入知识建模。转写与纠正完成后按 `references/rules/audio_pipeline.md` 的“QA、导出与进度”规则验证当前 Grounded QA；内容入口会检查其哈希与证据是否仍有效。

## 4. Phase 2 — 内容梳理

执行 [content_pipeline.md](references/rules/content_pipeline.md) 第2、3节：以 Grounded Transcript 建立全文台账，Raw与Show Notes仅按来源边界回查。用户审阅入口、连续覆盖、内容单元、语义边界及双向查漏均按该协议填写，不按页数或可画性删材料。

输出 `内容梳理.md`、`episode_content_inventory.json` 和 Content Review Gate。运行 `npm run content:gate -- --workspace <workspace> --stage inventory --action check`；机器通过后仍为 `needs_human_review`。用户明确确认当前理解、完整性与取舍后，才以 `--action approve` 记录当前哈希的审批。此前停止，不生成拆分、页面规划或图片。

## 5. Phase 3 — 内容拆分

只读取已获用户确认的 Inventory，执行 [content_pipeline.md](references/rules/content_pipeline.md) 第4节：确定整期主命题、模块边界与真实关系，展开论证并记录全量内容去向。Knowledge Graph表达关系，不替代内容梳理；不以模块整齐为由删减支撑或案例。

输出 `内容拆分.md`、`content_split.json`、`content_split_coverage.json` 和 Content Split Review Gate。运行 `npm run content:gate -- --workspace <workspace> --stage split --action check`，核验上游审批与内容去向；机器覆盖不代替语义审核。用户确认当前主命题、模块展开和内容去向后，才以 `--action approve` 绑定 Split、Coverage及审批产物；此前停止，不进入图片内容规划。

## 6. Phase 4 — 图片内容规划
先执行 [page_content_planning.md](references/rules/page_content_planning.md) 的页面职责、全文核心覆盖、逐页存在性及容量审查，并按 [content_pipeline.md](references/rules/content_pipeline.md) 第5节核验上游身份与交接。只读取已确认的梳理和拆分，绑定 Inventory、Split、Coverage及两次人工审批；输入变化按协议使受影响下游失效。

规划须说明每页问题、判断、论证、案例与边界、来源锚点、相邻页新增理解及合页/拆页理由；包含主图语义构思和默认三个构图方向。覆盖记账不代替框架与页面必要性审查，缺项先改合同，不进入构图；具体填写要求由页面规划协议维护。

先交付 `图片内容规划.md` 与 `page_content_plan_proposal.json`、`page_content_coverage_proposal.json` 供用户审核。用户通过后，核对内容与规划的审批哈希，生成下游读取的 `knowledge_base.json`、`knowledge_graph.json`、`knowledge_gate.json`、`editorial_plan.json`、`coverage_matrix.json`、`editorial_gate.json`，并记录规划审批。组装实现必须读取当前节目已审批的内容与规划；若只有上一期的内容专属脚本，保持本阶段待实现状态，不把换标题或复用语义组件当作完成。此门禁只证明已审批内容到页面合同的可追溯重排；不得称其证明逐字转写已完成人工校对。旧的 `knowledge:prepare` / `knowledge:assemble` / `editorial:assemble` 属于 transcript-window 路线，不用于已走 Content Inventory / Split 的任务。

原则：尊重论证而不是播放顺序。除非时间本身构成证据，不得把节目直接画成时间线。

模块数不等于 Deep Dive 页数，也不存在固定换算比例：一个模块可以在一页内完整解释，也可以因包含多个不能压缩到同一阅读路径的问题而拆成多页；多个模块只有在共享同一页面问题、合并后仍能保留各自证据与边界时才允许同页。不得从节目时长、模块数量、既往项目页数或经验区间倒推本期页数。

### Overview
建立节目级 mental model：首次接触者只读这一张完整图能复述全文核心判断及其关系；复习者一个月后用它快速恢复 whole picture。制作 Overview 必须读取 `references/rules/overview_page_production.md`，先核对核心覆盖、建立内容骨架和关系台账，再决定构图。主要板块须有实质判断，导航名称不能代替解释；具体案例、完整机制和主题专属限定由深度页展开。“平行问题线”是来源满足条件时才使用的可选结构，不是每期必备。
总览须逐条验证批准的必要关系及整页知识组织，原型和完整审核执行该协议第3、6节的 `overview_framework_check`；内容点覆盖不代替框架成立。所有页面执行 `references/rules/visual_reasoning.md` 第3节“禁止 box everything”，用开放组织与有语义的边界呈现关系。

### Deep Dive
每页围绕一个值得理解的问题，而不是宽泛主题。回答“为什么成立 / 怎样发生 / 什么证据 / 什么边界 / 如何使用”中与该页相关的部分。

## 7. Phase 5 — Information Budget
每页先依据已批准内容形成必要判断的最短充分句，再决定信息预算与图文分工；构图冻结前按 `references/rules/page_visual_production.md` 第5节C核对主体、对象、转折及范围。不重跑未变化的内容分析，也不先把内容压成关键词再让画面补全含义。
优先级：重要性 × 证据强度 × 对整体论证的必要性；Visualizability 只影响表达方式，不决定内容是否重要。
超预算时，先用对象、动作、关系或空间结构承担可视部分，再合并重复表达、重分空间与层级，最后在图文共同含义不变的前提下精简文字；必要含义、依据和限定保留。容量冲突按既有拆页授权处理；不得为了满足留白比例拆页，也不得擅自缩字、删核心内容或改页数。

每次拆页都要留下理由：指出当前页无法同时容纳的独立问题、论证路径或必留证据，并说明为什么合并会造成信息折损或手机阅读失败。不得因为上一模块拆成多页，就沿用相同页数。

## 8. Phase 6 — Visual Reasoning
编辑标题默认用具体陈述，非必要不用问句；标题、核心结论和副标题各司其职，句式随内容变化。拟定和终校标题时执行 `references/rules/page_visual_production.md → 通用标题表达`，内部 `page_question` 不直接作为成图标题；官方单集标题与必要的来源问题保持忠实。

开始新节目第一张正式视觉页前，必须在当前对话展示 `assets/color-library.png` 色卡，等待用户选择 01–12 中的一组或给出自定义主辅色；色值以 `assets/color-library.json` 为准。用户明确要求重选颜色或指出本次未经历选色确认时，即使文件中已有旧选择，也要再次展示色卡并等待新的选择，旧 `selected_palette.json` 此时仅作历史记录。不要把色卡授权、其他节目的配色、历史默认值或助手的推荐视为本次选择。用户在**当前这次选色步骤**回答后，将色库版本、编号、实际 HEX、正文色、派生浅底色、选择日期和用户原话写入本集 `selected_palette.json`，再用于 construction spec 与 scene。一个制作周期内后续页面沿用已选颜色，不逐页重复询问；用户改选时重新记录并重检受影响页面。用中深色强调关键文字与线条，以同色高明度浅阶铺面；辅色只作局部提示，正文保持深色。

**语义构思确认后选色，选色先于实际构图与scene。** 本集 `selected_palette.json` 必须在第一张 scene 生成前存在；每张新画或重画的页面都在当版 `REFERENCE_PREFLIGHT.json` 记录该文件路径、SHA-256、实际色值和颜色职责，并核对 scene 使用的是同一组 HEX。换色后重做受影响页的预检、渲染和颜色语义审查。

首次出图前向用户复述刚选定的色卡编号、名称和主辅色 HEX。

严格遵循 `references/rules/visual_reasoning.md`、`references/rules/page_visual_production.md`、`references/rules/page_quality_check.md` 和 `references/taste.md`。制作 Cover 时必须读取 `references/rules/cover_page_production.md`；制作 Overview 时必须读取 `references/rules/overview_page_production.md`；制作 Deep Dive 时必须读取 `references/rules/deep_dive_page_production.md`。所有内页还须执行 `references/rules/inner_page_module_contract.md`：保留页眉、标题／核心结论、主内容、整包地图、本页提纲及来源页脚的模块分工，正文构图仍由内容决定。Cover、Overview 与每张 Deep Dive 都是独立的逐页闭环。开始视觉制作、精修或整包交付时必须执行 `references/rules/visual_pack_execution.md`：默认三案选择；用户已授权整包连续制作时自主逐页完成后一次交付；要求先验一页时仅做样稿。各模式均保留内容门禁、真实渲染和作者自检，批量授权不等于用户验收。两轮返工限质例外按逐页协议记录，不能冒称页面通过。

每版构图或修改 scene 前，必须执行 `references/rules/page_visual_production.md` 第2节的联合预检，保存当前输入、参考观察和构图决定；缺项、过时或事后补签记录禁止送审。原型与完整构建的时间顺序执行该协议第3.1节。
选图时先执行 `references/rules/acceptance_case_index.md` 的参考选择与解读：优先查看本次用户指定参考，按理解任务补充内置案例；各页协议要求的基准图仍须查看。把实际打开的文件全部列入预检和当前自检记录。

新页面或主结构重构按 `references/rules/visual_creation_context.md` 和 `references/rules/visual_reasoning.md` 执行：当前主会话恢复精简输入 → 实看正反参考 → 视觉策略探索 → 原生整页草图 → 自检确认核心充分性与完整构建准备度 → 完整构建与审美精修。关系读懂不直接放行完整精修；准备度的证据字段与完成条件统一见 `visual_reasoning.md` 第4节。参考记录同时包含理解收益、画面完成度和本页绘制决定；不只记录禁令。

默认每页三案、逐页选定；完整制作顺序、候选等级、选图与批量停点必须执行 `references/rules/visual_pack_execution.md` 第1、4节。三案的语义任务一致，措辞和图形承载可不同；视觉策略差异按 `references/rules/visual_reasoning.md` 第6节检查。正式交付须完成作者自检、技术检查和当前版本的用户确认。

## 9. Phase 7 — Excalidraw Construction

构图、精修和导出须读取下表规则及 [footer_source_ranges.md](references/rules/footer_source_ranges.md)，执行当前页已批准的参数，不沿用案例坐标或固定模板。

| 检查职责 | 规则与构建要求 | 构建后命令 |
|---|---|---|
| 字体、字重与层级 | [typography_hierarchy.md](references/rules/typography_hierarchy.md)；文字声明 `customData.typography_role`，字号读取当前 `typography.role_sizes` | `python3 scripts/check_typography.py <scene或目录> --design-tokens <当前design_tokens.json>` |
| 笔触与对象轮廓 | [handdrawn_strokes.md](references/rules/handdrawn_strokes.md)；有效非文字图元声明 `customData.stroke_role`，参数读取当前 `stroke.role_settings` | `python3 scripts/check_strokes.py <scene或目录>` |

原型和局部重画使用 `npm run render:scene:checked -- --scene <scene> --preflight <当版预检> --brand <官方专辑PNG> --output <案目录> --outline-regions <当前正文与提纲区域JSON>`，不以临时直调导出替代。预检、机械门禁及记录要求执行 [page_visual_production.md](references/rules/page_visual_production.md) 与 [render_diagnostics.md](references/rules/render_diagnostics.md)：缺项、失败或过期代码须停止，未实现检查不填pass。机械合格不证明真实字形、语义或审美；仍按对应规则实看原图、390px和灰度。

正式 `render:checked` 复用同一受检入口；construction_spec每页填写构图前完成的 `preflight_relative_path`，内页另填 `outline_regions_relative_path`（相对单集工作区）。原型和选择报告在current绑定mechanical_render_record，正式送审携带三视图及完整机械记录。历史缺项只能补齐真实证据，不补签预检或自动升级通过。

1. Cover 先完成 `COVER_BRIEF.md`；所有页以当前内容规划、视觉方案和 token 哈希生成 `02-visual-plan/construction_spec.json`，显式记录原生图元、几何、来源与构图职责。内页保持外围语法，正文按问题决定，不复制旧坐标或对象。
2. 正式内容图仅使用原生可编辑元素：`image` 为0、`files` 为空。全套每页右上角均放对应官方专辑封面；按 `references/rules/inner_page_module_contract.md` 的品牌合同，在导出时确定性合成并记录来源、尺寸、位置与哈希。新 `construction_spec` 声明 `album_art_policy: "all_pages"`，每页填写同一 `brand_asset`。运行 `npm run construct -- --workspace <workspace>`；再按 `references/environment/RENDER_BROWSER_ENVIRONMENT.md` 用已验证权限执行 `npm run render:checked -- --workspace <workspace>`，同一scene导出原图、390px与灰度。局部渲染也先通过同环境 `npm run render:preflight`；预检失败即停止。
3. 真实打开全部scene，验证文字、对象、组及适用的绑定箭头编辑；无绑定箭头时明确记录不适用。中文字形、换行、边界与碰撞以真实PNG为准，不能由静态坐标代证。实际操作完成后运行 `npm run construction:closeout -- --workspace <workspace>`。
4. 完整出图后按 `references/rules/page_visual_production.md` 对照内容包、正反例和真实像素，保存绑定当前scene/PNG的 `RENDERED_PAGE_CHECK.md/json`；覆盖、图形解释、参考比较、文字几何与手机可读性任一失败则保持 `rejected_by_creator`。返工后重新渲染并重跑受影响层；不能以更整洁为理由丢失案例、条件或边界。
5. 对象的整体识别、部件装配、状态、归属与视觉权重按逐页规则检查；图文结合必须增加理解。只有可隔离局部问题才按对应页协议进入 `SCOPED_REPAIR`，冻结基线及允许元素、验证其余未变、重渲整页并自检；新增主结构仍从原型开始。

## 10. Phase 8 — 作者自检与技术检查

执行references/rules/page_quality_check.md、visual_reasoning的共同判据、同版taste和页型合同。主会话实际查看原图、390px、灰度与高清局部，检查来源、整体框架、图文关系、案例和限定、字体/笔触、导航及可读性；按最早失败层修复并重渲。保留原型充分性与完成度检查，不调用其他agent。

在RENDERED_PAGE_CHECK.json中记录status:self_check_passed、当前scene/png/phone/gray及高清图、mechanical_render_record和五项真实证据；总览记录overview_framework_check，用户条件记录user_requirements_check。格式见templates/author_page_check.json。

运行 `npm run visual:closeout -- --workspace <workspace> --page-check <作者自检.json> --action submit`，多页重复--page-check。命令验证当前文件、机械记录和自检证据后输出needs_human_review；无独立审核输入。用户明确接受当前版本后，同一输入加 `--action approve --user-approved` 记录批准。未验收时直接展示可编辑源和真实图片，不擅写用户通过。

## 11. Phase 9 — Package Review

按 `references/rules/visual_pack_execution.md` 的整包精修与交付版本流程横向审查，含主标题策略、模块标题与提纲编号、导航底色、线条密度和设计通过后的首读文案终校。先逐句核验七层语义职责，再核验字号和真实像素；任何改字都由当前 scene 重渲并复看原图、390px 与灰度图，局部审查不升级原整体等级。所有内容、伴读文案和报告完成后再冻结清单、当前规范快照与ZIP，逐文件核对目录和压缩包的hash，禁止混装历史版本。
伴读文案围绕有来源的分享主线自然展开，避免逐模块报目录，并匹配实际交付范围；单页总览作为最终交付时，也配套标题、正文和话题。先按 `references/rules/public_copy_production.md` 完成小红书草稿、Humanizer 表达处理、AI 痕迹人工检查和忠实度回归，运行 `npm run public-copy:check -- --workspace <workspace>`。Humanizer 只处理表达层，不承担内容理解或事实修复。
正式打包用 `npm run package` 的文案门禁；集中查看包或限质包采用手工归档时，打 ZIP 前还须按 `references/rules/visual_pack_execution.md` 运行 `npm run public-copy:bundle-check`，核对归档中的五份伴读文件与当前 `06-delivery` 一致。缺失时不得宣称整包交付完成。

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
- `COVER_BRIEF.md`、`COVER_RENDERED_CHECK.md`、封面作者自检与用户审批记录
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
- 每张内页的 `RENDERED_PAGE_CHECK.md`、作者自检记录与用户审批记录
- 原尺寸、390px 与灰度 PNG，以及同一受检 scene 重渲的 2880×3840 高清交付图；字形、布局/曲线与像素诊断按 `references/rules/render_diagnostics.md` 绑定
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
- 当前作者自检未通过或必要技术检查失败；
- 页面存在严重溢出/遮挡/不可读字号。
- 页面 scene 含任何嵌入位图、`image` 元素或非空 `files`；全页官方专辑封面的受控导出例外必须有来源与哈希，其他位图一律禁止。
- 创作者没有留下可核对的内容、案例与审美联合预检记录。
- 联合预检声称拒绝的失败模式仍出现在当前真实 PNG，或关键对象连同必要短标签仍无法辨认、与正文结合后仍无解释增益。
- 默认逐页确认模式下，当前页尚未获用户通过且不满足获准限质继续条件就开始下一页。已授权批量模式按visual_pack_execution执行；各模式均不得把未获验收页面记为accepted，或让未满足条件的正式发布门禁放行。
- 默认逐页三案模式下，三案未达到 visual_pack_execution 的展示门槛或尚未获得用户选定，就把某案当选定版或进入下一页；批量模式按visual_pack_execution的质量关卡推进。仍有未解决缺口时不得擅写正式accepted或RELEASED。

返工时按当前故障类型选择性读取 `references/rules/acceptance_case_index.md`，不要默认加载全部历史案例。
