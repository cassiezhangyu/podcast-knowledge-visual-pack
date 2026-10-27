# 陌生读者理解检查（作者自检必做项）

> 这是作者自检的一项，由当前主会话完成；**不创建陌生首读、审核或仲裁 agent**。

**何时做**：每一版页面在技术检查和亲眼看原图／390px／灰度之后、展示给用户之前做；主图构思阶段先用原生草图粗查一遍。只做总览时同样适用。

**怎么做**：假装完全没听过这期，只看这一张图，把阅读动线、图和句子作为一个整体判断能否看懂——**不是逐句改成白话**。按顺序回答：

1. **入口和动线**：第一眼落在哪？能否自然按设计的顺序读下去？循环、箭头的起点和方向是否一看就懂？支线是否打断主线？
2. **每块读出的意思 vs 想表达的意思**：逐块写下陌生读者会读出什么，再对照 Page Content Pack 想让他读出什么；不一致就是断点。
3. **图是否增加理解**：图形结构（因果、对比、集中、循环）是否与必要文字一起讲清关系；纯装饰、读不出含义的图形算问题。按 `page_quality_check.md` 第2项，不要求遮字后图独自讲完。
4. **一句话复述**：读完能否用一句话说出主论点，且与页面写的主论点一致。

**怎么改**：只改真正读不懂的地方，用最小改法：补一根连线、调顺序、加图例、补半句交代，或删掉。节目原话能看懂就保留原话和节目语气。改后重渲并重新检查受影响层。

**记录**：写入当前 `RENDERED_PAGE_CHECK.json` 的 `cold_reader_check`（`entry_and_path`、`blocks_read_vs_intended`、`breakpoints`、`minimal_fixes`、`one_sentence_restatement`、`status`），可同时保存 `05-qa/COLD_READ_<页>-V<n>.md`。展示给用户时用几句话说明能否看懂、改了哪里。`status` 不为 `pass` 时不得记 `self_check_passed`。


## 必查清单与逐句白话复述（必做）

作者“逐块确认意思对”会漏掉读者障碍。每页按下表逐项核对，写入 `cold_reader_check.comprehension_checklist`（每项 `status: pass|not_applicable` + `evidence`），缺项则 `visual:closeout` 拒绝。

| 键 | 检查 | 反例 → 改法 |
|---|---|---|
| `memes_slang_plain` | 网络梗、黑话、谐音词换成白话，节目原话也一样 | 活人微死 → 按部就班，却好久没觉得有劲 |
| `english_terms_chinese` | 非标题英文词有中文说法 | feel aligned → 只觉得被编进队伍 |
| `no_literal_contradiction` | 字面不自相矛盾（主动/被动等）；原话会误读时换节目里另一句原话 | 主动被点燃 → 被重新启动 |
| `reminder_items_on_page` | 提醒／边界里提到的每个对象都在本页出现；否则移到深读页或文案 | 提醒里列脑力游戏、晒伤，页面没有 → 删 |
| `example_outcome_and_feeling` | 每个例子写到“所以呢”：发生了什么＋感受或结果 | 圣托里尼跳海 → 跳海：满心幸福 |
| `one_caption_per_example_adjacent` | 一句说明只讲一个例子并紧挨它，不会被读成属于邻近例子 | “当新手”贴在洗澡旁 → 移到学游泳 |
| `diagram_labels_match_text` | 图内每个标签能在相邻正文找到同一个词或说法 | 圈内“生活尺度” vs 正文“烦恼变小” → 圈内“我的烦恼” |
| `subtitle_reader_takeaway` | 副标题是读者带走的一句话，不描述排版／整理方式，不写节目名、专辑名或期号（导出时 `check_reader_facing_text.py` 拦截） | 按四个来源并列整理 → 让人觉得活着真好的四种时刻；纵横四海 EP86｜运营管理总览 → 用运营管理看产出：取舍、卡点与持续改进 |
| `highlighted_example_labeled` | 图上高亮、选中或放大的某一项，如果只是举例，页面上要写明“以……为例”，不让读者以为节目推荐它 | 四种需求里高亮“质量” → ①句写“先选一项（图以质量为例）” |
| `title_reference_specific` | 正文提到“标题”“书名”“原话”时说清是哪一个，不和本页主标题混淆 | 标题里的3000% → 节目标题里的3000% |
| `theory_named_explained_inline` | 理论、方法或人名第一次出现时，同一处用半句白话说它管什么；只放名字不算解释 | Scrum｜管回流 → Scrum｜管回流：短周期交出能用的一块，评审看产品，复盘看做法 |

**逐句白话复述表** `cold_reader_check.plain_restatement`：页面上每个句子／标签组一行 `{page_text, stranger_restatement, clear}`（与当前 scene 的全部唯一文字组逐项对应，包含短标签、页脚和编号；加粗重字副本共用一行）。以从没听过节目的人口吻转述，复述实际含义而非重复术语，本期术语表命中的词在复述里换成它的含义；转述需要补上下文、出现“？”或与原意不同，`clear=false`，修好再记。任何一行 `clear=false` 都不能记 `self_check_passed`。


## 本期术语表（内容阶段产出，必做）

换一期节目，术语就换一批，内置词表跟不上。所以在《内容拆分》通过后、页面规划前，从已批准内容里列出本期陌生读者可能不懂的词，写入 `01-understanding/READER_JARGON.json`：

```json
{"kind": "reader_jargon", "terms": [{"term": "瓶颈", "plain": "整条流程里最慢的那一处"}, {"term": "在制品", "plain": "已经开始、还没做完的活"}]}
```

收录专业术语、英文方法名、节目内部说法、缩写和容易被读成别的意思的词。确实没有时写 `"terms": []` 并加 `empty_reason`。内页收尾时，凡是含表中术语的句子，都必须在 `sentence_cold_read.items` 里标 `flagged: true`、`resolution: "explained_on_page"` 并写明页面哪里解释了它，提供 `explanation_refs: [{element_id, quote}]` 引用当前 scene 的可见原文；更好的做法是直接改成 `plain` 里的白话。`author-check:init` 会自动标出这些句子。缺少术语表时 `visual:closeout` 拒绝内页收尾。

## 逐句冷读与四项补充（必做）

整页冷读会放过「像森林，不像房子」「破了不会马上立」这类句子。整页能懂 ≠ 每句能懂。

初始化字段保留未检查状态；作者逐条阅读后才裁定 `flagged` 与 `resolution`。程序检查全量覆盖、引用存在、明显原句重复及复述沿用本期疑难词，不能证明复述语义正确或替代真实读者测试。疑难词留在页面时，白话复述需直接说明其含义，不能靠“常用术语”放行；含义只能在报告中解释、页面没有解释时，须回改页面。

**1. 逐句冷读（必查，工具强制）**：页面上每个文字元素单独过一遍。比喻、自造词、节目内部说法（长进去、种子、少即是多、破了不会马上立、像森林不像房子）要么改白话，要么在页面上当场解释。写入作者自检 `checks.sentence_cold_read.items[]`：`{text, flagged, resolution: plain|rewritten|explained_on_page, original?, explanation?, explanation_refs?: [{element_id, quote}], reason}`。scene 里每个文字元素都必须有一行；仍 `flagged` 且未当场解释、或页面仍含已知节目内部说法时，`visual:closeout` 与 `visual:register-versions` 拒绝。没有这份记录不得给用户看图。
  - 实例：像森林，不像房子 → 知识要自己长成网，不是先搭框架再往里填；立：长进去 → 立：消化成自己的；种子太多，一颗都长不出来 → 记太多，哪条都消化不了；少即是多 → 记得越少越好。

**2. 比喻只撑主图（并入清单）**：主图可以用比喻（土壤、树），正文必须直接说结论，不能让读者解比喻。记录 `metaphor_body_plain {status, evidence}`。

**3. 数字和单位溯源（并入清单，工具强制）**：页面上每个数字/数量词都要对到逐字稿原句。记录 `number_trace[]`：`{text, quote, timestamp}`；纯结构数字（“三步”）可写 `{text, kind:"structural", reason}`。实例：「每周一到三粒」错，原话是每期/每本 → 每次一到三个点。

**4. 标签撞名（并入清单，工具强制）**：逐个标签查是否会被读成人名、品牌、书名。记录 `label_collision {status, findings:[{term, ruling}]}`；命中内置词表（`scripts/src/sentence-cold-read.ts` 的 `COLLISION_TERMS`，如木心）而无裁定则拒绝。实例：人生体验（木心）→ 人生体验（最里层）。

**5. 提纲只写章节名（并入清单，工具强制）**：本页提纲不加括号注释，括号里的内容放正文。记录 `outline_items[]`，含（、(、【 即拒绝。实例：行（回到破）、土壤（依据）→ 行、知识体系（土壤）……注：章节名本身就是“X（Y）”的少数情况须改写为不带括号的名字。
