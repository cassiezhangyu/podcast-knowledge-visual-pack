# 未发布：标准安装器兼容

- copy 安装将包内符号链接展开为普通文件和目录，保留现有相对路径；拒绝包外、失效及循环链接。
- 目录校验兼容源码链接和内容一致的分发副本，发现副本偏离时报告错误。
- 标准安装入口改为待发布的 `install` 分支；源码结构与生产门禁保持不变。发布前不能把本地验证视为 GitHub 已可一键安装。

# v0.6.0（2026-10-24）

相对正式版 [v0.5.0](https://github.com/cassiezhangyu/podcast-knowledge-visual-pack/releases/tag/v0.5.0)（`0263312`），把依赖模型临场发挥的总览交付环节改成规则或工具。按 0.x 约定：总览收尾门禁新增必填项、导出新增阻断条件，定为 **MINOR**。

## 新增功能

- 总览统一载体必答：关系台账顶层 `unified_carrier`（`statement` / `basis` / `parts` / `user_confirmed`），三案前须经用户确认；`visual:closeout` 与 `check_overview_framework.py` 缺失即拒绝。
- 绘图工具包 `scripts/lib/scene_kit.py`：按色卡派生字号、笔触、可放文字的浅底色；提供页眉／提纲／页脚合同件和少量物件示范；`finish()` 检查文字互叠、压实心图形、粗笔触贴边。不提供构图模板。
- 导出前自动跑版面预算与压线边距检查，失败不出 PNG。
- `author-check:init`、`render:manifest`、`preview:copies`：从机械记录生成自检草稿、真实渲染清单、可打开的 @2x 副本与并排对比。
- 内容阶段产出本期术语表 `01-understanding/READER_JARGON.json`；内页出现术语须标出并解释。
- 副标题只写内容陈述：导出时拦截节目名、单集标题、期号与“本期／节目／播客／专辑”。

## 优化／文档

- `SKILL.md` 增加「只做一页总览的最短路径」；Hard Stops 增加“未确认统一载体就画三案”“用户没看到图就记 approve”。
- 看图交付规则、换平台排障表；规则正文去掉版本号补丁标注。
- 案例库：EP86 总览批准版正例、第一轮目录式总览负例（不是必看基准）。公开展示范围见下方确认项。

## 问题修复

- 占位与套话检查改到结构检查之后，避免盖掉具体缺项报错。
- scene_kit 文字宽度估算与轻笔触贴边误报已校准。
- 补回安装副本缺失的 `development/`，使 `npm test` 可在源码仓库运行。

## 不兼容变更／迁移

1. 总览台账必须有已确认的 `unified_carrier`；旧工作区补字段并经用户确认后才能收尾。
2. `render-scene-checked` 在预算或压线失败时不再出图；文字下底色须 R+G+B ≥ 725，roughness ≥1.6 的图形离安全区留 3–5px。
3. 内页收尾必须有本期术语表；冷读清单新增 `highlighted_example_labeled`、`title_reference_specific`、`theory_named_explained_inline`。
4. `visual:closeout` 拒绝占位词、同一理由套用超过 3 条、两项检查共用同一段证据。
5. 副标题不得出现节目名或期号。
6. 安装／升级：解压本版安装 ZIP 到空目录后 `npm ci && npm run build`；勿覆盖已有安装；工作区仍放在 Skill 之外。
7. 正式 Tag／`package.json` 版本为 `0.6.0`（无 `-local`）。

## 验证

发版候选上隔离安装后运行：`npm ci`、`npm run build`、`npm test`、`npm run test:python`、`npm run test:guards`、`python3 scripts/check_skill_layout.py`。结果写入本条发布时的验证段／Release Assets manifest。

未纳入：`1022-播客可视化` 在 v0.5.0 之后的 5 个未推送提交；远程 `release/v0.6.3`（从 v0.3.0 分叉的仅本地线）。

上一正式版本：[v0.5.0](https://github.com/cassiezhangyu/podcast-knowledge-visual-pack/releases/tag/v0.5.0)。比较：https://github.com/cassiezhangyu/podcast-knowledge-visual-pack/compare/v0.5.0...v0.6.0

# v0.5.0（2026-10-22）

相对正式版 [v0.4.0](https://github.com/cassiezhangyu/podcast-knowledge-visual-pack/releases/tag/v0.4.0)（`7a70652`），合并本地 0.4.1–0.4.8 积累、文档架构收拢与案例库重整。按 0.x 约定：门禁与合同语义有不兼容变化，定为 **MINOR**。

## 新增功能

- 审图与交付默认使用同 scene 重渲的 `@2x`（2400×3200）；1x 仅内部检查；closeout／package 核验 `@2x`。
- 陌生读者／逐句冷读必做；比喻只撑主图、数字溯源、标签撞名、提纲不含括号等写入自检与登记。
- 死白审计、箭头逐条记录、改版并排 diff、内容字≥24、孤行检查、批准后勘误（`erratum:apply`）、一页多交付版本登记（`visual:register-versions`，只改字可沿用箭头记录）。
- 禁止简笔画；构图前参考硬门禁；字号默认 48/32/26/24/22；专辑封面与单集封面分记并核对。
- 排版预算、边距审计、简体字形、项目覆盖登记、预检 bump、提纲区域自动推导等。
- 根目录 `RELEASE_GUIDE.md`：正式发版标准流程。

## 优化／文档

- 将 v0.4.7／v0.4.8 等本地补丁全文并入 `references/rules/*`，删除版本号补丁文件；精简 `SKILL.md` 为读取顺序与阶段入口。
- `independent_visual_review` 迁至 `references/legacy/`（兼容／已弃用）。
- README 目录树与版本标注对齐仓库。

## 案例库

- **正式正例**仅保留：EP88 封面、EP88 总览三版（A-V16／B-V18／C-V20）、另辟西径 VOL69 总览三版。
- 其余原正例迁入 `assets/examples/retired/` 并停用，不作为必看基准。
- 新增负例：EP88／VOL69 标题变体页（排版混乱、文字堆砌、简笔画）。

## 不兼容变更／迁移

1. 新制作须满足现行自检门禁（冷读、`@2x`、死白／箭头、参考硬门禁等）；缺少对应记录时 `visual:closeout`／`visual:register-versions` 会拒绝。
2. 默认字号与「放不下删字不缩字」已写入 tokens／规则；旧规格若字号不合须按当前标准重排，不得批量补签。
3. 参考案例门禁改为只认上述正式正例；旧 EP59／e248 等正例路径已 retired，脚本与索引已更新。
4. 安装／升级：解压本版安装 ZIP 到空目录后 `npm ci && npm run build`；勿覆盖已有安装；工作区仍放在 Skill 之外。
5. 正式 Tag／`package.json` 版本为 `0.5.0`（无 `-local`）。

## 验证

发版前提交上运行：`npm run build`、`npm test`、`npm run test:python`、`python3 scripts/check_skill_layout.py`（结果写入本条发布时的验证段／Release Assets manifest）。

上一正式版本：[v0.4.0](https://github.com/cassiezhangyu/podcast-knowledge-visual-pack/releases/tag/v0.4.0)。比较：https://github.com/cassiezhangyu/podcast-knowledge-visual-pack/compare/v0.4.0...v0.5.0

---

# docs: architecture fold（已并入 v0.5.0，原仅本地）

文档架构收拢（不改变出图／渲染行为）：v047／v048 并入 rules、精简 SKILL、legacy 独立审核、新增 RELEASE_GUIDE；当时 package 仍为 0.4.8-local。

# v0.4.8-local（仅本地，2026-10-22）

来自 EP88 6ab11c95-v045 R7 改字轮（05-qa/R7_TEXT_CHANGES.diff），Cassie 批准全部六条，细则已并入 references/rules/cold_reader_check.md 与 visual_pack_execution.md（原 v048_local_rules.md 已删除）：
1. 逐句冷读必做：自检 `checks.sentence_cold_read.items[]` 覆盖 scene 每个文字元素；仍 flagged 未解释或含已知节目内部说法即拒（visual:closeout、visual:register-versions）。
2. 比喻只撑主图，正文直说：`metaphor_body_plain` 必填。
3. 数字溯源：`number_trace` 逐个数字/数量词写原句+时间戳（或 structural+理由），自动扫描缺项即拒。
4. 标签撞名：`label_collision` 必填，内置词表（木心等）命中无裁定即拒。
5. 提纲只写章节名：`outline_items` 含括号即拒。
6. 只改字路线：register-versions 记录 `geometry_sha256`，几何与上一已登记版本相同则自动沿用其箭头记录。
- 新增 scripts/src/sentence-cold-read.ts、development/tests/v048-local.test.ts。

# v0.4.7-local（仅本地，2026-10-22）

来自 6ab11c95 复盘（05-qa/RETRO_6ab11c95.md），Cassie 批准全部 P0/P1/P2，细则已并入 page_quality_check／visual_pack_execution／typography_hierarchy／page_visual_production／audio_pipeline／project_overrides／render_diagnostics 等（原 v047_local_rules.md 已删除）：
- P0：@2x 看图沿用；新增 `scripts/audit_dead_space.py`（≥45000px² 且两边≥90px，1200 坐标，浅底纹算空，标题/结论在正文区外），render:scene:checked 自动写 DEAD_SPACE_AUDIT.json，visual:closeout 要求 `dead_whitespace_audit` 绑定通过记录；自检必填 `arrow_audit`（逐条 起点→经过→终点→读法，场景有箭头不得 not_applicable）。
- P1：`scripts/round_diff.py` 并排图＋可见改动清单，改版（revision_of）缺记录、清单空或看不出差异被拒；规则冲突“例子紧挨步骤”优先并先问用户；check_typography 按内容定角色（content_bearing<24px 判错，未声明的小字须作者在 `content_text_min_size` 判定）；`npm run erratum:apply` 批准后勘误（哈希链跟随更新、errata.json 留痕）；`npm run visual:register-versions` 草图路线批准记为正式批准、一页多交付版本。
- P2：手机优先字号档仅文档评估；有转写缓存时不要求 --provider-python；手写提纲区域格式模板；孤行自动检查。
- 修复：check_typography 处理目录时只累计最后一个场景的缩进错误。

# v0.4.6-local（仅本地，2026-10-22）

- 文字像素感修复：每次受检渲染同一 scene 另按 2 倍重渲 `P01@2x.png`（2400×3200）。给用户看图、送审和交付默认用 @2x；1x `P01.png` 只作内部检查，坐标与字号（48/32/26/24/22）仍按 1200×1600 定义。
- 机械记录 `review_2x`、渲染清单 `review_png/review_png_sha256/review_scale`；visual:closeout（含作者自检路径）与 package 核验 @2x 存在、哈希、同 scene、2400×3200 且比例与 1x 一致；package 交付 `<页名>@2x.png`。
- 向后兼容：v0.4.6 之前的记录没有 @2x 时按 legacy_1x_only 放行，不追认。

# v0.4.5-local（仅本地，2026-10-21）

来自 6ad48f83 复盘（05-qa/RETRO_6ad48f83.md），Cassie 批准全部 10 项：
1. 陌生读者必查清单（梗/英文/字面矛盾/提醒对象在页/例子有结果感受/一句说明一个例子且相邻/图标签对应正文/副标题是读者结论）＋逐句白话复述表；`visual:closeout` 缺项拒绝（cold_reader_check.md）。
2. 先锁字号与终稿文字再精修图形：自检必填 `text_and_scale_lock`（visual_pack_execution.md）。
3. check_reader_facing_text 拦截编辑过程用语（本页整理、分组、松散、归类、归属由…）；提醒只写读者事实（design_gates.md）。
4. 并列项不得画成路径/旅程/时间线，除非台账授权顺序（overview_page_production.md、page_quality_check R19）。
5. 用户批准只需作者自检通过＋`--user-approved`（作者路径已存在，补测试）；check_visual_progression 支持 `review_mode: author_self_check`，不再要求隔离审核者。
6. check_typography：≤5 级字号、相邻差 ≥2px、390px 预览最小字高 ≥7.1px；历史参考用 `--legacy-scale`。
7. 项目覆盖：固定登记 `02-visual-plan/project_overrides.json`；未登记的非默认 tokens 渲染拒绝；`overrides:scan` 提示 ≥2 集复用的覆盖升级为默认（project_overrides.md）。
8. `npm run preflight:bump`：生成新版预检，重算哈希、继承观察、记录 previous 与修订说明。
9. 提纲/正文区域默认从 scene 自动推导（`--regions auto`，render:scene:checked 默认）；手工区域须 `manual_reason`＋`overlay_screenshot`。
10. intake 抓取时下载专辑封面到 `00-source/brand/` 并写 `album_cover.json`（sha256）；渲染核对右上角素材与登记文件一致。

# v0.4.4-local（仅本地，2026-10-21）

- 默认字号改为 Cassie 标准：主标题 48（overview/deep_title、typography.title）；整页结论与模块标题 32（page_conclusion、section_entry、overview_section）；副标题 26（overview/deep_thesis、subheading、section、object_name）；正文与必要图内标签 24（body、diagram_label）；辅助注释、导航、页眉页脚 22。去掉 45/30/28/27/25/23 级。
- typography_hierarchy.md、SKILL.md 增加规则：以实际 PNG 校准；放不下时删字或重排，不缩到标准以下。inner_page_module_contract 提纲条目改为 diagram_label 24；相关测试同步。

# v0.4.3-local（仅本地，2026-10-21）

- 修复：小宇宙适配器把单集封面（episode.image）记成 `cover_url` 并被当作专辑封面合成。现分别记录 `podcast_cover_url`（专辑封面，取 podcast.image）与 `episode_cover_url`；`cover_url` 保留兼容，含义为单集封面。
- episode_metadata / construction_spec schema：新增 `podcast_cover_url`、`episode_cover_url`、`brand_asset.source_url`。
- 门禁：`construct`、`render`（validateAlbumCoverSource）与 `render:scene:checked`（scripts/album-cover-check.mjs）核对品牌素材来源等于专辑封面，等于单集封面或缺来源即失败；checked 渲染同时核对素材 hash。
- 规则：inner_page_module_contract.md、page_quality_check.md、SKILL.md 增加“合成前对照元数据确认是专辑封面”。

# v0.4.2-local（仅本地，2026-10-21）

- taste.md：以“禁止简笔画”替换“简笔画可以出现”；REJECT-A 同步。
- page_quality_check.md：恢复 v0.6 R11（不能退成平直的 SVG 或几何图）、R17（装饰性小图标不算），新增 R18 禁止简笔画。
- 参考硬门禁：scripts/reference_gate.py；check_reference_preflight.py 与诊断渲染器 render_scene.mjs 在任何渲染前强制正反例逐图观察、总览 e248 基准、允许/禁用图形语言（须禁简笔画）。审计分层渲染以 PKVP_AUDIT_LAYER=1 内部豁免。
- visual:closeout：缺 side_by_side_reference_comparison（正/反例逐图 + R11/R17/R18）、visual_gain_counterproof 或总览 overview_framework_check 时拒绝。
- 测试：development/tests/test_reference_gate.py；author-visual-closeout.test.ts 新增 5 例。

# v0.4.1-local · 移植 v0.6.3 的五条本地规则（仅本地，未推送）

在 v0.4.0 作者自检框架内补回，均为主会话自检必做项，不恢复审核、陌生首读或仲裁 agent：

- 陌生读者理解检查：`references/rules/cold_reader_check.md`，page_quality_check 第29项，记录 `cold_reader_check`。
- 排版预算：`scripts/layout_budget.py`（预算 JSON / `--scene` 草稿估算），规则 `references/rules/layout_budget_and_margins.md`，第30项。
- 边距与页眉页脚留白审计：`scripts/audit_overlap_margins.py` + 诊断分层渲染器 `scripts/render_scene.mjs`（新增浏览器函数 `renderSceneLayerForAudit`，不走导出机械门禁、不用于交付图），记录 `layout_budget`、`margin_audit`。
- 简体中文字形规则：`references/rules/cjk_glyphs.md`，第31项，记录 `cjk_glyph_audit`。
- 只改本地：SKILL.md 顶部。
- `visual:closeout` 作者路径现要求上述四项自检证据；测试 `development/tests/test_layout_budget_margins.py`、`author-visual-closeout.test.ts`。

# v0.4.0 · 独立安装、作者自检与渲染证据更新

以 v0.3.0 为基线，整合当前已维护的 Skill、运行工具与回归测试；完整 Skill 可直接放入项目发现目录，主会话完成创作与作者自检，真实渲染记录继续绑定当前工件。

## 新增与改进

- 增加独立 copy 安装和共享维护源的 link 安装；保留默认 legacy 调用兼容。规则、schema、模板、运行源码和转写 worker 随独立包提供。
- 规范资源集中到 references/、assets/、scripts/src/ 与 scripts/workers/，保留原 rules/、schemas/、templates/、examples/、src/、workers/ 等包内相对兼容链接。
- 页面登记默认接收作者自检 `--page-check`，不再要求创建审核 agent；来源、当前工件哈希、用户内容确认及选图停点继续保留。旧 `--review` 与 `--packet` 为显式兼容调用。
- 总览规划增加批准关系台账和框架核验；理解读回与用户条件检查分别记录证据及适用范围。强化内容职责、整页构图、图文指认、手机阅读和来源边界的制作要求。
- 统一渲染前机械检查、中文字体与字形核验、文字几何和固定外围模块检查；导出记录绑定 scene、原图、390px、灰度及可选高清图与比例。
- 运行回归测试、合成夹具及 Vitest 配置纳入仓库内 development/，测试不再依赖外层项目布局。

## 修复

- 修复文字元素缺少 customData 时，重叠检查提前崩溃而未报告重叠的问题。
- 补齐过期测试夹具所缺的预检、笔触职责、理解读回及机械导出记录，使测试进入各自需要验证的业务分支。
- 修复测试迁移后的根路径与 macOS 临时目录真实路径绑定。

## 兼容影响与迁移

本次含流程及数据合同变化，按项目 0.x 版本规则递增 MINOR。

1. 新安装：解压独立安装包到目标项目 `.agents/skills/podcast-knowledge-visual-pack/`，确认根目录存在 SKILL.md，再运行 `npm ci` 和 `npm run build`。ZIP 使用包内相对符号链接，macOS/Linux 可用 `unzip` 解压并执行 `python3 scripts/check_skill_layout.py` 验证。
2. 升级：先保留现有安装和生产工作区，再将新版本安装到空目录；安装器不覆盖已有目标。工作区放在 Skill 目录之外，不把旧 RUNTIME_ROOT.json 移入完整 copy 安装。
3. 新 construction_spec 须提供 preflight_relative_path，内页须提供 outline_regions_relative_path；文字元素须声明 typography_role，非文字元素须声明 stroke_role。旧规格应按当前 schema 补齐真实记录，不能批量补签审批。
4. 页面登记使用 `visual:closeout -- --workspace <工作区> --page-check <作者自检文件>`；只有当前用户明确确认后才使用 approve 与 --user-approved。需要复核旧独立报告时，显式使用旧 --review/--packet 路径，并满足当前绑定要求。
5. 新理解读回记录需遵循当前 schema；1.1 记录明确 review_mode、prior_exposure 和 readback_scope，知情回归不能声称陌生首读。
6. 源码开发测试在仓库根目录执行 `npm test` 和 `npm run test:python`；安装 ZIP 不包含 development、测试依赖缓存或 dist，使用者须自行安装依赖并构建。

Node.js 最低要求仍为 24；标准库脚本使用 Python 3.9+。完整转写另需 macOS Apple Silicon 的 MLX Whisper 环境。Humanizer 为文案阶段的独立外部 Skill，不随本安装包分发。

## 公开范围与许可

纳入通用代码、规则、schema、模板、参数、色卡和此前已确认公开的8组历史案例及 EP59 参考。案例和色卡依各自使用说明，不适用 MIT 通用代码许可。

排除项目私有正反案例、候选案例、对应索引与私有实图指引、生产成果、原始音频、缓存、日志及外层项目专用工具。本地原件保留。源码快照包含开发测试；独立安装 ZIP 只包含安装和运行所需文件。

## 验证范围与限制

发布准备检查包括候选源码干净安装、构建、运行回归测试、结构及包内链接检查；独立安装包另行解压、安装依赖、构建和启动核心命令。精确结果与文件校验值以同批发布清单为准。

本次不重新转写完整音频，也不制作或验收新播客整包；测试中的合成图片、机械记录和审批只验证协议与防篡改行为，不代表真实视觉质量。可选真实整包测试默认跳过。其他操作系统、陌生物理机器与无人干预长序列生产仍未验证。npm 可能报告 Excalidraw/Radix 与 React 的既有 peer 警告。

上一正式版本：[v0.3.0](https://github.com/cassiezhangyu/podcast-knowledge-visual-pack/releases/tag/v0.3.0)。本次完整 Commit 与比较链接在冻结候选后附于发布计划；历史条目保留在 RELEASE_NOTES.md。

---

# 0.3.0 · 小版本迭代（灵活生产范围）

在 0.2.1-beta.1 基础上新增，旧版逻辑保留在标签 `v0.2.1-beta.1`。

- 新增 `production_scope`：可只做封面、只做总览、只做深度解读、只做指定主题，或任意组合；不指定时默认整包。editorial_plan / coverage_matrix 增加 `deferred_out_of_scope`，不再强制至少一个 Deep Dive。
- 读者可见文字检查：制作过程信息（本轮范围、暂缓、未出页等）不再出现在成图和整包内容地图中；新增 `scripts/check_reader_facing_text.py` 及测试。
- 线条按元素角色校准：文字框用轻细线，插图与关系箭头保留明显手绘线，参照 EP88 P13 正例定值；新增 curve 角色，弧线低粗糙度并平滑点位，避免抖动与双层描边。
- 原生导入与打包识别生产范围，交付文件按页面身份命名。
- 收窄范围时允许单页 manifest。
- 审核包携带 `manifest_page_id`，收尾按其匹配页面，修复页面编号不一致导致的导入失败。

## 0.2.1-beta.1 · 公开测试版

- 合并通用内容组装、总览续页映射与当前视觉质量逻辑；冻结导入支持续页次序。
- 保留已验收原生图的实际单页审核、人工选择与四工件；编辑和整包横审另行绑定。
- 默认导入测试使用自包含夹具、篡改反例及续页错序检查，不再依赖私人工作区；真实整包验证为显式可选。
- 安装入口与工具依赖分开；入口不复制 node_modules、dist 或生产工作区。
- 历史开发复盘退出公共运行时依赖；总览基准按原字节迁移到 examples。压缩入口重复说明，保留默认三案、来源边界、真实图、隔离 TARGET 和人工验收。
- 经用户确认，将8组历史参考及EP59《我们都活在指数里》的转写、17页交付和编辑源列为公开正向/负向参考；案例与转写不适用MIT。公开副本清理本机绝对路径，原始音频未包含。

开发源验证：113项 Node 测试通过，真实整包选项默认跳过；64项 Python 测试通过。候选独立 npm ci 完成。候选自身构建、测试、真实三视图与安装检查以最终发布报告为准。

本轮没有重新制作图片，不把旧图质量归因于代码整理。EP59最新17页整包已获用户确认，114个交付文件与整包门禁通过。当前公开候选包含330个文件；已发布至 `cassiezhangyu/podcast-knowledge-visual-pack`。

限制：当前验证针对本机 macOS Apple Silicon 和既有模型协作。陌生物理机器、其他系统、其他模型和长序列无人监督审美稳定性尚未验证。案例与色卡有分别的许可范围；案例公开展示确认不使其适用MIT，也不授予仓库外复制、改编、再分发或商标使用权。GitHub 发布状态与验证范围分别记录，不以成功推送代替质量验收。

## 2026-10-07 · 创作逻辑更新

- 全套页面统一在右上角放置官方专辑封面；新增声明、位置尺寸与同包资产一致性校验，兼容旧规格。
- 页面标题默认具体陈述，保留必要问句和原节目标题；内部问题不直接套作展示标题。
- 伴读文案围绕具体主线自然分享，避免模块流水账和虚构个人体验；单页总览也配套文案，并核对实际交付范围。
- 开发源提交：`bf4048b532a4cd26f1b815addbebdf5f043afa82`。构建通过，114 项 Node 测试通过、1 项可选测试跳过。此次同步不代表新增节目端到端或陌生机器验证通过。
