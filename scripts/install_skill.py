#!/usr/bin/env python3
"""安装不含依赖目录的 Skill 入口；工具在扫描目录外的仓库执行。"""
import argparse
import json
import shutil
from pathlib import Path

RESOURCE_DIRS = ("rules", "schemas", "templates", "assets", "examples")
ENTRY_FILES = ("SKILL.md", "taste.md", "design_tokens.json", "README.md", "RELEASE_NOTES.md", "LICENSE", "LICENSING.md")


def install(source, destination):
    source, destination = Path(source).resolve(), Path(destination).expanduser().resolve()
    if destination.exists():
        raise ValueError("安装目标已存在；请选一个空目录，或先自行备份旧版本。")
    if destination == source or source in destination.parents:
        raise ValueError("安装入口应在工具仓库之外，避免递归复制。")
    for name in ENTRY_FILES:
        if not (source / name).is_file():
            raise ValueError(f"发布包缺少入口文件：{name}")
    destination.mkdir(parents=True)
    for name in ENTRY_FILES:
        shutil.copyfile(source / name, destination / name)
    for name in RESOURCE_DIRS:
        if (source / name).exists():
            shutil.copytree(source / name, destination / name)
    doc = source / "docs/RENDER_BROWSER_ENVIRONMENT.md"
    if doc.exists():
        (destination / "docs").mkdir()
        shutil.copyfile(doc, destination / "docs/RENDER_BROWSER_ENVIRONMENT.md")
    (destination / "RUNTIME_ROOT.json").write_text(json.dumps({
        "runtime_root": str(source),
        "note": "所有npm和scripts命令在此仓库目录执行；依赖、构建和工作区不放进Skill扫描目录。",
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", required=True, help="空的Skill安装目录")
    args = parser.parse_args()
    try:
        target = install(Path(__file__).resolve().parent.parent, args.destination)
        print(json.dumps({"status": "installed", "destination": str(target)}, ensure_ascii=False))
    except ValueError as error:
        parser.exit(1, str(error) + "\n")
