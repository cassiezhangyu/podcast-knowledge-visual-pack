#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""绑定本页创作输入，生成精简任务；不审批内容、不判断图片质量。"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from user_requirements import checked_asset, resolve_requirements


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
                 output, source_page_id=None, approval=None, series_contract=None, page_contract=None, approved_details=None, user_requirements=None, creation_stage="page"):
    if creation_stage not in {"expression", "page"}:
        raise ValueError("创作阶段须为expression或page")
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
        'quality_standards': bind(skill / 'rules/page_quality_check.md', 'text'),
        'context_rules': bind(skill / 'rules/visual_creation_context.md', 'text'),
        'reference_selection_rules': bind(skill / 'rules/acceptance_case_index.md', 'text'),
        'taste': bind(skill / 'taste.md', 'text'),
    }
    if creation_stage == "expression":
        inputs["translation_examples"] = bind(skill / "rules/visual_translation_examples.md", "text")
    if approved_details:
        inputs['approved_details'] = [bind(p, 'text') for p in approved_details]
    if approval:
        inputs['approval'] = bind(approval, 'json')
    if page_contract:
        inputs['page_contract'] = bind(page_contract, 'json')
        declared = json.loads(Path(page_contract).read_text(encoding='utf-8')).get('user_requirements')
        if declared:
            inputs['user_requirements'] = checked_asset(declared)[0]
    if user_requirements:
        explicit = bind(user_requirements, 'json')
        if inputs.get('user_requirements') and inputs['user_requirements'] != {k: explicit[k] for k in ['path', 'sha256']}:
            raise ValueError('显式用户条件与当前页面合同不一致')
        inputs['user_requirements'] = {k: explicit[k] for k in ['path', 'sha256']}
    resolve_requirements(inputs)
    if series_contract:
        inputs['series_contract'] = bind(series_contract, 'text')
    packet = {
        'version': 1, 'creation_stage': creation_stage, 'page_id': page_id, 'source_page_id': source_page_id,
        'inputs': inputs, 'scope': '本页创作输入；审批仍由原内容门禁核验',
        'approval_verified_by_this_script': False,
        'visual_quality_verified_by_this_script': False,
        'context_policy': {
            'creation_executor': 'current_context',
            'max_new_agents_per_user_task': 0,
            'reviewer_policy': 'disabled',
            'nested_delegation_allowed': False,
        },
    }
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    (output / 'CREATION_PACKET.json').write_text(
        json.dumps(packet, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    task = f'''# 当前页面创作任务

工作页：{page_id}；来源页：{source_page_id}。页号映射由协调者提供，不能自行换内容。

## 执行方式

当前主会话完成创作与作者自检；不创建或调用审核agent，不要求独立审核报告、陌生首读或TARGET。按标准流程绘制并输出，保留技术检查与用户已明确的内容确认。

## 读取与参考

读取CREATION_PACKET.json绑定的完整内容、明细、当前参数、配色与规则。页号、导航、来源和批准范围以page_contract为准，由协调者核验审批；装包不审批或判级。实看全部绑定正反图，按reference_selection_rules核对本页基准与相关案例。

开始内容表达与试画前，读取creation_rules第1节共同标准、quality_standards适用要求及taste。把标准落实为当前图的绘制决定；从规划、试画到精修主动自检，已知基本缺口先解决。标准用于作者自检，不产生额外审核任务。

有user_requirements时，读取其中用户明确提出的条件；在绘制前预检inputs同时绑定当前creation_packet和同一user_requirements。自检沿用这些条件逐项记录当前实图证据。

## 本页绘制决定

先按page_content_planning做视觉编辑：将批准含义合并为追踪、比较、辨别或条件判断任务，说明共同结构和不可替代文字。用真实表达草图兑现main_visual_explanation，再放回整页；反复失败时按visual_reasoning做同含义的实际对照，不用方案说明代替画面证据。

按visual_reasoning第1–3节，先从来源中的比较依据选择解释载体，再安排段落与栏位；把主体和可图解支撑的绘制决定写入main_visual_explanation、text_graphic_split及references.effect_on_page。整页草图中实际指认参考做法的兑现处。有认可基线时先明确改善目标与保留优势。

以当前内容合同选定的必要判断、支撑与边界为上图范围，完整来源明细只供核实。按page_content_planning先核细节的论证职责；同职责例子可合并，图已解释的关系不再复写长段。核对所保留含义的主体、模态、条件及当版可见证据，不把全部来源detail或旧清单条数当上图目标。必要内容取舍尚未确认时先修内容合同，不在绘制时偷偷删减。

## 整页原型与完整制作

先按page_content_planning确认主图语义构思；默认三案时，按visual_reasoning渲染三张有实质构图差异的整页草图，用当前正常字级保留全部必要含义及不可由图形替代的文字、边界和外围，比较关系、载体、焦点、疏密与阅读路径。原型按visual_reasoning检查关系充分性、构图、容量和完成潜力，再精修、自检并输出。三案逐案完成，不要求独立报告。完整阶段复看当前原图、390px和灰度，不能将机械通过当作语义或审美充分。

使用原生可编辑Excalidraw，image=0、files={{}}，遵守当前字级、笔触和配色；交回scene、三种真实PNG及输入绑定。

首轮仅用本页输入，不加载其他页构图代码、旧失败图或旧作者结论；技术实现与限定返工按需回查并注明用途。来源外事实仍走内容批准门禁。
'''
    if creation_stage == 'expression':
        task = task.split('## 本页绘制决定')[0] + """## 当前停点：关键表达试画

按visual_reasoning的关键难点表达探索与rules/visual_translation_examples.md，先选最影响理解的难点，实看引用参考，画出不同视觉编码的实际草图。固定同一批准含义、必要条件与正常字级，指明语义映射、不可替代文字及隐喻边界。提交原生草图、真实PNG及来源/输入绑定，由当前主会话核对实际解释收益；不伪造独立读回。当前只完成表达试验，不展开整页排版；局部收益不证明全文框架。表达未突破、容量冲突或绘制能力不足时，按规则分别处理，保留当前工件与真实停点。
"""
    (output / 'CREATOR_TASK.md').write_text(task, encoding='utf-8')
    return packet


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--creation-stage', choices=['expression', 'page'], default='page')
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
    parser.add_argument('--user-requirements', type=Path)
    args = parser.parse_args()
    try:
        packet = build_packet(args.skill, args.page_id, args.content, args.tokens,
                              args.palette, args.positive, args.negative, args.output,
                              args.source_page_id, args.approval, args.series_contract, args.page_contract, args.approved_details, args.user_requirements, args.creation_stage)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps({'page_id': packet['page_id'], 'output': str(args.output.resolve()),
                      'approval_verified': False, 'visual_quality_verified': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()
