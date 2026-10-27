#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""核对有效非文字图元的笔触角色；不替代实图审查。"""
import json
import sys
from pathlib import Path


def check(path, roles):
    errors = []
    scene = json.loads(path.read_text())
    for element in scene.get('elements', []):
        if element.get('isDeleted') or element.get('type') == 'text':
            continue
        role = (element.get('customData') or {}).get('stroke_role')
        if role not in roles:
            errors.append('{}: {} 缺失或未知笔触角色 {}'.format(path.name, element['id'], role))
            continue
        for key, value in roles[role].items():
            if element.get(key) != value:
                errors.append('{}: {} {} 应为{} 实为{}'.format(path.name, element['id'], key, value, element.get(key)))
    return errors


def main():
    roles = json.loads((Path(__file__).resolve().parent.parent / 'design_tokens.json').read_text())['stroke']['role_settings']
    paths = []
    for arg in sys.argv[1:]:
        path = Path(arg)
        paths.extend(sorted(path.glob('*.excalidraw')) if path.is_dir() else [path])
    if not paths:
        raise SystemExit('请提供scene或scene目录')
    errors = [error for path in paths for error in check(path, roles)]
    print(json.dumps({'scenes': len(paths), 'errors': errors, 'status': 'fail' if errors else 'pass'}, ensure_ascii=False, indent=2))
    return bool(errors)


if __name__ == '__main__':
    sys.exit(main())
