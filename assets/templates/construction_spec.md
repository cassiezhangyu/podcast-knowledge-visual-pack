# Construction Spec 编写清单

输出位置：`02-visual-plan/construction_spec.json`。格式以 `schemas/construction_spec.schema.json` 为准。

## 每页必须确认

- `page_id`、`page_kind`、`display_order` 与已通过的 Editorial Plan 完全一致。
- 内页 `selected_candidate_id` 与 Selected Visual Plan 一致；封面为 `null`。
- Composition Intent 说明当前内容如何决定重心、尺度、节奏、方向和不对称平衡。
- 每个图元使用页面内唯一 ID；线和箭头提供真实 `points`。
- 每项 Visual Semantic Mapping 至少落到一个非文字图元，并保留相同 `mapping_index`、`source_ids` 和 `assertion`。
- 内页至少有一个承担主要解释结构的 `hero_root`。
- 中文文字明确填写宽高和换行；不得期待构建器自动压缩字号。
- 页面只使用当前 palette 和原生 Excalidraw 图元。
- 如需保留播客官方专辑图标，只能在封面页声明 `brand_asset`：填写工作区相对路径、原文件 SHA-256、位置和尺寸。构建器会校验哈希与画布边界，渲染器按原始宽高比合成；其余页面不得声明位图资产。

构建器只验证和落盘，不会替创作者补充内容、选择对象或重新设计构图。
