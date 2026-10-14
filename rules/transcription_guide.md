# 转写指南

## Mac 本地（首选：mlx whisper-large-v3-turbo）

- **launchd 不可靠**：launchd 任务读不到 `~/Documents` 下的 venv（TCC 隐私权限拦截）。
- **脱离终端的后台启动不可靠**：nohup／detached 启动会随调用它的 shell 一起被杀掉。
- **可靠做法**：前台阻塞运行，并用 `caffeinate` 防止休眠，例如
  `caffeinate -i <venv>/bin/python transcribe.py <audio>`，等它结束再继续。
- 片头 0–30s、长静音、音乐段易出幻觉：用同一模型对该片段重跑复核（SOP A 第 1 步）。

## Box 上的 faster-whisper 回退

只有在用户明确同意后才可使用（音频会上传到 box，模型与质量也不同）。先说明原因和差异，再等确认。
