# 视觉质量检查协议

本协议把 visual_reasoning 的核心充分、构图和完整构建准备度接入证据检查，不新增审美总分。程序只验证记录、阶段和当前绑定，不能证明设计好看或读者理解；效果是否改善由用户看成图确认。

## 执行

初次试画在render:scene:checked后加 `--trial-stage sketch`；这只生成供检查的图，不能直接交付。完整精修渲染默认final，必须提供 `--quality-readiness <pre_refinement报告>`，不通过即阻断。正式整包render在页面spec里指定quality_readiness_relative_path。

正常字级草图后、精修前、交付前分别以当前机械记录初始化报告：

```bash
npm run visual-quality:init -- --record <MECHANICAL_RENDER_RECORD.json> --phase sketch --out <新报告.json>
```

phase另可为pre_refinement、pre_delivery。先查看当前原图、390px、灰度和必要局部，再填写报告中的既有构图/准备度字段；未知或失败保持未通过。三个时点可使用同一张未变化的图，但判断职责不同，不得伪造三次绘制。精修前报告不过，不进入完整精修；交付前报告不过，不作为合格候选。最终作者记录visual_quality_trial分别绑定三份报告，交付验证会核验；移动、改大小、改变包含范围或换行后，当前图绑定变化，旧报告失效。

## 具体判断

- 参考比较逐图写reference_region、current_region、achieved、gap、decision，指认实际部位和差距；“内容不同、不照搬”只说明边界，不能代替差距。允许同一有效做法在不同参考重复，但不能复用相同判断作为逐图比较。
- key_expression先判断是否存在尚未解决的关键难点。需要时，对同一个有来源的关系画出实质不同表达，用真实图片、编码差异和读者收益选择；不需要时写明已有效表达的依据。不给不同话题各配一图冒充探索。
- dominant_object对最大/最强的知识区域做缩小或替换对照，保留同样必要事实和字级，比较失去哪些判断依据。只有体积变化而理解不变时缩小或重组。没有独立大物件的文字关系图可用not_applicable，但仍说明整页组织贡献，不强造装饰或固定图形比例。
- series_repetition_check对三案/相邻页的宏观组织、主位和证据分布作比较；首案无相邻图如实说明。三案最终齐备后重查差异，不把换图标当三种方案。
- strongest_gap必须写最强不足和修复结果；它针对阻断问题，不要求消除一切审美取舍。

## 返修

新图revision.previous为空；返修绑定上一作者记录。来源和未变文字可复用，但composition、reference_alignment、mobile_readability须按当前图重判，列入affected_checks及rechecked。报告被用户质疑后不再作为通过依据；保留其历史事实，不复制其视觉结论填当前pass。程序能拦缺项、旧图和错绑，不能拦截所有不诚实填表，作者必须实际看图。

## 验证范围与成图验收

开发回归验证缺项、错绑、旧记录和不完整首读检查会被拒绝；保留合成用例与反例观察摘要，不将单期成图纳入开发分发包。代码测试和记录校验不证明图形美观或读者理解。用户仍需查看实际成图并决定是否接受；修改后按当前哈希重新检查，不追认旧成图。

内部字段 `visual_quality_trial` 和文件名保持兼容，表示上述三个检查时点，不要求另装测试版或等待代码合并。
