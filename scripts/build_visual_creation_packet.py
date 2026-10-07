#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""绑定本页创作输入，生成精简任务；不审批内容、不判断图片质量。"""
import argparse
import hashlib
import json
import re
from pathlib import Path


def bind(path, kind):
    path = Path(path).resolve()
    data = path.read_bytes()
    if not data:
        raise ValueError('输入为空: ' + str(path))
    if kind == 'image' and not (
        data.startswith(b'\x89PNG\r\n\x1a\n') or data.startswith(b'\xff\xd8\xff')
        or (data.startswith(b'RIFF') and data[8:12] == b'WEBP')
    ):
        raise ValueError('参考不是支持的图片文件: ' + str(path))
    if kind == 'json' and not isinstance(json.loads(data), dict):
        raise ValueError('参数文件须为JSON对象: ' + str(path))
    return {'path': str(path), 'sha256': hashlib.sha256(data).hexdigest(), 'kind': kind}


def build_packet(skill, page_id, content, tokens, palette, positive, negative,
                 output, source_page_id=None, approval=None, series_contract=None, page_contract=None, approved_details=None):
    skill = Path(skill).resolve()
    if not re.fullmatch(r'P\d{2,}', page_id):
        raise ValueError('工作页号格式应为P01等')
    text = Path(content).read_text(encoding='utf-8')
    match = re.search(r'^#\s*(P\d+)\b', text, re.MULTILINE)
    detected = match.group(1) if match else None
    source_page_id = source_page_id or page_id
    if detected and detected != source_page_id:
        raise ValueError('内容包页号与声明来源页号不一致；请核对页号映射')
    if not positive or not negative:
        raise ValueError('须提供实际正例和反例图片')
    inputs = {
        'content': bind(content, 'text'), 'tokens': bind(tokens, 'json'),
        'palette': bind(palette, 'json'),
        'positive': [bind(p, 'image') for p in positive],
        'negative': [bind(p, 'image') for p in negative],
        'creation_rules': bind(skill / 'rules/visual_reasoning.md', 'text'),
        'context_rules': bind(skill / 'rules/visual_creation_context.md', 'text'),
        'reference_selection_rules': bind(skill / 'rules/acceptance_case_index.md', 'text'),
        'taste': bind(skill / 'taste.md', 'text'),
    }
    if approved_details:
        inputs['approved_details'] = [bind(p, 'text') for p in approved_details]
    if approval:
        inputs['approval'] = bind(approval, 'json')
    if page_contract:
        inputs['page_contract'] = bind(page_contract, 'json')
    if series_contract:
        inputs['series_contract'] = bind(series_contract, 'text')
    packet = {
        'version': 1, 'page_id': page_id, 'source_page_id': source_page_id,
        'inputs': inputs, 'scope': '本页创作输入；审批仍由原内容门禁核验',
        'approval_verified_by_this_script': False,
        'visual_quality_verified_by_this_script': False,
        'context_policy': {'preferred_fork_turns': 'none', 'history_included': False},
    }
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    (output / 'CREATION_PACKET.json').write_text(
        json.dumps(packet, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    task = f'''# 当前页面创作任务

工作页：{page_id}；来源页：{source_page_id}。页号映射由协调者提供，不能自行换内容。

## 读取与参考

读取CREATION_PACKET.json绑定的完整内容、明细、当前参数、配色与规则。页号、导航、来源和批准范围以page_contract为准，由协调者核验审批；装包不审批或判级。实看全部绑定正反图，按reference_selection_rules核对本页基准与相关案例。

## 本页绘制决定

先决定读者要完成的判断、可见依据、主体与支撑的空间职责，写入main_visual_explanation、text_graphic_split。把参考的解释做法和画面质量落实到本页，重新选择对象与构图。有认可基线时先明确改善目标与保留优势。

## 整页原型与完整制作

新构图按visual_reasoning渲染两种潜力草图，用当前正常字级放入全部必留正文、边界和外围，比较关系、焦点、疏密与阅读路径。隔离审核确认核心充分性、整页构图和完整构建准备度后，精修最强一案至完整TARGET，再按授权补齐候选。完整阶段加载逐页实现及审核协议；复看当前原图、390px和灰度。机械检查、自检和原型准入不代签TARGET。

使用原生可编辑Excalidraw，image=0、files={{}}，遵守当前字级、笔触和配色；交回scene、三种真实PNG及输入绑定。

首轮仅用本页输入，不加载其他页构图代码、旧失败图或旧作者结论；技术实现与限定返工按需回查并注明用途。来源外事实仍走内容批准门禁。
'''
    (output / 'CREATOR_TASK.md').write_text(task, encoding='utf-8')
    return packet


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skill', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--page-id', required=True)
    parser.add_argument('--source-page-id')
    for name in ['content', 'tokens', 'palette', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    for name in ['positive', 'negative']:
        parser.add_argument('--' + name, type=Path, action='append', required=True)
    parser.add_argument('--approval', type=Path)
    parser.add_argument('--series-contract', type=Path)
    parser.add_argument('--page-contract', type=Path)
    parser.add_argument('--approved-details', type=Path, action='append')
    args = parser.parse_args()
    try:
        packet = build_packet(args.skill, args.page_id, args.content, args.tokens,
                              args.palette, args.positive, args.negative, args.output,
                              args.source_page_id, args.approval, args.series_contract, args.page_contract, args.approved_details)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps({'page_id': packet['page_id'], 'output': str(args.output.resolve()),
                      'approval_verified': False, 'visual_quality_verified': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()
