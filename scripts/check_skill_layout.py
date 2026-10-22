#!/usr/bin/env python3
"""检查 Skill 资源、兼容链接及 copy 安装所需代码；不审批内容或图片。"""
import argparse
import json
from pathlib import Path


ALIASES = {
    "rules": "references/rules",
    "schemas": "references/schemas",
    "taste.md": "references/taste.md",
    "templates": "assets/templates",
    "examples": "assets/examples",
    "design_tokens.json": "assets/design_tokens.json",
    "docs/RENDER_BROWSER_ENVIRONMENT.md": "references/environment/RENDER_BROWSER_ENVIRONMENT.md",
    "references/examples": "assets/examples",
    "assets/LICENSING.md": "LICENSING.md",
}


def check(root):
    root = Path(root).resolve()
    errors = []
    for old, current in ALIASES.items():
        alias, target = root / old, root / current
        if not target.exists():
            errors.append("缺少规范资源：" + current)
        if not alias.is_symlink() or alias.resolve() != target.resolve():
            errors.append("兼容路径未连接规范资源：" + old)
    for name in ["SKILL.md", "RELEASE_GUIDE.md", "package.json", "package-lock.json", "tsconfig.json",
                 "scripts/install_skill.py", "scripts/src/validate.ts", "scripts/workers/mlx_whisper_provider.py"]:
        if not (root / name).is_file():
            errors.append("缺少运行文件：" + name)
    # 同时检查深层资源链接，防止可迁移包遗漏案例或兼容目标。
    for directory in ["references", "assets", "scripts", "src", "workers", "docs"]:
        for path in (root / directory).rglob("*"):
            if path.is_symlink():
                if not path.exists():
                    errors.append("失效链接：" + str(path.relative_to(root)))
                elif root not in path.resolve().parents:
                    errors.append("资源链接指向包外：" + str(path.relative_to(root)))
    legacy = root / "references/legacy/independent_visual_review.md"
    if not legacy.is_file():
        errors.append("缺少已弃用兼容说明：references/legacy/independent_visual_review.md")
    for stale in ["references/rules/v047_local_rules.md", "references/rules/v048_local_rules.md",
                  "references/rules/independent_visual_review.md"]:
        if (root / stale).exists():
            errors.append("过时规则文件应已折叠或迁出：" + stale)
    if (root / "assets/design_tokens.json").is_file():
        tokens = json.loads((root / "assets/design_tokens.json").read_text())
        if not all(key in tokens for key in ["typography", "stroke", "export"]):
            errors.append("绘制参数缺少现行运行字段")
    return errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        errors = check(args.skill)
    except (OSError, ValueError) as error:
        errors = [str(error)]
    print(json.dumps({"status": "fail" if errors else "pass", "errors": errors}, ensure_ascii=False))
    raise SystemExit(bool(errors))
