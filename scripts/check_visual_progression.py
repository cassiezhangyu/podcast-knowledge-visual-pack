#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验独立读回/三案报告的当前绑定与推进条件；不自动判断视觉质量。"""
import argparse
import hashlib
import json
from pathlib import Path


def validate(report, stage, case_id=None):
    errors = []
    if report.get('stage') != ('page' if stage == 'selection' else stage):
        errors.append('报告阶段与当前放行阶段不一致')
    creator = report.get('creator_context_id')
    reviewer = report.get('reviewer_context_id')
    if not creator or not reviewer or creator == reviewer:
        errors.append('缺少隔离审核上下文')
    if not report.get('page_id'):
        errors.append('缺少页面标识')
    if case_id is None and (report.get('three_methods_passed') is not True or not report.get('method_evidence')):
        errors.append('三种解释方法尚未成立')
    if case_id is None and (
        report.get('composition_diversity_passed') is not True
        or not isinstance(report.get('composition_comparison'), str)
        or not report['composition_comparison'].strip()
    ):
        errors.append('整页构图探索与三案比较尚未成立')
    inputs = list(report.get('inputs', []))
    if not inputs:
        errors.append('缺少内容、规范及参考输入绑定')
    cases = report.get('cases', [])
    expected_cases = [case_id] if case_id else ['A', 'B', 'C']
    if [x.get('case') for x in cases] != expected_cases:
        errors.append('当前候选不齐或标识不一致')
    if stage == 'selection' and case_id:
        errors.append('展示检查必须包含三案')
    if stage == 'selection' and not any(c.get('grade') == 'TARGET' for c in cases):
        errors.append('三案中没有完整TARGET，停止展示选择')
    for case in cases:
        name = case.get('case', '?')
        if not case.get('readback') or not case.get('visible_evidence'):
            errors.append(name + '缺少独立读回与可见依据')
        if case.get('composition_passed') is not True:
            errors.append(name + '整页构图适配未获独立确认')
        composition = case.get('composition_evidence', {})
        fields = ['main_organization', 'evidence_placement', 'reading_path', 'content_fit']
        if not isinstance(composition, dict) or not all(
            isinstance(composition.get(k), str) and composition[k].strip() for k in fields
        ):
            errors.append(name + '缺少主体、证据位置、路径或内容适配的构图证据')
        if not isinstance(case.get('series_repetition_check'), str) or not case['series_repetition_check'].strip():
            errors.append(name + '缺少实际相邻页面的构图重复检查')
        if stage == 'prototype':
            if case.get('prototype_pass') is not True:
                errors.append(name + '原型未获独立放行')
            if case.get('core_explanation_sufficient') is not True:
                errors.append(name + '核心解释未获独立充分性确认')
            proof = case.get('visual_gain_counterproof', {})
            if not isinstance(proof, dict) or not all(proof.get(k) for k in ['simple_alternative', 'remove_subject']):
                errors.append(name + '缺少简洁替代与移去主体的实图证据')
            if case.get('full_build_ready') is not True:
                errors.append(name + '完整构建准备度未获独立确认')
            readiness = case.get('full_build_readiness_evidence', {})
            fields = ['visual_responsibility', 'composition', 'reference_gap_and_plan']
            if not isinstance(readiness, dict) or not all(
                isinstance(readiness.get(k), str) and readiness[k].strip() for k in fields
            ):
                errors.append(name + '缺少视觉职责、整页构图或参考差距与精修方向证据')
        if stage == 'selection' and case.get('blocking_errors') != []:
            errors.append(name + '缺少无阻断确认或存在阻断错误')
        if stage == 'selection' and case.get('grade') not in ['TARGET', 'REJECT-B']:
            errors.append(name + '不具选择资格')
        if stage in ['page', 'selection'] and case.get('grade') == 'TARGET':
            if not case.get('explanatory_gain') or not case.get('reference_comparison'):
                errors.append(name + 'TARGET缺少实质解释收益及正例比较')
        if stage == 'page' and case.get('grade') != 'TARGET':
            errors.append(name + '完整页未达TARGET，停止批量扩产')
        current = case.get('current', {})
        for kind in ['scene', 'png', 'phone', 'gray']:
            if kind not in current:
                errors.append(name + '缺少' + kind + '绑定')
        inputs.extend(current.values())
    for bound in inputs:
        try:
            path = Path(bound['path'])
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest != bound['sha256']:
                errors.append(str(path) + '已变化，旧报告失效')
            if path.suffix == '.excalidraw':
                scene = json.loads(path.read_text())
                if scene.get('files') or any(e.get('type') == 'image' for e in scene.get('elements', [])):
                    errors.append(str(path) + '含嵌入位图')
        except (KeyError, OSError, TypeError, ValueError) as exc:
            errors.append('工件绑定不可核验: ' + str(exc))
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', choices=['prototype', 'page', 'selection'], required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--case', choices=['A', 'B', 'C'], dest='case_id', help='仅内部单案验证，不能用于展示')
    args = parser.parse_args()
    report = json.loads(args.report.read_text())
    errors = validate(report, args.stage, args.case_id)
    print(json.dumps({'stage': args.stage, 'page_id': report.get('page_id'),
                      'progression_allowed': not errors, 'errors': errors,
                      'semantic_judgment': 'independent_reviewer_required'}, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
