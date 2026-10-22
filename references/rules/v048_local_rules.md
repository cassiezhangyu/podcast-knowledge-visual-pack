# v0.4.8-local 规则（仅本地）

来源：EP88 6ab11c95-v045 R7 改字轮，Cassie 批准全部六条。

1–5：逐句冷读（必做）、比喻只撑主图、数字溯源、标签撞名、提纲只写章节名 → 见 [cold_reader_check.md](cold_reader_check.md) 末节；由 `scripts/src/sentence-cold-read.ts` 的 `assertSentenceColdRead` 在 `visual:closeout`（作者自检路径）和 `visual:register-versions` 中强制。

6. **只改字路线**：只改文字、不动线条箭头时，登记会算每个版本 scene 的几何指纹 `geometry_sha256`（除文字外全部元素的类型/位置/尺寸/点列/绑定）。若当前自检缺 `arrow_audit`，而上一份已登记的 `delivery_versions.json` 里有版本几何指纹相同，就自动沿用那一版自检的箭头逐条记录（写入 `arrow_audit_inherited`），不再报错。几何一变就必须重做箭头记录。逐句冷读不沿用，每版都要新做。
