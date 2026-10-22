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
