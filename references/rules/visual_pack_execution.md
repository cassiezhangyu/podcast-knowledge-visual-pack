# 单页制作与整包交付

## 1. 授权与执行方式

主会话按批准内容完成构思、绘制、真实渲染、作者自检和输出，不调用审核代理，不要求独立报告或TARGET。保留内容梳理、内容拆分和页面规划的用户确认。

默认同页三案、逐页选择；各案保留同一批准含义及必要限定，构图差异按visual_reasoning验证。用户指定单案时只做一案；指定连续完成整包时逐页自检后一次输出，不追加中途确认。批量授权不自动成为用户验收。要求先做样稿时，通过前不扩展到整包。

## 2. 页面职责与预检

按page_content_planning核对每页问题、主判断、论证、案例、边界及相邻页新增理解。Overview体现全文框架，Deep Dive展开独立问题；不靠缩字、删核心或放大空图凑页。页数上限和范围合同按SKILL执行。

每版创建或修改scene前，按page_visual_production第2节保存当前联合预检。实际查看正反参考，绑定当前内容、参数、配色、taste、页面合同和用户要求；参考观察与绘制决定须具体。

## 3. 绘制、自检和输出

1. 由来源关系确定图文分工、对象、状态、比较依据与阅读路径；用完整正常字号草图自检框架、构图和容量，再精修。
2. 默认三案分别完成真实草图，先精修完成潜力最强的一案并自检，再完成其余两案，比较含义覆盖和视觉策略差异；不把未完成草图冒称完整备选。
3. 受检导出使用render:scene:checked或render:checked，保持原生可编辑scene、官方专辑图受控合成、当前字号/笔触及原图、390px、灰度和高清输出。
4. 按page_quality_check和当前页型协议实看整页及高风险局部，完成RENDERED_PAGE_CHECK.md/json。自检覆盖内容、解释、参考、几何、手机可读；Overview逐条核批准关系，用户条件逐项核实。缺项先修复，不伪造pass或独立证据。
5. 自检和技术检查通过后，用visual:closeout --page-check登记并展示结果；不派发审核任务。用户确认当前版本后，才记录approve。

## 4. 选择、返修与停止

默认三案均完成、无来源或阅读阻断且策略差异成立时，展示真实图片和实际不足，交用户选定；PAGE_VARIANT_SELECTION记录候选路径/哈希、所选版本和用户原话。用户选定后按授权继续下一页。

返修先定位最早失败层。已有有效构图且问题可隔离时，保留非目标内容和布局，只修目标区域并重渲整页；主关系或全页组织失效才重构，不靠换色或缩字掩盖。按用户授权的轮次停止；仍有缺口时报告具体不足，不因次数已用完把未完成改成通过。用户明确接受限质输出时记录接受范围及遗留项，不伪造完整通过。

## 5. 原生编辑与已有作品恢复

真实打开scene验证文字、对象、组及适用箭头的可编辑性；无绑定箭头时记录不适用。新制作与恢复均保留实际scene、三视图及高清图。仅迁移已批准原图时保持历史接受范围，不重签原制作过程或将历史独立报告用于新稿。accepted-artwork:import保留为旧作品显式导入工具，不是新作图前置。

## 6. 整包交付

按设计合同横向检查术语、颜色职责、页型分工、地图与提纲、来源时段、标题策略和系列重复；逐句核语义后检查真实像素。正文改动后从当前scene重渲，不混用旧PNG。

按public_copy_production生成匹配实际范围的伴读文案，完成表达与忠实度检查，运行public-copy:check；集中查看包/限质包打ZIP前另运行public-copy:bundle-check。正式package核对当前文件、门禁和用户批准，包含可编辑源、原图、手机/灰度/高清图、内容与来源、作者自检及配套文案，不要求独立报告。没有用户确认的版本可输出供查看，保持needs_human_review，不写accepted或RELEASED。

## 7. 状态与历史

沿用TASK_STATE或等价唯一当前指针记录版本、输入、用户要求、实际完成步骤及待办。作者自检、技术检查和用户验收分别记账；不产生独立评级。旧工件和批准保持原版本，用户否定后退出当前依据。输入变化按受影响范围复核。恢复时先核实际工件与当前反馈，不按文件日期选择基线。


## 先锁文字，再精修图形（v0.4.5-local 门禁）

顺序固定：①确认字号层级（当前 tokens）→ ②完成终稿文字并通过本页陌生读者必查清单与逐句白话复述 → ③才开始放大／精修手绘物件和细调间距。精修期间改字须回到②重做清单。作者自检记录 `checks.text_and_scale_lock`（`status`+`visible_evidence`：写明字号与文字在哪一版锁定、之后只动图形），缺失则 `visual:closeout` 拒绝。原因：6ad48f83 文字理解问题拖到第6版才修，每次改字都要重排已精修的画面。


## 规则冲突先后

“例子紧挨所属步骤”优先于“每栏行数上限／版面对齐”等排版规则。遇到冲突先停下问用户，不自行取舍（例：睡眠例子被剖面图隔开时，应先问而不是牺牲相邻）。

## 每轮并排差异

改版自检写 `revision_of`，并用 `python3 scripts/round_diff.py --previous 上一版@2x --current 本版@2x --side-by-side 并排.png --out ROUND_DIFF.json --claims-changed --diff "改了什么" ...`。改动清单为空或两版像素差 <0.1% 即 fail，`visual:closeout` 拒绝——防止“说改了其实没改”。并排图连同改动清单一起给用户看。

## 批准后勘误通道

错别字／原词修正（如 ASR 误词“狐狸训练”→“壶铃训练”）用户确认后运行：

`npm run erratum:apply -- --workspace <ws> --kind original_word --replace '旧=>新' --confirmed-by <用户> --confirmed-at <ISO时间>`

只改 `01-understanding` 内 JSON 字符串值与 Markdown 正文（不改键／ID／哈希／路径字段），再把下游批准、门禁、预检、机械记录里的旧哈希换成新哈希直到稳定，写 `01-understanding/errata.json`。单条 ≤24 字；改意思必须重新审批。

## 草图路线批准与一页多交付版本

`npm run visual:register-versions -- --workspace <ws> --versions versions.json --approved-by <用户> --approved-at <日期> --approval-source sketch_route_selection --route-approval <用户选择记录> --user-approved`

`versions.json` 列 `{page_id, versions:[{version_id, scene, png, review_png, self_check}]}`。命令不要求 construct 的 render_manifest，现场重跑 @2x 尺寸、死白审计、字号／孤行检查与箭头记录核对；全部通过才写 `04-rendered/<页>/delivery_versions.json` 与 `delivery_versions_human_approval.json`（键如 `OV01:A-V11`，值为 @2x 的 sha256）；任一不过则状态 blocked、不写批准。打包（package）读取多版本尚未接入，打包前另行处理。

## 只改字路线（箭头记录可沿用）

只改文字、不动线条箭头时，登记会算每个版本 scene 的几何指纹 `geometry_sha256`（除文字外全部元素的类型／位置／尺寸／点列／绑定）。若当前自检缺 `arrow_audit`，而上一份已登记的 `delivery_versions.json` 里有版本几何指纹相同，就自动沿用那一版自检的箭头逐条记录（写入 `arrow_audit_inherited`），不再报错。几何一变就必须重做箭头记录。逐句冷读不沿用，每版都要新做。
