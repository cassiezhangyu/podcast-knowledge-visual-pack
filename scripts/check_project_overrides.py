#!/usr/bin/env python3
"""v0.4.5-local：项目覆盖登记与升级提示。
固定位置：<单集工作区>/02-visual-plan/project_overrides.json
{"overrides":[{"id":"type-scale-48","what":"字号：标题48/结论32…","file":"02-visual-plan/design_tokens.override.json",
  "sha256":"…","why":"为什么不能用 skill 默认","user_authorization":"用户原话或确认位置","date":"2026-10-21"}]}
--workspace W        检查该集登记是否完整、文件哈希是否一致；--tokens 给出时还要求该参数文件已登记（与 skill 默认相同则免登记）。
--scan ROOT          扫描 ROOT 下所有单集，同一 id 在 ≥2 集出现即列为“建议升级为 skill 默认值”。
"""
import argparse, hashlib, json, sys
from pathlib import Path

REL = Path('02-visual-plan/project_overrides.json')
FIELDS = ('id', 'what', 'file', 'sha256', 'why', 'user_authorization', 'date')
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
SKILL_TOKENS = Path(__file__).resolve().parents[1] / 'design_tokens.json'


def load(ws):
    p = Path(ws) / REL
    return json.loads(p.read_text(encoding='utf-8')).get('overrides', []) if p.is_file() else []


def check_workspace(ws, tokens=None):
    errors = []
    entries = load(ws)
    for i, e in enumerate(entries):
        miss = [f for f in FIELDS if not str(e.get(f, '')).strip()]
        if miss:
            errors.append(f'overrides[{i}] 缺少 {miss}'); continue
        f = Path(ws) / e['file'] if not Path(e['file']).is_absolute() else Path(e['file'])
        if not f.is_file():
            errors.append(f"{e['id']}: 文件不存在 {f}")
        elif sha(f) != e['sha256']:
            errors.append(f"{e['id']}: 文件已变化，重新登记哈希与原因")
    if tokens and sha(tokens) != sha(SKILL_TOKENS) and not any(e.get('sha256') == sha(tokens) for e in entries):
        errors.append(f'参数文件 {tokens} 不是 skill 默认值，也没有在 {REL} 登记（what/why/用户授权）')
    return errors


def scan(root):
    seen = {}
    for reg in Path(root).glob('*/' + str(REL)):
        for e in load(reg.parents[1]):
            seen.setdefault(e.get('id'), set()).add(reg.parents[1].name)
    return [{'id': k, 'episodes': sorted(v)} for k, v in seen.items() if k and len(v) >= 2]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--workspace'); ap.add_argument('--tokens'); ap.add_argument('--scan')
    a = ap.parse_args()
    out = {}
    if a.workspace:
        out['errors'] = check_workspace(a.workspace, a.tokens)
    if a.scan:
        out['promote_candidates'] = scan(a.scan)
    out['status'] = 'fail' if out.get('errors') else 'pass'
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 1 if out.get('errors') else 0


if __name__ == '__main__':
    sys.exit(main())
