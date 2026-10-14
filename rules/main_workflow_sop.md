# 主工作流 SOP（唯一的总流程）

> 本文件是本 Skill 唯一的总流程，先于其它规则读取。各步细则在其它 rules/ 文件里，本文件只写顺序、停点和必跑检查；细则与本文件冲突时，以本文件的顺序和停点为准。
> 每个确认点都要停下等用户回答；用户没确认，不进入下一步。每个需要用户拍板的决定都附推荐答案和理由。

## 用户确认点（共 7 个，生产范围不改变它们）

| # | 停在哪里 | 给用户看什么 |
|---|---|---|
| ① | 内容梳理 | 《内容梳理》：一句话本期、框架、骨架、主线／支线／彩蛋、关键问题＋推荐答案 |
| ② | 内容拆分 | 《内容拆分》：主命题、模块、模块关系、内容去向 |
| ③ | 图片内容规划 | 《图片内容规划》：页面清单、每页任务、生产范围（`production_scope`，引用用户原话） |
| ④ | 选色 | 色卡 `assets/color-library.png`，用户选 01–12 或给自定义色；复述所选编号与 HEX |
| ⑤ | 主图构思 | 用大白话讲构思：视觉中心、模块位置、导航位置，每个决定附理由 |
| ⑥ | 每版成图 | 三案（或返修版）＋陌生读者检查结论＋本版检查记录摘要 |
| ⑦ | 交付 | 交付包清单＋小红书文案全文 |

①②③ 的机器门禁：`npm run content:gate -- --workspace <ws> --stage inventory|split --action check`，用户明确通过后再 `--action approve`（审批绑定当前文件哈希；内容变了就要重新审批）。整包最多 18 张（封面＋全部总览页＋全部 Deep Dive），见 SKILL.md §1。

## 主动汇报（不等用户来问）

以下每个时刻都立即主动告诉用户：转写完成 · 内容梳理待确认 · 内容拆分待确认 · 图片规划待确认 · 选色 · 主图构思待确认 · 每一版成图（含检查结论）· 遇到阻塞 · 打包完成。阻塞要写清原因、已做的部分、需要用户决定什么。

## SOP A · 内容（确认点 ①②③）

细则：`rules/content_pipeline.md` §0（A1–A8 抓骨架）及全文。

1. **可信转写**：见 `rules/transcription_guide.md` 与 `rules/audio_pipeline.md`。片头／静音段用同一模型重跑复核幻觉；去掉音乐、广告、口播；修正误听术语与人名；列出仍不确定的地方。
2. **一句话本期**：用一句话说清本期讲了什么。
3. **框架**：先找节目自带的框架；没有就自己归纳，并明说“这是归纳的”。
4. **骨架**：按论证关系（因果／对比／条件／递进）而非时间顺序搭骨架，每层附证据（时间戳＋原话要点）。
5. **分拣**：主线／支线／彩蛋。
6. **标出“需要背景才懂”的概念**（`rules/content_pipeline.md` §0 A5）：留给 SOP B 决定用图解释还是用文字交代。
7. **只问关键问题**，每个附推荐答案 → **确认点 ①**。
8. 《内容拆分》（`rules/content_pipeline.md`）→ **确认点 ②**。
9. 《图片内容规划》（`rules/page_content_planning.md`；只做部分页面时写 `production_scope`）→ **确认点 ③**。

## SOP B · 主图构思（确认点 ④⑤）

1. 选色 → **确认点 ④**。`selected_palette.json` 必须在第一张 scene 之前存在。
2. 从论证关系出发，不从版式出发。
3. **逐模块可画机制测试**：这个模块能不能画成一个会动的机制（状态变化、流向、对比）？不能就降为读数／入口／出口。
4. **一个连通的视觉中心**（约半页）；其它模块作为读数、入口或出口挂在中心上。
5. **关系底账**：每条箭头／相邻关系写明含义，并列“读者不得推断的关系”。
6. 其它模块与导航按空间放置，写理由（导航规则见 `visual_quality_bar.md` R5；正例用法见 R20）。
7. **线框粗查**：用 R21 的四个问题快速过一遍线框，先拦住“结构读不懂”的问题。
8. 用大白话向用户讲构思（不讲术语）→ **确认点 ⑤，确认后才画**。

细则：`rules/visual_reasoning.md`、`rules/overview_page_production.md` §0。

## SOP C · 画图（确认点 ⑥）

1. **先 preflight 再画**：`REFERENCE_PREFLIGHT` 在第一笔之前写好；画完再补的 preflight = REJECT。
2. **先画中心**，再画外围模块和导航。
3. **布局预算（渲染前）**：`python3 scripts/layout_budget.py <budget.json>`，或 `--scene <scene.excalidraw>` 直接从草稿 scene 估算（见脚本说明）。不过就先删字或改构图，不缩字号。
4. **颜色**：只看 `rules/visual_quality_bar.md` R4b。
5. **线条**：`design_tokens.json → stroke.role_settings`、`stroke.path_limits`；`rules/handdrawn_strokes.md`。
6. **版面**：页眉页脚合同；四边边距一致；模块间距足够；边框只给有语义的对象（R15）。
7. **自动检查（下限，全部 exit 0 才继续）**，渲染后在当前 scene 上跑：
   - `python3 scripts/check_strokes.py <scene>`：笔触角色
   - `python3 scripts/audit_stroke_shapes.py <scene>`：抖线（路径点数、大图形 roughness）
   - `python3 scripts/audit_overlap_margins.py <scene>`：文字碰撞、四边边距、页眉页脚间距
   - `node scripts/audit_cjk_glyphs.mjs <scene>`：简体字形（`rules/cjk_glyphs.md`）
   - `python3 scripts/check_typography.py <scene>`：字号角色
   - `python3 scripts/check_reader_facing_text.py <scene>`：成图上没有制作术语
   - 有导航和提纲的内页再跑：`check_inner_page_chrome.py`（页眉页脚与导航合同）、`check_outline_body_alignment.py`（提纲与正文编号一致）
   - 有独立审核包时：`check_visual_progression.py`（审核绑定与推进依据）
8. **亲眼看（R9）**：1x＋4K 局部＋390px＋与质量锚点并排（R18），按 解释力 → 构图 → 细节 评判。
9. **陌生读者理解检查（R21）**：写本版诊断 `05-qa/COLD_READ_<页>-V<n>.md`。
10. **两轮互相牵连的修补仍不成立 → 重新构图**（R19）。
11. **本版检查记录** `05-qa/CHECK_<页>-V<n>.md`：看了哪几张图（文件名）、各自发现了什么、第 7 步各脚本结果、R21 结论、改了什么。没有这份记录，不算“看过”。
12. 发给用户 → **确认点 ⑥**。

### 三案与独立审核

- **三案始终要做**，只做总览也一样：每页三种有实质视觉策略差异的方案，完成度相同（R13），如实报告差距。规则见 `rules/visual_pack_execution.md`。
- **只有隔离的独立审核可以简化**：上下文隔离的审稿人不可用，或用户已直接选定方案时，可以不做隔离审核，但必须在本版检查记录里写明原因，状态记为 `independent_review_waived`。执行者自审不能写成独立 `TARGET`；R9、R21 和第 7 步的检查一项都不能省。

## 交付（确认点 ⑦）

1. 交付目录统一为 `06-delivery/`（旧工作区的 `delivery/` 仍可读取）。
2. 内容：4K PNG、1x PNG、通过检查的 `.excalidraw`、ZIP。
3. 小红书文案按 `rules/public_copy_production.md`：整包走完整流程；只交一张总览或手工打包走轻量档。
4. 打包后主动汇报交付清单和文案全文 → **确认点 ⑦**。
