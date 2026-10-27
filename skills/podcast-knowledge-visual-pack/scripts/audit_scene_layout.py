#!/usr/bin/env python3
"""渲染前诊断文字容量、间距和曲线路径；发现风险不自动改字、缩字或判级。"""
import argparse
import json
import math
from pathlib import Path


def diagnose(scene, tokens, min_gap=12):
    active = [e for e in scene['elements'] if not e.get('isDeleted')]
    findings = []
    texts = []
    strong = tokens['typography']['strong_inner_roles']
    for e in active:
        if e['type'] != 'text':
            continue
        if any(e.get('text') == t.get('text') and e.get('strokeColor') == t.get('strokeColor')
               and e.get('fontSize') == t.get('fontSize')
               and e.get('customData', {}).get('typography_role') == t.get('customData', {}).get('typography_role')
               and e.get('customData', {}).get('typography_role') in strong
               and .5 <= abs(e['x'] - t['x']) <= 1.5 and abs(e['y'] - t['y']) <= .5 for t in texts):
            continue
        texts.append(e)
        estimated = max(1, len(e.get('text', '').split('\n'))) * e['fontSize'] * e.get('lineHeight', 1.25)
        if estimated > e['height'] + 1:
            findings.append({'kind': 'text_height_budget', 'ids': [e['id']], 'estimated_height': estimated, 'declared_height': e['height']})
    for i, a in enumerate(texts):
        for b in texts[i + 1:]:
            if a.get('angle', 0) or b.get('angle', 0):
                continue
            if a['x'] < b['x'] + b['width'] and b['x'] < a['x'] + a['width']:
                first, second = sorted([a, b], key=lambda e: e['y'])
                gap = second['y'] - first['y'] - max(first['height'], len(first.get('text', '').split('\n')) * first['fontSize'] * first.get('lineHeight', 1.25))
                if gap < min_gap:
                    findings.append({'kind': 'text_gap_risk', 'ids': [first['id'], second['id']], 'gap': gap, 'diagnostic_min_gap': min_gap})
    limits = tokens['stroke']['path_limits']
    for e in active:
        role = e.get('customData', {}).get('stroke_role')
        points = e.get('points', [])
        if role == 'curve' and len(points) > limits['curve_max_points']:
            findings.append({'kind': 'curve_control_points', 'ids': [e['id']], 'points': len(points)})
        length = sum(math.dist(a, b) for a, b in zip(points, points[1:]))
        if role in ['relation', 'emphasis', 'curve'] and length > limits['long_path_px'] and e.get('roughness', 0) > limits['long_path_max_roughness']:
            findings.append({'kind': 'long_path_stroke_risk', 'ids': [e['id']], 'length': length, 'roughness': e['roughness']})
        if e['type'] == 'ellipse' and max(e['width'], e['height']) > limits['large_ellipse_px'] and e.get('roughness', 0) > limits['large_ellipse_max_roughness']:
            findings.append({'kind': 'ellipse_stroke_risk', 'ids': [e['id']]})
    return {'kind': 'scene_layout_diagnostic', 'status': 'needs_rendered_review' if findings else 'no_static_risks_detected', 'findings': findings,
            'limits': '间距和曲线阈值仅筛查风险；旋转文字间距、真实字形、语义归属及容量仍按整页PNG审核。合法虚线和复杂物件路径不因样式或点数被全局拒绝。'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scene')
    parser.add_argument('--design-tokens', default=str(Path(__file__).resolve().parents[1] / 'design_tokens.json'))
    parser.add_argument('--min-gap', type=float, default=12)
    parser.add_argument('--output')
    args = parser.parse_args()
    result = diagnose(json.loads(Path(args.scene).read_text()), json.loads(Path(args.design_tokens).read_text()), args.min_gap)
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        Path(args.output).write_text(text)
    print(text)
