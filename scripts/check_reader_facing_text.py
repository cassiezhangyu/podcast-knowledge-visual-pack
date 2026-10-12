#!/usr/bin/env python3
"""检查成图文字只面向读者：不得出现生产范围、暂缓/未出页等制作元数据。

生产范围（production_scope）和 deferred_out_of_scope 只存在于工作产物里；
范围缩小时，整包内容地图只呈现本期节目面向读者的内容结构。
"""
import json, re, sys

FORBIDDEN = [
    r'本轮范围', r'生产范围', r'只做总览', r'暂缓', r'未出页', r'待出页', r'后续出页',
    r'范围外', r'不在本轮', r'production[_ ]scope', r'deferred', r'out[_ ]of[_ ]scope',
    r'OUT_OF_SCOPE', r'本轮不做', r'未制作',
]
PATTERN = re.compile('|'.join(FORBIDDEN), re.I)


def find_violations(elements):
    out = []
    for e in elements:
        if e.get('type') != 'text' or e.get('isDeleted'):
            continue
        text = e.get('text') or e.get('originalText') or ''
        m = PATTERN.search(text)
        if m:
            out.append({'id': e.get('id'), 'text': text, 'match': m.group(0)})
    return out


def main(path):
    scene = json.load(open(path, encoding='utf-8'))
    v = find_violations(scene.get('elements', []))
    print(json.dumps({'passed': not v, 'errors': [f"成图出现制作元数据“{x['match']}”：{x['text']}" for x in v]}, ensure_ascii=False, indent=2))
    return 0 if not v else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
