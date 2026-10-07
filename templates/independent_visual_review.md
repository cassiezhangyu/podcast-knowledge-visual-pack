# 隔离视觉审核记录

正式 JSON 遵循 `schemas/independent_visual_review.schema.json`。

- 审核者只读取隔离输入包所列的当前 scene、原尺寸 PNG、390px PNG、内容合同、正反案例和审美规范；自行打开真实文件。
- 审核者不读取创作者自评或返工理由。
- 报告写入独立审核任务的 `reviewer_context_id`；不得与输入包的 `creator_context_id` 相同。
- 每页记录当前 PNG SHA-256、审核输入包文件 SHA-256（`review_packet_sha256`）、`TARGET`／`REJECT-A`／`REJECT-B` 和可定位发现。
- 若存在拒绝，只能用 `visual:closeout --action submit --packet <输入包>` 记录失败；不得用 `--action approve`。
