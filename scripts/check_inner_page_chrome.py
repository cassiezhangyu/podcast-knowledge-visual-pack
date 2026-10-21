#!/usr/bin/env python3
# coding: utf-8
"""对照本包已通过的总览 scene，检查后续内页的外围模块。"""

import argparse
import json
import re
from pathlib import Path


def load(path):
    return json.loads(Path(path).read_text())['elements']


def one(elements, label, predicate, errors):
    found = [e for e in elements if predicate(e)]
    if len(found) != 1:
        errors.append(f'{label}: 预期 1 个元素，找到 {len(found)} 个')
        return None
    return found[0]


def same(label, a, b, fields, errors):
    if not a or not b:
        return
    for field in fields:
        av, bv = a.get(field), b.get(field)
        if isinstance(av, (int, float)) and isinstance(bv, (int, float)):
            equal = abs(av - bv) < .02
        else:
            equal = av == bv
        if not equal:
            errors.append(f'{label}.{field}: 总览={av!r} 当前页={bv!r}')


def text_starts(prefix):
    return lambda e: e['type'] == 'text' and e.get('text', '').startswith(prefix)


def text_is(value):
    return lambda e: e['type'] == 'text' and e.get('text') == value


def page_number(e):
    return e['type'] == 'text' and re.match(r'^第\d+页', e.get('text', '')) is not None


def nav_codes(elements):
    return sorted((e for e in elements if e['type'] == 'text' and e['x'] >= 900
                   and re.fullmatch(r'P\d\d(?:–\d\d)?', e.get('text', ''))), key=lambda e: e['y'])


def covers(code, page):
    start = int(code[1:3])
    end = int(code[-2:]) if '–' in code else start
    return start <= page <= end


def compare(reference, candidate):
    errors = []
    text_fields = ['x', 'y', 'fontSize', 'fontFamily', 'strokeColor', 'textAlign', 'lineHeight']
    text_box_fields = text_fields + ['width', 'height']
    shape_fields = ['x', 'y', 'width', 'height', 'strokeColor', 'backgroundColor', 'strokeWidth', 'roughness']
    pairs = [
        ('页眉', text_starts('专辑：'), text_fields + ['height']),
        ('页脚来源', text_starts('节目：《'), text_box_fields),
        ('页码', page_number, text_box_fields),
    ]
    for label, predicate, fields in pairs:
        same(label, one(reference, label, predicate, errors),
             one(candidate, label, predicate, errors), fields, errors)

    for title in ['整包内容地图', '本页提纲']:
        left = sorted((e for e in reference if text_is(title)(e)), key=lambda e: (e['x'], e['y']))
        right = sorted((e for e in candidate if text_is(title)(e)), key=lambda e: (e['x'], e['y']))
        if len(left) != len(right):
            errors.append(f'{title}: 总览 {len(left)} 层，当前页 {len(right)} 层')
        for i, (a, b) in enumerate(zip(left, right)):
            same(f'{title}[{i}]', a, b, text_box_fields, errors)

    left_codes, right_codes = nav_codes(reference), nav_codes(candidate)
    if [e['text'] for e in left_codes] != [e['text'] for e in right_codes]:
        errors.append('整包地图的页段与通过版不一致')
    for i, (a, b) in enumerate(zip(left_codes, right_codes)):
        same(f'地图页段[{i}]', a, b, text_fields, errors)
        ref_label = None
        for side, elements, code in [('总览', reference, a), ('当前页', candidate, b)]:
            label = [e for e in elements if e['type'] == 'text' and e['x'] == 930
                     and abs(e['y'] - (code['y'] + 28)) < .02]
            if len(label) != 1:
                errors.append(f'{side}地图主题[{i}]: 预期 1 个，找到 {len(label)} 个')
            elif side == '总览':
                ref_label = label[0]
            else:
                same(f'地图主题[{i}]', ref_label, label[0], text_fields, errors)

    page = one(candidate, '当前页码', page_number, errors)
    ref_marker = one(reference, '总览当前主题标记', lambda e: e['type'] == 'rectangle'
                     and e['x'] == 922 and e['width'] == 4 and e['height'] == 55, errors)
    if page:
        match = re.match(r'第(\d+)页', page['text'])
        current_page = int(match.group(1)) if match else None
        if current_page is None:
            errors.append('页码格式不能识别当前页')
        else:
            current_code = next((e for e in right_codes if covers(e['text'], current_page)), None)
            marker = one(candidate, '地图当前主题标记', lambda e: e['type'] == 'rectangle'
                         and e['x'] == 922 and e['width'] == 4 and e['height'] == 55, errors)
            same('地图当前主题标记', ref_marker, marker,
                 ['x', 'width', 'height', 'strokeColor', 'backgroundColor'], errors)
            if current_code and marker and abs(marker['y'] - current_code['y'] - 1) >= .02:
                errors.append('地图当前主题标记未对齐当前页段')

    for label, predicate in [
        ('页眉色条', lambda e: e['type'] == 'rectangle' and e['x'] == 80 and e['y'] == 62),
        ('导航底板', lambda e: e['type'] == 'rectangle' and e['x'] == 911 and 300 < e['y'] < 400),
        ('导航界线', lambda e: e['type'] == 'line' and e['x'] == 911 and 300 < e['y'] < 400),
        ('地图提纲分隔线', lambda e: e['type'] == 'line' and e['x'] == 929 and 900 < e['y'] < 1000),
        ('页脚分隔线', lambda e: e['type'] == 'line' and e['x'] == 80 and e['y'] > 1450),
    ]:
        same(label, one(reference, label, predicate, errors),
             one(candidate, label, predicate, errors), shape_fields, errors)

    for side, elements in [('总览', reference), ('当前页', candidate)]:
        badges = sorted((e for e in elements if e['type'] == 'ellipse' and e['x'] == 930
                         and 1000 <= e['y'] < 1270), key=lambda e: e['y'])
        if side == '总览':
            ref_badges = badges
        else:
            if len(badges) > len(ref_badges):
                errors.append('本页提纲条数超出已通过版的可用位置')
            for i, (a, b) in enumerate(zip(ref_badges, badges)):
                same(f'提纲序号圆[{i}]', a, b, shape_fields, errors)
                number = one(elements, f'提纲数字[{i}]', lambda e: e['type'] == 'text'
                             and e.get('text') == str(i + 1) and e['x'] == 930
                             and abs(e['y'] - (b['y'] + 1.7)) < .02, errors)
                ref_number = one(reference, f'总览提纲数字[{i}]', lambda e: e['type'] == 'text'
                                 and e.get('text') == str(i + 1) and e['x'] == 930
                                 and abs(e['y'] - (a['y'] + 1.7)) < .02, errors)
                same(f'提纲数字[{i}]', ref_number, number, text_box_fields, errors)
                label = one(elements, f'提纲条目[{i}]', lambda e: e['type'] == 'text'
                            and e['x'] == 970 and abs(e['y'] - (b['y'] + 2)) < .02, errors)
                ref_label = one(reference, f'总览提纲条目[{i}]', lambda e: e['type'] == 'text'
                                and e['x'] == 970 and abs(e['y'] - (a['y'] + 2)) < .02, errors)
                same(f'提纲条目[{i}]', ref_label, label, text_fields, errors)
    notes = sorted((e for e in candidate if e['type'] == 'text' and e['x'] == 930
                    and 1270 <= e['y'] < 1400), key=lambda e: e['y'])
    ref_note = one(reference, '总览提纲关系说明首行', lambda e: e['type'] == 'text'
                   and e['x'] == 930 and e['y'] == 1287, errors)
    for i, note in enumerate(notes):
        if abs(note['y'] - (1287 + i * 33)) >= .02:
            errors.append(f'提纲关系说明[{i}]未沿用通过版的行距')
        same(f'提纲关系说明[{i}]', ref_note, note,
             ['x', 'fontSize', 'fontFamily', 'strokeColor', 'textAlign', 'lineHeight'], errors)
    return errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('approved_overview_scene')
    parser.add_argument('candidate_scene')
    args = parser.parse_args()
    problems = compare(load(args.approved_overview_scene), load(args.candidate_scene))
    print(json.dumps({'status': 'pass' if not problems else 'fail', 'errors': problems}, ensure_ascii=False, indent=2))
    raise SystemExit(bool(problems))
