# 播客知识视觉材料包 · 0.2.1-beta.1

将小宇宙单集转成可追溯的《内容梳理》《内容拆分》、封面、节目总览、深度解读信息图、原生可编辑 Excalidraw 与配套文案。语义理解、构图与审美由执行 Skill 的模型完成；工具承担抓取、转写、校验、哈希绑定、渲染和打包。

这是经过本机实际制作验证的公开测试版。它需要查看真实图片、隔离审核和人类审批；不能把安装或测试通过当作新节目已经产出 TARGET。

## 安装

将 GitHub 仓库克隆到普通工具目录，进入包含 package.json 的根目录；仓库不放进 Skill 扫描目录。

```bash
npm ci
npm run build
npm test
npm run test:python
# 用户级入口；目标应为空，现有版本不会被覆盖
python3 scripts/install_skill.py --destination "$HOME/.agents/skills/podcast-knowledge-visual-pack"
```

也可将 destination 改为自己工作项目的 `.agents/skills/podcast-knowledge-visual-pack`，该目录应在工具仓库之外。安装器只复制指令和资源，并写入本机 `RUNTIME_ROOT.json`；node_modules、dist、生产工作区留在工具仓库。仓库移动后需重新安装入口。官方位置与显式调用规则见 [Codex Skill 文档](https://learn.chatgpt.com/docs/build-skills)。

安装后明确调用：

```text
使用 podcast-knowledge-visual-pack 处理这个小宇宙单集：[链接]。
先展示内容梳理，待我确认后再展示内容拆分。图片默认每页三案，逐页选定。
输出到我指定的本地目录；完整保留来源、案例、条件与边界。
```

在支持 `$` 提及的 Codex 入口可使用 `$podcast-knowledge-visual-pack`。整个工具链以 RUNTIME_ROOT 指向的仓库为命令工作目录；不要在安装入口中 npm install。

## 环境与依赖

| 能力 | 当前要求与已验证范围 |
|---|---|
| 工具链 | Node.js 24.x；npm ci 使用 package-lock.json；Python 3.9或以上用于标准库脚本 |
| 图片渲染 | Playwright 与官方 Excalidraw 适配器；本机 macOS 已安装 Chrome，按 `docs/RENDER_BROWSER_ENVIRONMENT.md` 使用能启动浏览器的权限 |
| 本地转写 | 当前实现为 macOS Apple Silicon 的 MLX Whisper；另备 Python 环境，包含 mlx_whisper、av、numpy，并通过 --provider-python 指定 |
| 模型 | 能读取来源、编写原生 scene、实际看图；隔离只读审核者与创作者使用不同上下文 |
| 表达处理 | 配套文案阶段调用可用的 Humanizer Skill；不可用时保持该阶段待完成，不冒称执行过 |
| 校准素材 | 有明确使用范围的正反参考和本期来源；节目名称、摘录、品牌等第三方内容不受MIT授权 |

默认测试不安装或运行 MLX，不识别完整音频。其他操作系统、陌生物理机器、其他宿主模型与无人干预的完整新节目生产尚未验证。npm 安装可能显示 Excalidraw 内部较旧 Radix 对 React 的 peer 警告；当前锁定组合已做实际导入、编辑和渲染验证，未改依赖来隐藏警告。

## 生产顺序

完整运行合同见 `SKILL.md`，每阶段只读取相关 rules。整包最多18张，封面、总览续页和附录图均计入；规划通过后才确定页数。

1. 获取完整音频、转写与 Grounded Transcript。
2. 模型形成内容梳理、清单；用户批准当前版本。
3. 模型形成内容拆分、覆盖与页面规划；用户批准当前版本。
4. 通用工具组装知识图、编辑规划与覆盖矩阵。
5. 用户选色；按内容探索每页构图，默认三案，先使最有把握的一案达到完整独立 TARGET。三案不能沿用同一骨架换图标。
6. 正反参考预检、真实原型、原生整页构建、原图/390px/灰度与独立审核；展示真实图，用户选定并批准当前哈希。
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
```

这些命令之间需要模型生成相应语义工件与真实审批，不是直接连跑的自动产图流水线。视觉 prepare / closeout 的参数与状态见 `rules/independent_visual_review.md`；默认三案、逐页/整包授权、两轮返工与限质边界见 `rules/visual_pack_execution.md`。机器校验不承担视觉判断。

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
  npm test -- --run tests/accepted-artwork-import.test.ts
```

已完成新播客的17页实际制作、逐页选择和验收；当前替换页另做实际导入与编辑，最新整包实看51张原图/手机/灰度图。此证据证明本次人工协作流程成立，不代表所有未来输入或模型都能获得同样结果。发布检查和限制见 `RELEASE_NOTES.md`。

通用代码和指令按MIT发布，版权归属 cassiezhangyu；案例与色卡有单独范围，见 `LICENSING.md`。未核定第三方公开范围的材料不进入可上传版本。正反参考迁移时保持原字节与身份，不改图来制造新许可。
