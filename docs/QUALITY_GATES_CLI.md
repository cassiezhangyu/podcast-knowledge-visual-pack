# Quality Gates 命令细节


严格执行 `rules/design_gates.md`：Transcript → Content → Editorial → Visual → Package。
**每一页从规划开始都以 `TARGET` 为目标。** `TARGET` 的可见标准以当前 `taste.md`、相关已通过正例和反例及逐页协议为准；初版之前就核对整页问题、决定性关系、具体对象或文字结构、标题层级、手机阅读和来源边界，尽量通过充分规划在初版或一至两轮实质修改内达到标准。`REJECT-A`／`REJECT-B` 是失败诊断与返工路由，不是创作目标或常规出图、交付标准；机械检查通过、相对上一版改善、达到返工上限都不能把它们升级为 `TARGET`。
`TARGET` 仍是正式视觉通过标准；`REJECT-A` 不得作为限质输出。返工上限只规定停止重复制作；用户另行明确授权限质展示时，若初版后两轮实质修改仍未达到 `TARGET`，可展示其中内容与来源边界正确、经独立审核为 `REJECT-B` 的最佳版本，并明确标为限质输出、说明未达标原因及当前哈希。它不自动进入正式发布门禁，也不改写独立审核结论。
三案选择是**并列构图探索**，不是同一失败结构反复重画。新主结构先执行 visual_reasoning 的独立原型充分性检查；三案并排视觉策略审核在三案形成后、展示或批量放行前执行；报告须绑定当前输入和真实工件，不能仅凭作者观察或文件存在放行。三案展示用 --stage selection 验证至少一案完整 TARGET；单张 B 的保存资格不赋予全 B 三案展示资格。用户明确选定后可按授权继续。无人逐页选图的批量模式执行visual_pack_execution第1节质量关卡：本页所需完整候选均TARGET且策略差异成立后才扩产；用户指定限质范围另记例外。原型、整页报告使用scripts/check_visual_progression.py验证记录一致性，机械校验不承担视觉判级。
返工必须回到导致失败的上游阶段；禁止只靠换颜色、字号、间距修复结构性失败。

每张页面按以下顺序执行，不能因上一页通过而跳步：
1. 每次出图前，包括三案中的每一案和每个返工版本，先核对已通过的完整内容梳理、拆分、页面规划和本页内容包，实际重新打开正例、反例及同系列已通过页，读取当前 `taste.md` 和 `design_tokens.json`，保存本版 `REFERENCE_PREFLIGHT_Vn.json`；旧版预检不得代签。本版 scene 必须晚于本版预检创建。真实 PNG 后逐条对照规范与可见像素。遮字仅用于诊断图中对象与线索；最终看图文结合后是否比纯文字更清楚、生动地说明本页问题。若图只是通用图标或空框、未增加理解，或文字主导页缺少清楚的主次、关系和证据，即使机械检查通过也如实记为 REJECT-B；三案模式按 `rules/visual_pack_execution.md` 的候选审查与选择步骤处理，不强迫同案无限返工。
2. 正式审核路径：创作者自检合格后运行 `npm run visual:review:prepare -- --page-id <id> --role <cover|overview|deep_dive> --creator-context-id <创作任务ID> --scene <scene> --png <原图> --phone <390px图> --content <Page Content Pack> --positive <正例> --negative <反例> --taste taste.md --design-tokens design_tokens.json --preflight <构图前的REFERENCE_PREFLIGHT.json> --page-check <当前RENDERED_PAGE_CHECK.json> --design-gates rules/design_gates.md --review-protocol rules/independent_visual_review.md --output <审核输入包.json>`。按需重复 `--positive`、`--negative`。命令必须拒绝缺失、过时或事后补签的预检，也拒绝当前图形解释、内容、几何或手机可读性自检失败；输入包只携带预检与自检哈希，不向审核者披露创作者方案、自评或相对改进记录。
满足授权限质条件但未通过视觉解释自检的候选，另按 `rules/visual_pack_execution.md` 第 5 节建立限质独立审核输入；不伪造五项 pass，也不调用正式 prepare / closeout。
3. 将该输入包交给**隔离执行上下文中的只读审核者**，由审核者自行打开图片与规范，按正例最低交付线输出可见证据和 `TARGET`/`REJECT-A`/`REJECT-B`，并在报告中写入自己的 `reviewer_context_id`。创作者不得兼任审核；closeout 会检查审核者与创作者 ID 不同。无隔离审核能力时保持 `independent_review_required`。
4. 审核报告每页必须写入当前审核输入包的 `review_packet_sha256`。审核拒绝时按最早失败层返工并用新 PNG 重新送审，但应遵守用户授权的返工次数上限。审核 `TARGET` 后先以 `npm run visual:closeout -- --workspace <workspace> --review <独立审核.json> --packet <本页审核输入包.json> --action submit` 登记；多页重复 `--packet`。命令会复核报告、审核包、当前 scene/PNG 与参考输入的哈希，状态仍为 `needs_human_review`；向用户展示当前图片。只有用户明确通过**当前哈希的页面**，才用同一报告和审核包加 `--action approve --user-approved` 记录人工批准。限质 `REJECT-B` 只按页面协议记录与展示，不伪造 `TARGET` 报告或调用要求 `TARGET` 的 closeout。

机器检查、真实渲染、自检、相对进步、独立审核 `TARGET` 或上一张页面通过，均不能替代用户对当前页的确认。审核的细节与拒绝标准以 `rules/independent_visual_review.md` 为准。

全部当前 PNG 获完整隔离审核 `TARGET` 且用户明确通过这些当前版本（逐页或明确验收当前整包）后，运行带 `--action approve --user-approved` 的 closeout。审核文件必须绑定当前 `render_manifest.json`、每页审核包和 PNG 哈希；任何页面变化都会使该门禁失效。

