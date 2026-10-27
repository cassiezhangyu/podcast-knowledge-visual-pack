---
name: podcast-knowledge-visual-pack
description: 将小宇宙播客单集转成可追溯的内容梳理、内容拆分、知识信息图和可编辑 Excalidraw；适用于需要完整保留论点、案例、边界并按用户授权逐页确认或整包制作的播客知识视觉生产；也用于收录、修订和停用知识图正负向参考案例。
---

# Podcast Knowledge Visual Pack Skill

视觉创作须在草图后、精修前、交付前三个时点保存当前图片与作者判断，执行 [视觉质量检查](references/rules/visual_quality_trial.md)。检查记录通过不代表用户已验收。

> **改 skill 只改本地：** 对本 Skill 的任何修改只在本地完成并在本地提交；用户明确要求时才推送到远程、开远程分支或发布。正式发版流程见根目录 [`RELEASE_GUIDE.md`](RELEASE_GUIDE.md)。

> 生产任务执行本 Skill；目录与安装维护见仓库 `README.md`，单集成果保存在用户指定工作区。

## 安装入口与工具位置

完整 Skill 在本仓库根目录维护；项目安装副本通常位于 `.agents/skills/podcast-knowledge-visual-pack/`；所有 npm 与 scripts 命令在该根目录执行；源码与转写 worker 分别位于 `scripts/src/` 和 `scripts/workers/`。copy 安装将兼容链接展开为普通文件和目录，包含同一套代码与资源，在复制后的根目录安装依赖并构建。仅旧精简入口仍读取 `RUNTIME_ROOT.json → runtime_root` 定位程序。规范资料按本 Skill 根目录解析；`references/` 保存规则与数据合同，`assets/` 保存模板、参数和案例。旧 `rules/`、`schemas/`、`templates/`、`examples/`、`taste.md` 和 `design_tokens.json` 在源码中是兼容链接，在 copy 分发包中是生成副本；维护时修改规范资源并重新生成分发包。生产工作区放在 Skill 之外。

## 执行边界：主会话完成绘制与自检

按标准流程解析来源、整理内容、规划页面、绘制、真实渲染、作者自检并输出。此 Skill 不创建或调用审核 agent，不自动派发独立审核、陌生首读或仲裁任务，也不把审核报告、reviewer_context_id 或 TARGET 作为输出前置。

保留来源忠实、当前参数、真实图片、原生可编辑性及用户已确认的内容/页面范围。技术检查与作者自检如实记录；自检不冒充独立结论。用户确认按原有内容和选图停点处理，不额外增加审批。

## 读取顺序

通用质量判据归 `references/rules/visual_reasoning.md` 第1节；用户／系列偏好归 `references/taste.md` 与当前合同；具体修法归案例库。恢复时按本轮失败层读取对应规则，不将案例物件、坐标、色值或局部通过推广为通用模板。

创作开始即执行 [同一标准在创作阶段的落实](references/rules/visual_reasoning.md#同一标准在创作阶段的落实)，由主会话完成自检后输出。

先按当前阶段读取下表；恢复任务先核对现有审批和当前工件，不重跑已有效的上游。主入口负责范围与阶段停点，细节在对应规则维护。

| 当前任务 | 必读规则 |
| --- | --- |
| 转写与来源复核 | `references/rules/audio_pipeline.md` |
| 内容梳理、拆分与页面规划 | `references/rules/content_pipeline.md`、`references/rules/page_content_planning.md` |
| 新页或主结构重构 | `references/rules/visual_creation_context.md`、`references/rules/visual_reasoning.md`、对应页型协议（`cover_`／`overview_`／`deep_dive_page_production.md`） |
| 构建、精修和导出 | `visual_reasoning.md` 第1节、`taste.md` 与当前合同；`page_visual_production.md`；绘图工具包 `scene_kit_usage.md`；外围合同 `inner_page_module_contract.md`；技术诊断 `render_diagnostics.md`；字号 `typography_hierarchy.md`；笔触 `handdrawn_strokes.md`；项目偏离 `project_overrides.md` |
| 作者自检与选图 | 同一共同标准、`taste.md`；`page_quality_check.md`、`cold_reader_check.md`、`layout_budget_and_margins.md`、`cjk_glyphs.md`、`visual_pack_execution.md` |
| 最终文案与交付 | `public_copy_production.md`、`visual_pack_execution.md` |
| 案例库维护（独立） | `case_library_maintenance.md`、`acceptance_case_index.md` |

历史独立审核说明已迁至 `references/legacy/independent_visual_review.md`，**不是**当前必读路径。

规则正文不写版本号；每条规则何时加入、为什么加入，记在 `RELEASE_NOTES.md`。

### 只做一页总览的最短路径

已有获批转写和内容时，按这个顺序读和做，其余规则遇到问题再查：

1. `page_content_planning.md` 第0节「总览的统一载体」：写出载体、各部位对应和关系台账（含 `unified_carrier`），做反目录自检，**先把框架发给用户确认**，再画三案。
2. 同时产出本期术语表 `01-understanding/READER_JARGON.json`（`cold_reader_check.md`「本期术语表」）。
3. `overview_page_production.md` 与 `visual_reasoning.md` 第1节：定三案的组织方式；实际打开正反例（`assets/examples/positive|negative`）。
4. 用 `scripts/lib/scene_kit.py` 绘制（`scene_kit_usage.md`）；副标题只写内容陈述。
5. `npm run render:scene:checked -- --scene … --preflight … --output … --brand … --design-tokens assets/design_tokens.json`（启动浏览器需宿主权限，见 `references/environment/RENDER_BROWSER_ENVIRONMENT.md`）。版面预算、压线及最终合成图完整边距检查未通过时，不输出合格候选；保留的失败图片仅作诊断。
6. 按 `visual_pack_execution.md`「给用户看图」生成无 `@` 副本和并排对比图，确认用户真的看到了，再请用户选。
7. 选定后：`npm run author-check:init` → 逐项填写判断字段 → `npm run render:manifest` → `npm run visual:closeout -- --action submit`；用户确认看过并通过后再 `--action approve --user-approved`。

## 0. Mission

输入一个小宇宙播客单集 URL，建立可追溯的节目证据层，重建知识结构，再寻找能让读者“看见这个结构”的视觉表达，最终输出：系列化、内容驱动的封面 + 经内容与真实阅读容量验证的节目级 Overview + N 张 Deep Dive + 可编辑 Excalidraw 源文件 + 来源与 QA 底账。Overview 用一张图汇总全文核心内容并建立理解框架，具体知识展开进入 Deep Dive；续页必要性按 `overview_page_production.md` 验证核心框架本身的容量。

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

新页面的草图与审核分别检验解释收益和整页构图，按 `visual_reasoning.md` 的构图证据与实际相邻页比较执行。用户授权继续下一页时保留前页真实验收状态。

恢复已通过内容与页面规划的制作时，主会话核验当前审批、页号映射、资产与本页必看参考，再按 [逐页创作上下文](references/rules/visual_creation_context.md) 建立本页精简输入包；按 [视觉创作](references/rules/visual_reasoning.md) 验证整页草图。已批准的上游不会因恢复上下文重做。

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
| 仅总览 | `["overview"]` | 例：只做总览 |
| 仅 Deep Dive（全部） | `["deep_dive"]` | 不设 `deep_dive_targets` |
| 定向 Deep Dive | `["deep_dive"]` + `deep_dive_targets` | 用户点名模块或主题 |
| 组合 | 如 `["cover","overview"]` | 按 cover → overview → deep_dive 顺序生产 |

规则要点：内容梳理／拆分／页面规划门禁不随范围变化；范围外细节记 `OUT_OF_SCOPE`／`deferred_out_of_scope`；成图不得出现制作状态用语（`check_reader_facing_text.py`）；页数只算范围内页面。整包硬上限 **18 张**（封面 + 全部总览含续页 + 全部 Deep Dive；附录视觉页也占名额）。`max_deep_dive_pages` 只能收紧不能放宽。默认中文；`exploration_mode=balanced`。细则见 `design_gates.md`「生产范围」。

## 2–10. 生产阶段（细节在规则文件）

| Phase | 名称 | 入口规则／命令 |
| --- | --- | --- |
| 0 | Episode Intake | 验证单集 URL → `episode_metadata.json`、`audio_manifest.json`；无音频则停 |
| 1 | Podcast Intelligence | [`audio_pipeline.md`](references/rules/audio_pipeline.md)；Transcript Gate 通过后才能建模；已有可用 grounded 缓存时可不要求 `--provider-python` |
| 2 | 内容梳理 | [`content_pipeline.md`](references/rules/content_pipeline.md) §2–3；`content:gate --stage inventory`；**用户确认后**才拆分 |
| 3 | 内容拆分 | 同协议 §4；`content:gate --stage split`；**用户确认后**才进图片规划 |
| 4 | 图片内容规划 | [`page_content_planning.md`](references/rules/page_content_planning.md) + content_pipeline §5；用户通过后组装 knowledge／editorial 下游 |
| 5 | Information Budget | [`page_visual_production.md`](references/rules/page_visual_production.md) §5C；必要性 × 证据 × 论证；超预算先图承担再精简文字 |
| 6 | Visual Reasoning | 色卡确认 → [`visual_reasoning.md`](references/rules/visual_reasoning.md)、[`page_visual_production.md`](references/rules/page_visual_production.md)、页型协议、[`inner_page_module_contract.md`](references/rules/inner_page_module_contract.md)、[`visual_pack_execution.md`](references/rules/visual_pack_execution.md)；顺序：先锁字号与终稿文字（含冷读），再精修图形 |
| 7 | Excalidraw Construction | `typography_hierarchy` + `handdrawn_strokes`；`render:scene:checked`／`render:checked`；[`render_diagnostics.md`](references/rules/render_diagnostics.md)；`construction:closeout` |
| 8 | 作者自检与技术检查 | [`page_quality_check.md`](references/rules/page_quality_check.md)、[`cold_reader_check.md`](references/rules/cold_reader_check.md)；看原图／390px／灰度；**发给用户一律 @2x，并确认用户真的看到了**；`author-check:init` → `render:manifest` → `visual:closeout` |
| 9 | Package Review | [`visual_pack_execution.md`](references/rules/visual_pack_execution.md) 整包横审；[`public_copy_production.md`](references/rules/public_copy_production.md)；`public-copy:check`／`package` |
| 10 | Taste Discovery | 仅明确的 Taste Feedback 进长期候选；先入 Discovered Preferences |

**选色**：首次正式视觉页前展示 `assets/color-library.png`，等用户选 01–12 或自定义；写入本集 `selected_palette.json` 后才生成 scene。  
**默认三案、逐页选定**；批量授权不等于用户验收。两轮返工限质例外按逐页协议记录。

字号默认：主标题 48；结论／模块标题 32；副标题 26；正文与必要图内标签 24；辅助／导航／页眉页脚 22。承载内容的文字 ≥24px；放不下删字不缩字。详见 `typography_hierarchy.md`。

## 11. Output Contract（最少）

- 封面／总览／Deep Dive 的 PNG、`.excalidraw`、BRIEF／RENDERED_PAGE_CHECK、作者自检与用户审批
- 同一 scene 的 `P01@2x.png`（2400×3200，看图与交付默认）；1x 仅内部检查；另含 390px、灰度、2880×3840 高清
- 内容链：`内容梳理.md`、inventory／split／coverage／gates／human_approval、knowledge／editorial 组装产物
- `construction_spec.json`、visual／construction／render gates、`delivery_manifest.json`、`package_gate.json`
- 小红书文案链：`xiaohongshu*.md`、`public_copy_*`；`05-qa/*`

## 12. Hard Stops

禁止假装完成：音频／转写不足；总览未经用户确认统一载体就画三案；用户没看到图就记 approve；台账缺口；梳理或拆分未获用户确认却进入下游；哈希与审批不匹配；Construction／可编辑性未过；归因不明；Overview 只是目录；作者自检或必要技术检查失败；严重溢出／遮挡／不可读字号；scene 含非法位图；缺联合预检或预检声明的失败模式仍在 PNG；默认三案／逐页模式下未达展示门槛或未获选定却推进；批量模式未按 `visual_pack_execution` 质量关卡却擅写 accepted／RELEASED。

返工时按故障类型选择性读取 `acceptance_case_index.md`，不要默认加载全部历史案例。
