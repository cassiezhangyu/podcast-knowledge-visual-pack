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
    # 编辑过程用语（提醒/边界只写读者需要的事实，不解释作者怎么整理）
    r'本页整理', r'由本页', r'整理而成', r'松散', r'分组', r'归类', r'归属由', r'示意归属',
    r'按.{0,6}并列整理', r'Show ?Notes 的',
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


SUBTITLE_ROLES = {'overview_thesis', 'deep_thesis'}
SUBTITLE_META = re.compile(r'EP\s*\d+|Vol\.?\s*\d+|第\s*\d+\s*期|本期|这期|节目|播客|专辑|单集', re.I)


def subtitle_violations(elements, metadata=None):
    """副标题只写内容陈述：不写节目名、专辑名、期号或“本期节目”之类的说法。"""
    names = []
    if metadata:
        episode = metadata.get('episode') or {}
        names = [n for n in (episode.get('podcast_name'), episode.get('title')) if isinstance(n, str) and n.strip()]
    out = []
    for e in elements:
        if e.get('type') != 'text' or e.get('isDeleted'):
            continue
        data = e.get('customData') or {}
        if data.get('typography_role') not in SUBTITLE_ROLES and data.get('text_function') != 'subtitle':
            continue
        text = e.get('text') or ''
        flat = re.sub(r'\s+', '', text)
        hit = next((n for n in names if re.sub(r'\s+', '', n) in flat), None)
        m = SUBTITLE_META.search(text)
        if hit or m:
            out.append({'id': e.get('id'), 'text': text, 'match': hit or m.group(0)})
    return out


def main(argv):
    path = argv[0]
    metadata = None
    if '--metadata' in argv:
        metadata = json.load(open(argv[argv.index('--metadata') + 1], encoding='utf-8'))
    elements = json.load(open(path, encoding='utf-8')).get('elements', [])
    v = find_violations(elements)
    seen, sub = set(), []
    for x in subtitle_violations(elements, metadata):
        if x['text'] not in seen:
            seen.add(x['text'])
            sub.append(x)
    errors = [f"成图出现制作元数据“{x['match']}”：{x['text']}" for x in v]
    errors += [f"副标题只写本页内容陈述，不写节目名、专辑名或期号（出现“{x['match']}”）：{x['text']}" for x in sub]
    print(json.dumps({'passed': not errors, 'errors': errors}, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
