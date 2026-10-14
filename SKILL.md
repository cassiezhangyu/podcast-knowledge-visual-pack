---
name: podcast-knowledge-visual-pack
description: 将小宇宙播客单集转成可追溯的内容梳理、内容拆分、知识信息图和可编辑 Excalidraw；适用于需要完整保留论点、案例、边界并按用户授权逐页确认或整包制作的播客知识视觉生产。
---

# Podcast Knowledge Visual Pack Skill

**版本：v0.6.2**

> **Development note:** `SKILL.md` defines runtime behavior of the finished Skill. Repository development is governed separately by `AGENTS.md` and `ROADMAP.md`. Do not mix development protocol into runtime reasoning.
>
> **改 skill 只改本地：** 对本 Skill 的任何修改只在本地完成并在本地记录；用户明确要求时才 commit 到远程、推送或开远程分支。


## 安装入口与工具位置

存在 `RUNTIME_ROOT.json` 时先读取其 `runtime_root`，后续所有 npm、scripts 和 workers 命令都以该仓库为工作目录；资源参考按本 Skill 所在目录解析。直接从仓库使用时以仓库根目录执行。仓库移动后重新安装入口；入口里不安装 node_modules、保存生产工作区或构建 dist。

## 先读什么

1. **`rules/main_workflow_sop.md`：唯一的总流程**（7 个用户确认点、主动汇报、SOP A 内容 → SOP B 主图构思 → SOP C 画图 → 交付，必跑检查清单）。
2. 本文件：任务目标、输入与生产范围、输出、硬性停止条件。
3. 流水线命令只通过 `npm run <命令>` 运行（每条都会先重新编译）；不要直接 `node dist/...`，否则可能跑到旧版出图程序（例如又出现日文字形）。
4. 各阶段细则按下表按需读取（导读见 `rules/README.md`）；Phase 0–10 的完整条文在 `rules/phase_details.md`。

| 阶段 | 细则 | 机器门禁 / 命令 |
|---|---|---|
| 单集解析、转写 | `rules/audio_pipeline.md`、`rules/transcription_guide.md` | `npm run intake` |
| 内容梳理、内容拆分 | `rules/content_pipeline.md` | `npm run content:gate -- --stage inventory|split --action check|approve` |
| 图片内容规划 | `rules/page_content_planning.md` | `editorial:assemble`／`editorial:closeout` |
| 主图构思、作图 | `rules/visual_reasoning.md`、`overview_page_production.md`、`cover_page_production.md`、`deep_dive_page_production.md`、`page_visual_production.md`、`inner_page_module_contract.md`、`visual_creation_context.md`、`taste.md` | `construct`、`render:checked` |
| 线条、字号、字形、页脚 | `handdrawn_strokes.md`、`typography_hierarchy.md`、`cjk_glyphs.md`、`footer_source_ranges.md` | 见 SOP C 第 7 步 |
| 质量底线与审核 | `visual_quality_bar.md`（R1–R21，颜色唯一来源 R4b）、`design_gates.md`、`independent_visual_review.md`、`acceptance_case_index.md`、`docs/QUALITY_GATES_CLI.md` | `visual:review:prepare`、`visual:closeout` |
| 精修、交付、文案 | `visual_pack_execution.md`、`public_copy_production.md` | `public-copy:check`、`package`、`public-copy:bundle-check` |

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

## 1. Input Contract
必填：`episode_url`。
可选：`focus`, `audience`, `max_deep_dive_pages`, `exploration_mode`, `transcription_policy`, `output_language`, `production_scope`。

**`production_scope`（生产范围）**：本次要做哪些页面。缺省为整包，行为和以前完全一样。只有用户明确指定时才写入 `page_content_plan_proposal.json → production_scope`，并引用用户原话；助手不能自行缩小范围。

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
- 页数只计算范围内的页面。构图（construct）、视觉候选、渲染和交付只处理范围内的页面；范围内页面的视觉、独立审核和用户确认门禁全部不变。
- 范围改变时，页面规划及其下游作废，须重新审批。
默认：中文；exploration_mode=`balanced`。**整包硬上限为 18 张：封面 + 全部总览页（含续页）+ 全部 Deep Dive；随组图交付的附录视觉页也占名额。** 单页总览时 Deep Dive 最多 16 张；总览增加一页，Deep Dive 名额相应减一。`max_deep_dive_pages` 若由用户给出，只能进一步收紧上限，不能突破整包 18 张。页数在《内容拆分》通过后按独立问题、证据边界和手机容量确定；超过上限时先重排能共享一个问题的内容与证据去向，保持每条必留细节可追溯，不得靠删内容、微字或把两种无关问题硬塞一页达标。无法同时满足完整性、可读性与 18 张上限时，停止页面制作并提交具体冲突与可审的范围调整方案，不能生成超额正式页面。

## 13. Output Contract
交付文件统一放在工作区的 `06-delivery/`（旧工作区的 `delivery/` 仍可被打包与文案检查读取）。
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
- 缺少隔离审核，或隔离审核尚未达到 `TARGET`（按 main_workflow_sop 写明原因记为 `independent_review_waived` 的除外，且不得写成 TARGET）；
- 页面存在严重溢出/遮挡/不可读字号。
- 页面 scene 含任何嵌入位图、`image` 元素或非空 `files`；全页官方专辑封面的受控导出例外必须有来源与哈希，其他位图一律禁止。
- 创作者没有留下可核对的内容、案例与审美联合预检记录。
- 联合预检声称拒绝的失败模式仍出现在当前真实 PNG，或关键对象连同必要短标签仍无法辨认、与正文结合后仍无解释增益。
- 默认逐页确认模式下，当前页尚未获用户通过且不满足获准限质继续条件就开始下一页。已授权批量模式按visual_pack_execution执行；各模式均不得把未获验收页面记为accepted，或让未满足条件的正式发布门禁放行。
- 默认逐页三案模式下，三案未达到 visual_pack_execution 的展示门槛或尚未获得用户选定，就把某案当选定版或进入下一页；批量模式按visual_pack_execution的质量关卡推进。选定REJECT-B不能写成TARGET、正式accepted或RELEASED。

返工时按当前故障类型选择性读取 `rules/acceptance_case_index.md`，不要默认加载全部历史案例。
