# Audio & Transcript Pipeline

## Acquisition
- Resolve episode metadata and audio source; cache by episode id + audio hash.
- Record source URL, retrieval time, duration, format and hash.
- Do not proceed from a partial preview as if it were the full episode.

## Preflight
- Validate duration, decodability, channels and obvious corruption.
- Normalize only when required by ASR; keep original manifest.

## ASR execution strategy
- For the validated local MLX provider in a stable environment, transcribe the complete audio with `DIRECT`. Long duration alone is not a reason to pre-split the audio.
- Use `SEGMENTED` only when the user explicitly selects it, the execution environment is bounded, or segment-level resume is genuinely required. Segmentation is a recovery capability, not the default production route.
- An explicit `DIRECT` selection always wins. If DIRECT fails or is interrupted, stop and report the failure; never silently switch to SEGMENTED or another provider.
- When SEGMENTED is justified, use overlap, preserve global timestamp offsets, and deduplicate boundary repeats without losing words.
- Provider-returned sentence or word spans are transcript timestamps. Do not treat them as evidence that the source audio was pre-split.

## ASR
- Prefer sentence/word timestamps.
- Use diarization when multiple speakers materially affect attribution.
- Keep uncertainty; never guess speaker identity.

## Refinement
Raw → Clean → Grounded.
- Raw: evidence, minimal intervention.
- Clean: punctuation, sentence boundaries, mild filler removal.
- Grounded: evidence-backed corrections for names, products, numbers, speakers.

## High-risk tokens
Names, organizations, products, English terms, numbers, dates, percentages, quoted phrases. Cross-check with Show Notes and nearby context.

## Transcript Gate
Pass only when:
- coverage roughly matches episode duration;
- no unexplained large gaps;
- important claims have timestamp anchors;
- high-risk tokens are reviewed when used in final pages;
- uncertain speaker attribution is marked.


## QA、导出与进度

1. 保留 `transcript_qa.json` 对 Raw 的原始诊断。纠正后生成 `grounded_transcript_qa.json`，绑定 Raw、Clean、Grounded、Corrections、音频清单、预检、节目元数据以及纠正证据的当前哈希。普通异常纠正须已应用、音频证据覆盖该段且生产文本不再异常，才能标为 resolved。用户明确确认原文确有重复时，使用已应用的 `verbatim_confirmed` 记录：原文与确认文本完全相同，`user_verbatim_excerpt` 证据来自 `user_attachment`，原段 ID、工作区内证据文件的 SHA-256 与完整原文均匹配。此分支保留原文，并在异常与证据指纹中注明 `verbatim_confirmed`；确认只覆盖对应原段。其余重复仍须按普通纠正处理，applied 标签本身不能证明纠正有效。
2. Grounded QA 检查生产文本、时间戳、原段映射、纠正记账与证据完整性。其 pass 是技术校验结果；高风险词、说话人、数字和可疑尾段仍按内容审阅逐项核实，未核实者保留不确定性。完整音频人工听证只有实际完成才能报告完成。
3. 内容梳理和内容拆分的 check / approve 都先复算 Grounded QA。缺失、失败、哈希变化或证据失效均阻断；失败时隔离旧内容门禁并保存错误记录，历史审批文件不代表当前门禁有效。
4. JSON 使用 JSON 序列化；`.md` 直接写 UTF-8 文本并保留真实换行。缓存命中仍重建派生 Markdown 和 QA，不重新执行 ASR，不修改 Raw 或 provider 回执。旧工作区缺新 QA 时先走缓存重建，再重新执行内容 check；不会自动批准内容。
5. DIRECT 运行依次报告 starting、decoding、transcribing、saving、completed / failed；每 10 秒写入心跳并输出 stderr 日志，包含阶段、耗时、更新时间和 PID。completed 表示 provider 回执已经写入；之后另行报告 checking / QA 结果。
6. 心跳只表示进程存活。provider 未暴露完成量时，百分比和已处理音频长度为 null。`workflow:status` 展示最近观察及观察年龄；非终态超过 30 秒无更新标为 stale_needs_verification，核实进程后再判断中断，不能自动重启或改换策略。对用户用中文说明当前阶段、累计耗时及下一步；心跳不替代工作进展解释。
