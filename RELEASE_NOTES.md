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
