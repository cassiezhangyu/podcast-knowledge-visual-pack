# 播客知识视觉材料包 · 0.6.1

将小宇宙单集转成可追溯的《内容梳理》《内容拆分》、封面、节目总览、深度解读信息图、原生可编辑 Excalidraw 与配套文案。语义理解、构图与审美由执行 Skill 的模型完成；工具承担抓取、转写、校验、哈希绑定、渲染和打包。

这是经过本机实际制作验证的公开测试版。它需要查看真实图片、作者自检和人类审批；安装和测试通过只说明工具检查成立，不代表新节目已完成视觉自检。

## 安装

源码安装：将仓库克隆到目标项目的 `.agents/skills/podcast-knowledge-visual-pack/`，或将 Release 安装包解压到该位置。根目录可直接找到 `SKILL.md`。

标准安装器使用单独的 `install` 分发分支，其中 `skills/podcast-knowledge-visual-pack/` 由同一源码的 copy 模式生成，包含普通文件和目录，不含符号链接。该分支按发版指南发布后，可向 Codex 发送：

```text
使用 skill-installer，从 https://github.com/cassiezhangyu/podcast-knowledge-visual-pack/tree/install/skills/podcast-knowledge-visual-pack 安装到当前项目的 .agents/skills，并安装依赖、完成构建。
```

源码的 `main`／旧正式标签仍含兼容链接，不能作为标准安装器入口。标准安装器负责下载 Skill；运行依赖与构建仍按以下说明完成。

进入 Skill 根目录安装依赖并构建：

```bash
npm ci
npm run build
```

项目开发测试仍从同一目录运行 `npm test` 和 `npm run test:python`，测试实体位于本仓库的 `development/tests/`。独立复制包不包含这些项目测试。

安装到另一个项目时，可执行：

```bash
python3 scripts/install_skill.py --mode copy --destination <另一项目>/.agents/skills/podcast-knowledge-visual-pack
```

目标必须尚不存在，并位于当前 Skill 目录之外。copy 将包内兼容链接展开为普通文件和目录，携带规则、资源、运行源码、脚本、worker、依赖声明与构建配置；不携带 node_modules、dist、开发测试或生产工作区。进入目标目录执行 `npm ci` 和 `npm run build`，音频转写仍需独立 MLX 环境。案例迁移范围受 `LICENSING.md` 约束。

安装器保留 link 与 legacy 以兼容旧调用；本项目使用直接存放，新增独立安装使用 copy。官方目录说明见 [Codex Skill 文档](https://learn.chatgpt.com/docs/build-skills)。

安装后明确调用：

```text
使用 podcast-knowledge-visual-pack 处理这个小宇宙单集：[链接]。
先展示内容梳理，待我确认后再展示内容拆分。图片默认每页三案，逐页选定。
输出到我指定的本地目录；完整保留来源、案例、条件与边界。
```

在支持 `$` 提及的 Codex 入口可使用 `$podcast-knowledge-visual-pack`。link 模式先解析入口目录的真实路径，再在该根目录运行命令；copy 模式在复制后的根目录运行；legacy 模式在 `RUNTIME_ROOT.json` 指向的仓库运行。生产工作区放在 Skill 之外。

## 资源组织与兼容路径

```text
podcast-knowledge-visual-pack/
├── SKILL.md                         主入口：范围、读取顺序、阶段停点
├── README.md                        安装与目录说明
├── RELEASE_NOTES.md                 版本变更
├── RELEASE_GUIDE.md                 正式发版流程（GitHub Tag / Release）
├── LICENSE / LICENSING.md           许可与公开范围
├── references/
│   ├── taste.md                     用户／系列审美偏好
│   ├── rules/                       生产规则（含 cold_reader、layout_budget、
│   │                                cjk_glyphs、project_overrides 等现行必读）
│   ├── schemas/                     JSON 数据合同
│   ├── environment/                 渲染环境说明
│   ├── examples/ → ../assets/examples
│   └── legacy/                      已弃用兼容说明（如独立审核）
├── assets/
│   ├── design_tokens.json / color-library.*
│   ├── templates/                   工作文档模板
│   └── examples/                    positive／negative 案例
├── scripts/                         命令、检查、src、workers
├── development/                     测试与构建工具（安装 ZIP 不含）
├── package.json 等                  依赖与构建
└── 根目录兼容链接
    rules/ schemas/ templates/ examples/ taste.md
    design_tokens.json docs/ src/ workers/
```

`rules/`、`schemas/`、`templates/`、`examples/`、`taste.md`、`design_tokens.json` 及原环境文档路径均为指向规范位置的相对兼容链接。现有命令、历史哈希绑定和案例引用可继续通过原路径读取；源码中编辑链接和规范路径会修改同一文件，无需两处同步。copy 分发包中的兼容路径是生成副本；维护时修改源码并重新生成，不单独编辑副本。完整 Skill 直接在其根目录维护；运行回归测试及配置位于本仓库 `development/`。`npm test` 与 `npm run test:python` 从本仓库 development 目录加载测试；独立 copy 安装仅携带运行能力，不携带项目测试。开发测试与 `RELEASE_GUIDE.md` 不要求每次生产加载；正式发版时按该指南执行。执行 `python3 scripts/check_skill_layout.py` 检查结构、兼容链接及运行资源。

## 环境与依赖

| 能力 | 当前要求与已验证范围 |
|---|---|
| 工具链 | Node.js 24.x；npm ci 使用 package-lock.json；Python 3.9或以上用于标准库脚本 |
| 图片渲染 | Playwright 与官方 Excalidraw 适配器；本机 macOS 已安装 Chrome，按 `docs/RENDER_BROWSER_ENVIRONMENT.md` 使用能启动浏览器的权限 |
| 本地转写 | 当前实现为 macOS Apple Silicon 的 MLX Whisper；另备 Python 环境，包含 mlx_whisper、av、numpy，并通过 --provider-python 指定 |
| 模型 | 主会话能读取来源、编写原生scene、实际看图并完成作者自检，无需另建审核上下文 |
| 表达处理 | 配套文案阶段调用可用的 Humanizer Skill；不可用时保持该阶段待完成，不冒称执行过 |
| 校准素材 | 有明确使用范围的正反参考和本期来源；节目名称、摘录、品牌等第三方内容不受MIT授权 |

默认测试不安装或运行 MLX，不识别完整音频。其他操作系统、陌生物理机器、其他宿主模型与无人干预的完整新节目生产尚未验证。npm 安装可能显示 Excalidraw 内部较旧 Radix 对 React 的 peer 警告；当前锁定组合已做实际导入、编辑和渲染验证，未改依赖来隐藏警告。

## 生产顺序

完整运行合同见 `SKILL.md`，每阶段只读取相关 rules。整包最多18张，封面、总览续页和附录图均计入；规划通过后才确定页数。

1. 获取完整音频、转写与 Grounded Transcript。
2. 模型形成内容梳理、清单；用户批准当前版本。
3. 模型形成内容拆分、覆盖与页面规划；用户批准当前版本。
4. 通用工具组装知识图、编辑规划与覆盖矩阵。
5. 用户选色；按内容探索每页构图，默认三案，先使最有把握的一案达到完整作者自检。三案不能沿用同一骨架换图标。
6. 正反参考预检、真实原型、原生整页构建、原图/390px/灰度与作者自检；展示真实图，用户选定并批准当前哈希。
7. 实际编辑检查、整包横审、配套文案忠实度回归与ZIP一致性检查；用户明确确认当前整包后发布门禁通过。

```bash
npm run intake -- <单集链接> --output <工作区> --until transcript \
  --provider-python <MLX环境Python> --asr-strategy direct --asr-environment stable
npm run content:gate -- --workspace <工作区> --stage inventory --action check
npm run content:gate -- --workspace <工作区> --stage split --action check
# 仅在用户明确批准对应当前工件后，将上述 action 改为 approve
npm run content:assemble -- --workspace <工作区>
npm run construct -- --workspace <工作区>
npm run render:checked -- --workspace <工作区>
# 单页（scene-checked）路线：导出 → 自检草稿 → 渲染清单 → 登记
npm run render:scene:checked -- --scene <P01.excalidraw> --preflight <REFERENCE_PREFLIGHT.json> --output <render目录> --brand <专辑封面> --design-tokens assets/design_tokens.json
npm run author-check:init -- --workspace <工作区> --record <render目录>/MECHANICAL_RENDER_RECORD.json --out <RENDERED_PAGE_CHECK.json>
npm run render:manifest -- --workspace <工作区> --record <render目录>/MECHANICAL_RENDER_RECORD.json
npm run visual:closeout -- --workspace <工作区> --page-check <RENDERED_PAGE_CHECK.json> --action submit
npm run preview:copies -- --out <工作区>/05-qa/preview A=<P01@2x.png> B=<P01@2x.png>
```

这些命令之间需要模型生成相应语义工件与真实审批，不是直接连跑的自动产图流水线。作者自检字段见 `rules/page_quality_check.md`，页面登记使用 `visual:closeout --page-check`；默认三案、逐页/整包授权、两轮返工与限质边界见 `rules/visual_pack_execution.md`。机器校验不承担视觉判断。

已验收旧图可用 `npm run accepted-artwork:import -- --workspace <工作区> --input <实际批准清单>` 冻结导入。仍须当前四工件、真实单页报告、选择批准、实际编辑操作和当前整包横审；不能借此补签制作历史或放宽新页默认三案。

## 中断与恢复

```bash
npm run workflow:status -- --workspace <工作区>
# 转写重跑原命令会使用合法缓存；不自动恢复已失效的人工批准
npm run render:preflight -- --output <本次环境检查目录>
```

DIRECT 是当前稳定完整音频路线；失败后不自动转为分段。状态、来源哈希和阶段记录决定恢复位置，不能靠修改时间猜测。内容或图片变化后，重新检查受影响的门禁；浏览器预检失败即停止渲染，不以旧PNG替代。

## 验证与许可

默认测试使用合成夹具验证状态机、防篡改、单案授权与总览续页，不包含私人音频、outputs或生产审批。真实本地整包验证是可选项：

```bash
PODCAST_MAP_REAL_IMPORT_ROOT="<含workspace和IMPORT_INPUT.json的本地目录>" \
  npm test -- development/tests/accepted-artwork-import.test.ts
```

已完成新播客的17页实际制作、逐页选择和验收；当前替换页另做实际导入与编辑，最新整包实看51张原图/手机/灰度图。此证据证明本次人工协作流程成立，不代表所有未来输入或模型都能获得同样结果。发布检查和限制见 `RELEASE_NOTES.md`。

通用代码和指令按MIT发布，版权归属 cassiezhangyu；案例与色卡有单独范围，见 `LICENSING.md`。未核定第三方公开范围的材料不进入可上传版本。正反参考迁移时保持原字节与身份，不改图来制造新许可。

当前流程不触发审核agent；绘制、作者自检及输出由主会话完成。visual:closeout默认接收--page-check，旧--review路径仅为显式历史兼容，不是必需步骤。
