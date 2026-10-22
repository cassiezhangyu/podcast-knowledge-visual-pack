# v0.4.7-local 规则补充（来自 6ab11c95 复盘，Cassie 2026-10-22 批准全部 P0/P1/P2）

## P0
1. **@2x 看图（确认沿用 v0.4.6）**：发给用户看、送审、交付一律用同 scene 重渲的 `P01@2x.png`（2400×3200）；1x 只作内部检查。
2. **死白审计必做**：`python3 scripts/audit_dead_space.py <P01@2x.png> --out DEAD_SPACE_AUDIT.json`（`render:scene:checked` 对非封面页自动写出）。规则：在 1200×1600 坐标的正文区（默认 x80–1120、y330–1470；标题/结论块与页脚在区外，标题/结论行尾的参差空白不算）找无墨矩形；纸色与浅色底纹（如 #EDF2F7）算空；**面积 ≥45000px² 且两边都 ≥90px** 判死白。作者自检 `checks.dead_whitespace_audit.record` 须绑定当前图的通过记录，否则 `visual:closeout` 拒绝。补死白用延长图、重分配内容或调栏高，不用放大字号。
3. **箭头逐条记录**：自检 `checks.arrow_audit.arrows[]` 每条写 `start`、`via`（经过什么、碰不碰别的物件）、`end`、`reads_as`（陌生人会读成什么）、`misread:false`。场景里有箭头就不能标 not_applicable；条数少于场景箭头数即拒绝。例：B 版回环箭头若“经过考试抽屉”，reads_as 会是“长成的植物变成考试笔记”——这就是误读，须改路线。

## P1
4. **每轮并排差异**：改版自检写 `revision_of`，并用 `python3 scripts/round_diff.py --previous 上一版@2x --current 本版@2x --side-by-side 并排.png --out ROUND_DIFF.json --claims-changed --diff "改了什么" ...`。改动清单为空或两版像素差 <0.1% 即 fail，closeout 拒绝——防止“说改了其实没改”。并排图连同改动清单一起给用户看。
5. **规则冲突先后**：“例子紧挨所属步骤”优先于“每栏行数上限/版面对齐”等排版规则；遇到冲突先停下问用户，不自行取舍（例：A 版睡眠例子被剖面图隔开时，应先问而不是牺牲相邻）。
6. **按内容定字号角色**：图内承载内容的文字（例子、步骤说明、结论）不低于 24px，不论放在哪里；22px 只给页眉页脚、导航、出处、指示短标签。`check_typography.py` 对 `customData.content_bearing=true` 且 <24px 直接判错；其余 <24px 且未在 `customData.text_function` 声明 navigation/chrome/source/pointer/meta 的文字列入 `small_text_needs_author_ruling`，作者须在自检 `checks.content_text_min_size` 逐条判定（`--strict-content-size` 可直接判错）。例：B 版“第1周 观察”周标签是正文内容，不该是 22px。
7. **批准后勘误通道**：错别字/原词修正（如 ASR 误词“狐狸训练”→“壶铃训练”）用户确认后运行 `npm run erratum:apply -- --workspace <ws> --kind original_word --replace '旧=>新' --confirmed-by <用户> --confirmed-at <ISO时间>`。只改 01-understanding 内 JSON 字符串值与 Markdown 正文（不改键/ID/哈希/路径字段），再把下游批准、门禁、预检、机械记录里的旧哈希换成新哈希直到稳定，写 `01-understanding/errata.json`。单条 ≤24 字；改意思必须重新审批。
8. **草图路线批准＝正式批准；一页可登记多个交付版本**：`npm run visual:register-versions -- --workspace <ws> --versions versions.json --approved-by <用户> --approved-at <日期> --approval-source sketch_route_selection --route-approval <用户选择记录> --user-approved`。`versions.json` 列 `{page_id, versions:[{version_id, scene, png, review_png, self_check}]}`。命令不要求 construct 的 render_manifest，现场重跑 @2x 尺寸、死白审计、字号/孤行检查与箭头记录核对；全部通过才写 `04-rendered/<页>/delivery_versions.json` 与 `delivery_versions_human_approval.json`（键 `OV01:A-V11`，值为 @2x 的 sha256）；任一不过则状态 blocked、不写批准。打包（package）读取多版本尚未接入，打包前另行处理。

## P2
9. **手机优先字号档（只评估，不改默认）**：默认仍为 48/32/26/24/22。390px 手机上 24px 正文约 7.8px，偏小；若用户要求手机优先，可评估一档 52/36/30/28/26（须登记项目覆盖 `project_overrides.md`，并重跑版面预算）。默认不启用。
10. **已有转写缓存不再要求 --provider-python**：`00-source/grounded_transcript.json` 与 `grounded_transcript_qa.json` 都在且 QA 不是 fail 时，`intake --until transcript` 直接复用缓存。
11. **手写提纲区域格式**：见 `templates/outline_regions.manual.example.json`——必须含 `manual_reason`（≥8 字，为什么不能自动推导）、`overlay_screenshot`（相对区域文件的叠框截图，文件须存在）、非空 `outline_regions` 与 `body_regions`（每项 `{x,y,width,height}`，正文区与提纲区不得交叉）。
12. **孤行自动检查**：多行文字末行只剩 1–2 个字（不计标点）、且上一行 ≥6 字即判孤行（`check_typography.py`）；改法：删字或手动换行。例：“只写触动你的一到三个\n点。”。确属刻意短行可设 `customData.allow_widow=true`。
