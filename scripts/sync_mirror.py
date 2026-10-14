#!/usr/bin/env python3
"""把本仓库的 Skill 文件同步到工作流镜像。
用法：python3 scripts/sync_mirror.py [--check] [镜像目录]
  默认镜像：/home/box/agent-data/workflows/podcast-knowledge-visual-pack
  --check：只比较不复制，有差异时 exit 1。
不同步 .git、node_modules、dist、生产工作区与缓存；镜像自己的 RUNTIME_ROOT.json 保留不动。"""
import filecmp, shutil, sys
from pathlib import Path
SRC = Path(__file__).resolve().parents[1]
args = sys.argv[1:]; check = "--check" in args; args = [a for a in args if a != "--check"]
DST = Path(args[0] if args else "/home/box/agent-data/workflows/podcast-knowledge-visual-pack")
SKIP_DIRS = {".git", "node_modules", "dist", "artifacts", "workspace", "logs", "downloads", ".cache", "__pycache__", ".model-cache", "model-cache"}
KEEP = {"RUNTIME_ROOT.json"}
def files(root):
    out = set()
    for p in root.rglob("*"):
        rel = p.relative_to(root)
        if any(part in SKIP_DIRS for part in rel.parts) or p.suffix == ".pyc" or not p.is_file(): continue
        if rel.as_posix() in KEEP: continue
        out.add(rel.as_posix())
    return out
s, d = files(SRC), files(DST) if DST.exists() else set()
add = sorted(s - d); rm = sorted(d - s); chg = sorted(x for x in s & d if not filecmp.cmp(SRC / x, DST / x, shallow=False))
if check:
    for k, L in (("新增", add), ("删除", rm), ("变更", chg)):
        for x in L: print(k, x)
    print("镜像一致" if not (add or rm or chg) else "镜像与源码不一致"); sys.exit(1 if (add or rm or chg) else 0)
for x in add + chg:
    (DST / x).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(SRC / x, DST / x)
for x in rm: (DST / x).unlink()
print(f"已同步到 {DST}：新增 {len(add)}，变更 {len(chg)}，删除 {len(rm)}")
