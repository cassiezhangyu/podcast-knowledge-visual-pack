#!/usr/bin/env python3
"""安装 Skill：link 共用维护源，copy 携带代码，legacy 兼容旧精简入口。"""
import argparse
import json
import shutil
import os
import tempfile
from pathlib import Path

RESOURCE_DIRS = ("references", "assets", "rules", "schemas", "templates", "examples", "docs")
ENTRY_FILES = ("SKILL.md", "taste.md", "design_tokens.json", "README.md", "RELEASE_NOTES.md", "RELEASE_GUIDE.md", "LICENSE", "LICENSING.md")
CODE_DIRS = ("scripts", "src", "workers")
CODE_FILES = ("package.json", "package-lock.json", "tsconfig.json")


def install(source, destination, mode="legacy"):
    source = Path(source).resolve()
    destination = Path(os.path.abspath(Path(destination).expanduser()))
    if mode not in {"legacy", "link", "copy"}:
        raise ValueError("安装模式须为legacy、link或copy。")
    if destination.exists() or destination.is_symlink():
        raise ValueError("安装目标已存在；请选一个空目录，或先自行备份旧版本。")
    # macOS的/var与/private/var可能指向同一目录；相对链接须按真实父目录计算。
    destination = destination.parent.resolve() / destination.name
    if destination.resolve() == source or source in destination.resolve().parents:
        raise ValueError("安装入口应在工具仓库之外，避免递归复制。")
    required = ENTRY_FILES + (CODE_FILES + CODE_DIRS if mode == "copy" else ())
    for name in required:
        if not (source / name).exists():
            raise ValueError(f"发布包缺少入口或代码：{name}")
    for name in ENTRY_FILES:
        if not (source / name).is_file():
            raise ValueError(f"发布包缺少入口文件：{name}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if mode == "link":
        destination.symlink_to(os.path.relpath(source, destination.parent), target_is_directory=True)
        return destination
    staging = Path(tempfile.mkdtemp(prefix=".skill-install-", dir=destination.parent))
    try:
        names = ENTRY_FILES + RESOURCE_DIRS
        if mode == "copy":
            names += CODE_FILES + CODE_DIRS
        for name in names:
            item = source / name
            target = staging / name
            if item.is_symlink():
                # 只保留包内相对链接，拒绝将本机外部路径混入可迁移包。
                if mode == "copy" and (os.path.isabs(os.readlink(item)) or source not in item.resolve().parents):
                    raise ValueError(f"可迁移安装不能包含外部资源链接：{name}")
                target.symlink_to(os.readlink(item), target_is_directory=item.is_dir())
            elif item.is_dir():
                shutil.copytree(item, target, symlinks=True,
                                ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "build-color-library.mjs"))
            elif item.is_file():
                shutil.copyfile(item, target)
        if mode == "legacy":
            (staging / "RUNTIME_ROOT.json").write_text(json.dumps({
                "runtime_root": str(source),
                "note": "旧精简入口：命令在runtime_root运行。新安装优先使用--mode link或copy。",
            }, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        if mode == "copy":
            for path in staging.rglob("*"):
                if path.is_symlink() and (os.path.isabs(os.readlink(path))
                                          or not path.exists()
                                          or staging not in path.resolve().parents):
                    raise ValueError("可迁移安装包含失效或外部资源链接：" + str(path.relative_to(staging)))
        if destination.exists() or destination.is_symlink():
            raise ValueError("安装目标已存在；未覆盖现有入口。")
        staging.rename(destination)
    except Exception:
        shutil.rmtree(staging)
        raise
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", required=True, help="空的Skill安装目录")
    parser.add_argument("--mode", choices=["legacy", "link", "copy"], default="legacy",
                        help="本地维护用link；独立迁移用copy；默认legacy兼容原命令")
    args = parser.parse_args()
    try:
        target = install(Path(__file__).resolve().parent.parent, args.destination, args.mode)
        print(json.dumps({"status": "installed", "mode": args.mode, "destination": str(target)}, ensure_ascii=False))
    except ValueError as error:
        parser.exit(1, str(error) + "\n")
