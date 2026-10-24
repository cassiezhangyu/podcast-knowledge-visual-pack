#!/usr/bin/env python3
"""由上一版预检生成新版预检（preflight:bump）。
重算所有已绑定输入的 sha256 与 design_tokens_sha256，继承参考观察和构图决定，
写入 version、previous 链与必填的修订说明。只在内容/参数变化后、重画 scene 之前使用；
构图决定本身变化时，应重写对应字段而不是只 bump。
usage: bump_preflight.py --from OLD.json --out NEW.json --note "改了什么、为什么" [--tokens PATH] [--set key=PATH ...]
"""
import argparse, datetime, hashlib, json, re, sys
from pathlib import Path

sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def rebind(node, changed):
    if isinstance(node, dict):
        if isinstance(node.get('path'), str) and 'sha256' in node:
            new = sha(node['path'])
            if new != node['sha256']:
                changed.append(node['path']); node['sha256'] = new
            return
        for v in node.values():
            rebind(v, changed)
    elif isinstance(node, list):
        for v in node:
            rebind(v, changed)


def bump(old_path, out_path, note, tokens=None, sets=()):
    if not note or len(note.strip()) < 8:
        raise ValueError('--note 必须写清改了什么、为什么（至少8字）')
    old = json.loads(Path(old_path).read_text(encoding='utf-8'))
    if old.get('status') != 'completed_before_construction':
        raise ValueError('上一版预检未完成，不能在其上 bump')
    new = json.loads(json.dumps(old))
    inputs = new.setdefault('inputs', {})
    for item in sets:
        key, _, path = item.partition('=')
        if not key or not path:
            raise ValueError('--set 格式为 key=PATH')
        inputs[key] = {'path': str(Path(path).resolve()), 'sha256': sha(path)}
    if tokens:
        inputs['tokens'] = {'path': str(Path(tokens).resolve()), 'sha256': sha(tokens)}
    changed = []
    rebind(inputs, changed)
    tok = inputs.get('tokens', {}).get('path')
    if tok:
        new['design_tokens_sha256'] = sha(tok)
    for key in ('selected_palette', 'content'):
        p = new.get(f'{key}_path')
        if p and Path(p).is_file():
            new[f'{key}_sha256'] = sha(p)
    m = re.search(r'(\d+)$', str(old.get('version', '')))
    new['version'] = re.sub(r'\d+$', str(int(m.group(1)) + 1), old['version']) if m else (str(old.get('version', 'REFERENCE_PREFLIGHT')) + '_V2')
    new['previous'] = {'path': str(Path(old_path).resolve()), 'sha256': sha(old_path), 'version': old.get('version')}
    new['revision_note'] = note.strip()
    new.setdefault('amendments', [])
    new['amendments'] = list(new['amendments']) + [{'version': new['version'], 'note': note.strip(), 'rebound_inputs': changed,
                                                   'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds')}]
    new['status'] = 'completed_before_construction'
    Path(out_path).write_text(json.dumps(new, ensure_ascii=False, indent=1), encoding='utf-8')
    return new, changed


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from', dest='old', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--note', required=True); ap.add_argument('--tokens'); ap.add_argument('--set', action='append', default=[])
    a = ap.parse_args()
    if Path(a.out).exists():
        print(json.dumps({'status': 'fail', 'error': '输出文件已存在；新版预检必须是新文件'}, ensure_ascii=False)); return 1
    try:
        new, changed = bump(a.old, a.out, a.note, a.tokens, a.set)
    except (OSError, ValueError, KeyError) as exc:
        print(json.dumps({'status': 'fail', 'error': str(exc)}, ensure_ascii=False)); return 1
    print(json.dumps({'status': 'pass', 'version': new['version'], 'out': a.out, 'rebound_inputs': changed}, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
