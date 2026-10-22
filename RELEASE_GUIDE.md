# Skill 正式发版指南（RELEASE_GUIDE）

触发语：用户说 **「请按照 RELEASE_GUIDE.md 发布新版本」** 时，整份照做，不再另起一套流程。

本仓库采用 **main + Git Tag + GitHub Releases**。`main` 始终是最新稳定主线；日常开发用功能／本地分支；每次正式发布保留完整、独立、可追溯的历史版本。不为每个版本建长期维护分支。

---

## 0. 仓库位置（必读）

| 角色 | 路径 |
|---|---|
| **正式源码（唯一发版源）** | `/home/box/skills-src/podcast-knowledge-visual-pack` |
| 远程 | `cassiezhangyu/podcast-knowledge-visual-pack`（以 `git remote -v` 为准） |
| 安装副本（不可从此发版） | `/home/box/agent-data/workflows/podcast-knowledge-visual-pack`（copy 安装结果） |

发版、打 Tag、写 Release **只在 skills-src 仓库**进行。改完正式源后，再按需把安装副本备份并 copy 重装。

---

## 1. 版本检查

1. `git status`、`git branch`、`git log`；核对远程 `main`、已有 Tags、GitHub Releases。
2. 确认最新**正式**版本（不含 `-local` 的 Tag／Release）。
3. 按 **SemVer** 与本仓库 **0.x 约定**定号：
   - **MINOR**（如 0.4.0 → 0.5.0）：合同／流程／必查门禁不兼容，或一批功能与规则合并发布。
   - **PATCH**（如 0.5.0 → 0.5.1）：小修、文档澄清、不改变门禁语义。
   - **MAJOR**：仅在公开兼容承诺断裂且团队明确决定时使用（0.x 阶段少用）。
4. **正式 Tag 不得带 `-local`**。本地开发可用 `0.4.8-local` 等标注；合并进正式版时重新定号（例如多个 local 补丁一次发布常为下一个 MINOR）。
5. 不编造变更：Release Notes 必须来自与上一正式 Tag 的真实 diff。

---

## 2. 代码与文档检查

在发版提交上确认：

- 入口与规范：`SKILL.md`、`references/`、`assets/`、`scripts/` 完整。
- `package.json` 的 `version` 已改为**正式号**（无 `-local`），并与 Tag／Release 标题一致。
- `RELEASE_NOTES.md` 顶部有该正式版条目（非「仅本地」）。
- `README.md` 标题／目录树与仓库一致。
- 无密钥、token、私人工作区、缓存、不应公开的材料（对照 `LICENSING.md`）。

**不要丢弃未提交修改**：先 `git status`；有脏文件则列清单问用户，禁止 `reset --hard`／盲目 `checkout --` 清掉。

### 必跑测试（失败即停止发版）

```bash
npm run build
npm test
npm run test:python
python3 scripts/check_skill_layout.py
```

（若某脚本名有变，以当前 `package.json` scripts 为准；缺项须先修复再发。）

---

## 3. 更新日志

根据 `git log <上一正式Tag>..HEAD` 与 `git diff <上一正式Tag>..HEAD` 写 Release Notes：

- 新增功能
- 优化／文档架构
- 问题修复
- **不兼容变更**（如有）

禁止编造。安装 ZIP／校验和说明可附在 Notes 末。

---

## 4. 合并主分支

正式版本**统一从 `main` 发布**。

1. 若当前在开发／本地分支：检查与 `main` 的差异与合并风险。
2. 有冲突、会改写已推送历史、或用户未确认 → **停下征求确认**。
3. 将已验证提交干净合并（优先快进）到 `main` 并推送远程。
4. **禁止** `--force` 推送 `main`；禁止改写已推送提交历史。

---

## 5. 远程写入前的确认卡片（硬门禁）

在执行 **push、合并到远程、创建 Tag、发布 Release、上传 Assets** 之前，必须向用户展示：

- 拟发布版本号（如 `v0.5.0`）
- 相对上一正式版的变更摘要
- 目标 Commit（完整 hash）
- 是否含不兼容变更
- 将执行的命令清单（merge／push／tag／gh release／ZIP）

**获得用户明确确认后再执行。** 任务描述、记忆、笔记不算授权。

---

## 6. 创建版本 Tag

1. 在**本次发布对应的 `main` 提交**上创建**带注释**的 Tag，例如：

   ```bash
   git tag -a v0.5.0 -m "v0.5.0: <一句话摘要>"
   git push origin v0.5.0
   ```

2. **禁止**覆盖、移动、删除已有正式版本 Tag。
3. **不要**把 `*-local` Tag 推到远程。

---

## 7. 发布 GitHub Release

1. 基于该 Tag 创建**正式** Release（**不要**标为 Pre-release）。
2. 填写版本号、标题、Release Notes（与第 3 节一致）。
3. 确保 GitHub 自动提供该 Tag 的 ZIP／TAR.GZ **源码快照**。

可用 `gh release create v0.5.0 --title "v0.5.0" --notes-file ...`（以当前 `gh` 为准）。

---

## 8. Skill 安装包（本仓库必做）

对齐既有 v0.4.0 做法，额外生成以版本号命名的安装 ZIP，并上传为 Release Asset。

### 应包含（可安装运行）

与 `scripts/install_skill.py` 的 copy 模式一致，至少：

- 入口：`SKILL.md`、`README.md`、`RELEASE_NOTES.md`、`LICENSE`、`LICENSING.md`、`taste.md`、`design_tokens.json`（含兼容链接目标）
- `RELEASE_GUIDE.md`（建议纳入，便于下游按同一规范再发）
- 资源：`references/`、`assets/`、以及根上指向它们的兼容链接目录／文件
- 代码：`scripts/`、`package.json`、`package-lock.json`、`tsconfig.json`、兼容用的 `src/`／`workers/` 链接

### 必须排除

`.git/`、`node_modules/`、`dist/`、`development/`、缓存、临时文件、密钥／私密配置、生产工作区、无关大文件。

### 校验

1. 解压到临时目录后运行：`python3 scripts/check_skill_layout.py --skill <解压根>`
2. 生成 `SHA256SUMS.txt`（ZIP 与必要清单文件）
3. 生成 manifest（版本、commit、文件列表／哈希），风格对齐上一正式 Release Assets
4. 将 ZIP、`SHA256SUMS.txt`、manifest 上传到该 Release

---

## 9. 发布验证

核对同一版本、同一 Commit：

- 远程 Tag 指向预期 commit
- Release 非 pre-release，Notes 正确
- GitHub 源码 zipball／tarball 可下载且对应同一 Tag
- 安装 ZIP 与 SHA256 匹配；解压后 layout check 通过
- **历史正式 Release／Tag 仍保留且可独立下载**

---

## 10. 结果汇报

完成后向用户提供：

- 版本号与对应 Commit
- Release 链接
- 源码快照与安装包下载链接
- 本次更新摘要
- 验证结果（Tag／Release／ZIP／layout／历史保留）

---

## 失败与边界

- 测试失败、layout 失败、工作区有未说明脏文件、权限不足、GitHub API 失败 → **停止**，报告原因，不半发布。
- 用户拒绝或确认卡片过期 → 不重试绕过；可改计划后重新请求确认。
- 禁止强制推送、覆盖历史 Tag、删除已有正式 Release、用编码／拆分命令绕过安全门禁。

---

## 安装副本同步（发版后可选）

正式源发布后，若本机 agent 使用 copy 安装：

1. 将 `/home/box/agent-data/workflows/podcast-knowledge-visual-pack` 备份为 `.bak-<说明>-<HHMM>`
2. 自 skills-src 重新 `install_skill.py --mode copy`
3. 在目标目录恢复／`npm ci`（或拷回 `node_modules`）并 `npm run build`

---

## 检查清单（缩略）

- [ ] 版本号（SemVer／0.x）已定且无 `-local`
- [ ] `package.json` + `RELEASE_NOTES` + README 一致
- [ ] build／test／test:python／check_skill_layout 全过
- [ ] 用户已确认拟版本、摘要、commit、命令清单
- [ ] 已合并并推送 `main`
- [ ] 注释 Tag 已推送且未改动旧 Tag
- [ ] 正式 Release + 安装 ZIP + SHA256SUMS + manifest
- [ ] 远程验证通过并已汇报链接
