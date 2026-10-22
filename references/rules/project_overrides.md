# 项目覆盖（v0.4.5-local）

单集需要偏离 skill 默认（字号、颜色职责、版式参数等）时：

1. **固定位置**：覆盖文件放 `<单集>/02-visual-plan/`（如 `design_tokens.override.json`），并在 `02-visual-plan/project_overrides.json` 登记：`id`、`what`（改了什么）、`file`、`sha256`、`why`（为什么默认不行）、`user_authorization`（用户原话或确认位置）、`date`。
2. **强制**：`render:scene:checked` 使用的 tokens 若与 skill 默认不同且未登记，拒绝导出（`scripts/check_project_overrides.py --workspace <单集> --tokens <参数>`）。文件改动后须重新登记哈希。
3. **升级提示**：`npm run overrides:scan -- <所有单集的父目录>` 列出同一 `id` 在 ≥2 集出现的覆盖，作为“建议改成 skill 默认值”向用户提出；用户同意后改 skill 并发版，不在单集里长期复制。
4. 改了覆盖或页面合同后，用 `npm run preflight:bump -- --from <旧预检> --out <新预检> --note "<改了什么、为什么>"` 生成新版预检（自动重算哈希、继承参考观察、记录前一版），不要手工复制改哈希。


## 手机优先字号档（评估项）

默认字号档仍为 48/32/26/24/22，不因手机预览偏小而自动改默认。仅当用户明确要求手机优先时，可评估一档 52/36/30/28/26：须在本集 `project_overrides.json` 登记，写入覆盖 tokens，并重跑版面预算与受影响页预检／渲染。未登记不得启用。
