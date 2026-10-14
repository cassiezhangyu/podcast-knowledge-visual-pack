# Changelog

## 0.6.3 — 2026-10-14（本地，未推送）

- **去重**：`rules/phase_details.md` 从 21.9 KB 减到约 9.9 KB，只保留其它规则里没有的补充细节（恢复入口、单集解析与三层 transcript、内容梳理补充、模块关系类型、图片规划产物与哈希失效、信息预算、选色细节、预检细节、构建与导出命令、整包冻结与额外检查、审美反馈记录）。
- 删除的段落及其唯一来源：DIRECT／SEGMENTED 与 Transcript Gate → `audio_pipeline.md`；内容单元字段、拆分五问、总图/操作/检验层级、transcript-window → `content_pipeline.md`；100% 去向不代替语义审核 → `design_gates.md`；页面存在性审查 → `page_content_planning.md`；总览“导航名称不能代替解释”“平行问题线” → `overview_page_production.md`；必读文件列表 → SKILL.md 阶段索引；三案、整包连续、样稿、限质例外、七层语义、改字重渲、bundle-check → `visual_pack_execution.md`；新页面创作链 → `visual_reasoning.md`／`visual_creation_context.md`；线条与字号细则 → `handdrawn_strokes.md`／`typography_hierarchy.md`；中文字形以真实 PNG 为准 → `cjk_glyphs.md`；质量门禁（R8/R9/R10）→ `visual_quality_bar.md` 与 SOP C；文案流程 → `public_copy_production.md`；内容审批命令与 18 张上限 → `main_workflow_sop.md`／SKILL.md §1。

## 0.6.2 — 2026-10-14（本地，未推送；备份标签 v0.6.1-local）

按《v0.6.2 修改方案（易读版）》16 项执行（Cassie 批准）：
- **总流程只留一份**：`rules/main_workflow_sop.md` 成为唯一总流程，写全 7 个用户确认点（内容梳理、内容拆分、图片规划含范围、选色、主图构思、每版成图、交付）、主动汇报时刻、SOP C 必跑检查完整清单。三案始终要做（含只做总览）；只有隔离独立审核可在写明原因后记为 `independent_review_waived`（不写成 TARGET，`npm run package` 正式门禁不变）。SKILL.md 改为入口＋输入／范围＋输出＋硬性停止＋阶段索引；Phase 0–10 原文原样移到 `rules/phase_details.md`（哈希审批命令、18 张上限等细节均保留）。
- **R21 陌生读者理解检查**（visual_quality_bar、SOP B 线框粗查、SOP C 第 9 步、content_pipeline A5 标出需背景概念）；每版诊断 `05-qa/COLD_READ_<页>-V<n>.md`。
- **颜色只留 R4b 一处**；R4 改为指针；taste.md、design_tokens（palette_duties.source_of_truth、去掉历史注释、导航框改灰或不加框）、inner_page_module_contract、page_visual／deep_dive／cover 指向 R4b；RELEASE_NOTES 0.4.0 导航条目加“已推翻”注。
- **规则写明“只改本地，用户要求才推送”**（SKILL.md 开发说明）。
- **交付目录统一 `06-delivery/`**，`src/delivery-dir.ts` 兼容旧 `delivery/`（package、public-copy、workflow:status、public-copy:bundle-check）。
- **过时引用**：R1–R13/R14/R15 → R1–R21；R18 写明锚点选法。
- **历史说明移出规则正文**：版本号／日期标签删除；抖线与简体字形的排查经过移到 `docs/HISTORY_NOTES.md`。
- **重复合并**：交付前检查清单只在 SOP C 第 7 步；正例用法只在 R20；导航只在 R5；颜色只在 R4b；overview §0 只写总览特有部分。
- **检查留痕**：每版 `05-qa/CHECK_<页>-V<n>.md`（看了哪些图、发现、脚本结果、R21 结论）。
- **layout_budget `--scene`**：渲染前直接从草稿 scene 估算文字块高度、上下间距与页脚余量。
- **文案两档**：完整档／轻量档（单页总览），财经类固定免责声明。
- **audit_overlap_margins 新增**：左右边距对称（≤6px）、顶部留白（≥40px）、页眉线到正文间距（≥12px）。
- **新增测试**：`tests/test_v062_audit_scripts.py`（layout_budget、audit_stroke_shapes、audit_cjk_glyphs 含反向对照、audit_overlap_margins）、`tests/delivery-dir.test.ts`。
- **Mac 实测**：`render-mianji-overview-local.mjs` 在 MacBook（Chrome）上渲染 E177 A-V35，中文为简体字形、标点位置正确。
- **其他**：新增 `rules/README.md` 导读；`scripts/sync_mirror.py`（`npm run mirror:sync`／`mirror:check`）；`construct`、`accepted-artwork:import` 改为完整 `npm run build`；写明只用 npm 命令运行、不直接跑 dist；删除 `_render_any_tmp.mjs`。

## 0.6.1 — 2026-10-14（本地，未推送／未提交）

- **简体字形规则与门禁**：新增 `rules/cjk_glyphs.md`（规则 + 根因）；SKILL.md、SOP C7、handdrawn_strokes QA 列表、typography_hierarchy 引用。新增 `scripts/lib/zh_browser.mjs` 统一启动器，`render_scene.mjs`、`render-mianji-*-local.mjs`（9 个）、`render-runtime-preflight.mjs`、`src/render.ts`（→ dist/render.js）全部改用 SC fontconfig + zh-CN + `lang="zh-Hans"`。新增 `scripts/audit_cjk_glyphs.mjs`（逐字对比 SC/JP 参照 + CDP 平台字体，exit 1 即失败；含反向对照开关）。
- **简体字形修复**（`scripts/render_scene.mjs` + 新增 `scripts/fontconfig/pkvp-fonts.conf`）：Excalidraw 的 Helvetica（fontFamily 2）只带 Segoe UI Emoji 回退，中文交给系统 fontconfig，而 box 上 Helvetica/sans-serif 的 CJK 回退解析为 Noto Sans CJK JP，导致“门”等字为日文字形、标点居中。渲染器现在给 Chromium 指定偏好 Noto Sans CJK SC 的 fontconfig、`--lang=zh-CN`、`locale zh-CN`、`<html lang="zh-Hans">`。来源：ETF E177 A-V34 反馈。

## 0.6.0 — 2026-10-14（本地，未推送／未提交）

- 新增 `rules/main_workflow_sop.md`（SKILL.md 首先引用）：SOP A 内容梳理确认／B 主图构思确认／C 画图，各以用户确认结束；里程碑与阻塞主动汇报；画完补 preflight = REJECT；两轮牵连修补不成立即重构。
- 新增 `scripts/layout_budget.py`：首次渲染前的布局预算（必需步骤）。
- stroke token：新增 `stroke.path_limits`（≤6 点；>220px 路径、>60px 椭圆 roughness ≤1.0）；relation 2.0→1.4、emphasis 1.6→1.4；`audit_stroke_shapes.py` 读 token。
- 颜色重量规则：来自有含义的实心信号块；删除主色墨迹占比指标（跨色板不可比），改为并排目测＋实心信号块检查。
- 只做总览时整包内容地图可与提纲合并或放底部收尾，按版面并写理由。
- 新增 `rules/transcription_guide.md`（Mac launchd/TCC、detached 进程、caffeinate 前台；box faster-whisper 需用户同意）。
- 新增正例 `examples/positive/mianji-etf-overview-user-approved-2026-10-13/`（A-V32）。
- 新增 `scripts/render_scene.mjs`；`audit_overlap_margins.py` 不再依赖 `_render_any_tmp.mjs`。

## 0.5.1 — 2026-10-13（本地，未推送）

- **抖线根因规则**（rules/handdrawn_strokes.md §v0.5.1）：曲线／椭圆／圆环弧／长箭头用 `curve`；路径 ≤6 点；大椭圆 roughness ≤1.0；不用加粗角色制造焦点。来源：ETF E177 总览 A-V7 反馈。
- **新增标准 QA 脚本**：`scripts/audit_stroke_shapes.py`（路径形状审计）与 `scripts/audit_overlap_margins.py`（分层渲染的像素级文字碰撞＋页边＋页脚间距审计），两者 exit 0 才可送审；SKILL.md 送审清单同步。

## 0.5.0 — 2026-10-13（本地，未推送）

- **生产顺序**（overview_page_production §0；SKILL.md、visual_quality_bar 引用）：先写解释底账（能画成机制的内容＋视觉中心），审稿顺序固定为 解释力 → 构图层次 → 颜色／线条／细节；R1–R15 是护栏不是方法。
- **新增 R16–R20**：R16 视觉中心＝一张大的连通机制图；R17 每模块至少一个承载意义的图；R18 交付前与质量锚点并排，更弱就迭代；R19 连续两轮补丁引出新连锁问题即从空白画布重构；R20 保留 v0.4.4 正例用判断规则。
- **颜色职责修正**（R4、R4b、taste、design_tokens palette_duties／text_levels）：模块标题与编号回到主色；正文／图内标签墨色；非焦点轮廓中性深灰；主标题墨色或主色按判断。取消“标题必须墨色”。主色占比改为软参考 ≤约 20%（`primary_ink_share_reference`），蓝色铺满每一层仍 REJECT。“太素”与“满页蓝”合并为一条：底色与对比一起决定。
- **检查只是下限**：check_strokes／check_typography／独立审稿 TARGET 不查文字碰撞和制作过程标签，必须亲眼并排看 PNG。
- **导航一致性**：inner_page_module_contract 第 4 条从“辅色浅阶底”改为主色浅阶底并重申位置尺寸可变，与 R5 v0.4.4 一致；第 17 条去掉“须用户授权才可换位”，design_tokens nav_panel.position 去掉“整宽、紧贴结论”。
- **正例**：新增 `mianji-discipline-overview-user-approved-2026-10-13`（A-V16b PNG＋excalidraw＋ANCHORS 写理由，非模板）；新增 `ep40-overview-quality-anchor`（PNG＋excalidraw＋ANCHORS 写理由）。

## 0.4.5 — 2026-10-13（本地，未推送）

- **R4b 颜色职责（Cassie：“满页都是蓝”）**：正文／机制标签／模块标题默认墨色，层级靠字重字号；非焦点轮廓与分隔线中性深灰；主色仅主命题、主链箭头、编号数字、单一焦点信号；主色约 ≤10–15% 墨迹，辅色 ≤8% 仅风险标记。design_tokens palette_duties 同步。

## 0.4.4 — 2026-10-13（本地，未推送）

- **R5 导航改为任务固定、形式自由（Cassie）**：导航须完成内容地图／本页提纲／关系说明＋怎么读；位置、形状、尺寸按本期版式需要（窄条、横带、角块、面板），不得挤占视觉中心。同步 inner_page_module_contract、overview_page_production、taste、mianji ANCHORS。
- **正例使用规则（Cassie）**：提炼判断、重新推导形式；照搬版式／位置／模块形态 = REJECT；QA 用理由而非“正例这么做”解释借鉴。新增 examples/README.md，taste.md 补条。

## 0.4.3 — 2026-10-13（本地，未推送）

- **R7 补强（Cassie）**：成品禁止「金句」等编辑／制作术语作标签或小节标题；命题句可保留，提纲用读者语言。

## 0.4.2 — 2026-10-13（本地，未推送）

- **R15 禁止 Box Everything（Cassie）**：等权大方框／文字装盒升为硬底线；边框仅语义用途；排版分组改用留白、层级、位置、浅底、分隔线或开放主轴。同步 `rules/visual_quality_bar.md`、`taste.md`、`SKILL.md`。

## 0.4.1 — 2026-10-13（本地，未推送）

- **R4／R5 纠偏（Cassie）**：主色主导；辅色仅极小强调，有色像素占比 ≤约 8%（废止 15–30%）；导航区改为**主色浅阶底＋主色细框**，禁止辅色／accent_surface 大底。
- **密度硬规则**：禁空带（连续 ≥80px 无信息纯白水平带即失败）；中心对象与模块须填满正文区，密度对标 EP88 正例。
- 同步：`rules/visual_quality_bar.md`、`taste.md`、`design_tokens.json`（palette_duties／nav_panel／density）。

## 0.4.0 — 2026-10-13（本地，未推送）

详见 RELEASE_NOTES.md。EP88 复盘：`/workspace/podcast/6ab11c95/05-qa/RETRO_EP88_SKILL_AUDIT.md`。

## 0.3.0 — tag v0.3.0 (17f291b)
