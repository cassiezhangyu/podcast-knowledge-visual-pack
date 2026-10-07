# Excalidraw 浏览器渲染环境诊断与恢复

## 已核实的故障层

2026-09-23，同一台 macOS 主机使用 Node 24.19.0、Playwright 1.63.0、Chrome 153.0.8010.53：

| 执行环境 | 最小 `chromium.launch()` | 正式 Excalidraw 适配器导出 |
|---|---|---|
| Codex 受限命令环境 | 系统 Chrome `SIGABRT`；Playwright headless shell 的 Mach 服务注册被拒绝 | 无法进入 |
| 获准宿主命令环境 | 启动并打开 `about:blank` | 已验收原生 scene 导出 1200×1600 PNG、390×520 PNG |

崩溃报告的主线程位于 macOS `RegisterApplication` / `TransformProcessType`，Chrome 自己调用 `abort()`。这定位到浏览器启动所处的执行边界；未证明更细的 macOS 内部触发条件。`kill EPERM` 是 Playwright 清理已崩溃进程时的后续错误。页面元素、中文测量和 Excalidraw 导出都还未在失败路径上运行。

2026-09-24 又在受限命令环境验证 Playwright 1.63.0 的官方 Chromium headless shell：最小 `chromium.launch()` 在 `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer... Permission denied (1100)` 后以 `SIGTRAP` 退出。故障同样发生在页面创建前，证明更换为 headless shell 不能使该环境运行浏览器。获准宿主环境使用系统 Chrome 的真实导出预检仍通过。项目无法从 Node 脚本内部解除 Codex 命令沙箱的 macOS 服务权限；长期做法是直接选择已验证的宿主执行权限。

## 运行合同

1. 构图与 scene 校验可在普通环境完成。本机 Codex 渲染直接使用命令工具的获准宿主权限（`sandbox_permissions: "require_escalated"`），权限由执行工具审批。启动浏览器前不先在受限命令环境尝试。
2. 正式页运行 `npm run render:checked -- --workspace <episode-workspace>`。入口在同一执行权限、同一浏览器路径下完成构建、真实导出预检与正式渲染；预检失败即停止。macOS 默认选用已安装的系统 Chrome，也可用 `PODCAST_MAP_CHROME_PATH` 指定其他已验证路径。
3. 局部原型的专用渲染脚本先在相同宿主权限下执行 `npm run render:preflight`，再在该权限下运行专用脚本。独立预检、正式渲染实现与 EP88 P02 专用渲染器现与 `render:checked` 一致：macOS 有系统 Chrome 时默认使用它，`PODCAST_MAP_CHROME_PATH` 仍可显式覆盖；只有两者都没有时才使用 Playwright bundled browser。2026-09-25 曾因独立预检遗漏系统 Chrome 回退而误报 `BROWSER_NOT_INSTALLED`，入口修正后真实导出预检与 EP88 P02 的三种 PNG 均通过。
4. `BROWSER_HOST_LAUNCH_BLOCKED` 表示浏览器启动权限故障；`BROWSER_NOT_INSTALLED` 表示浏览器缺失。两者都发生在 Excalidraw 页面导出前。
5. 预检失败时停止当前轮 PNG 审核；不能用截图、静态 scene 检查或旧 PNG 代替同一 scene 的真实导出。

## 验收边界

获准宿主环境的预检已通过，证实**该环境**可以使用真实 Excalidraw 导出。入口固定执行权限选择与同环境预检，可避免每次 skill 调用先在受限环境撞上 Chrome 崩溃。命令沙箱本身的服务权限没有被修改；执行工具若拒绝宿主权限，当前环境仍不能渲染。预检只能证明运行环境，不代表某张页面获得视觉验收。
