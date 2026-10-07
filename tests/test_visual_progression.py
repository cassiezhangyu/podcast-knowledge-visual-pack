import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

p = Path(__file__).resolve().parents[1] / 'scripts/check_visual_progression.py'
spec = importlib.util.spec_from_file_location('progression', p)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ProgressionRisks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        def bound(name, content):
            p = root / name
            p.write_text(content)
            return {'path': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
        self.asset = bound('scene.excalidraw', json.dumps({'elements': [], 'files': {}}))
        image = bound('preview.png', '此测试仅验证绑定，不模拟真实视觉通过')
        self.report = {'stage': 'prototype', 'page_id': '测试页',
                       'creator_context_id': 'creator', 'reviewer_context_id': 'reader',
                       'inputs': [bound('content.md', '已批准内容')],
                       'three_methods_passed': True, 'method_evidence': '三种不同观察操作',
                       'composition_diversity_passed': True,
                       'composition_comparison': '主体位置和证据邻接不同，实际缩略图路径各自清楚',
                       'cases': [{'case': c, 'prototype_pass': True, 'grade': 'TARGET',
                                  'readback': '读回', 'visible_evidence': '定位依据',
                                  'core_explanation_sufficient': True, 'blocking_errors': [],
                                  'composition_passed': True,
                                  'composition_evidence': {
                                      'main_organization': '主体与条件支撑相邻，解释区优先',
                                      'evidence_placement': '条件和边界贴近对应判断',
                                      'reading_path': '主入口后比较条件，收束到有依据的结论',
                                      'content_fit': '条件比较需要并置，位置减少段落匹配'},
                                  'series_repetition_check': '已对照相邻原图，本页条件并置与前页案例组织不同',
                                  'full_build_ready': True,
                                  'full_build_readiness_evidence': {
                                      'visual_responsibility': '同一对象的两种条件紧邻，降低逐段匹配负担',
                                      'composition': '主对照紧凑，条件和限定紧邻对应处，全部正常字号可读',
                                      'reference_gap_and_plan': '焦点成立；按正例细化条件对应处的文字轨道'},
                                  'visual_gain_counterproof': {'simple_alternative': '具体比较负担', 'remove_subject': '失去核心判断依据'},
                                  'explanatory_gain': '比较负担降低', 'reference_comparison': '正例对应局部',
                                  'current': {'scene': self.asset, 'png': image, 'phone': image, 'gray': image}}
                                 for c in 'ABC']}
    def tearDown(self):
        self.tmp.cleanup()
    def test_bound_record_and_no_mutation(self):
        before = copy.deepcopy(self.report)
        self.assertEqual(module.validate(self.report, 'prototype'), [])
        self.assertEqual(self.report, before)
    def test_same_context_cannot_release(self):
        self.report['reviewer_context_id'] = 'creator'
        self.assertTrue(module.validate(self.report, 'prototype'))
    def test_changed_scene_invalidates_review(self):
        Path(self.asset['path']).write_text('改变后的场景')
        self.assertTrue(module.validate(self.report, 'prototype'))
    def test_method_failure_blocks_full_construction(self):
        self.report['three_methods_passed'] = False
        self.assertTrue(module.validate(self.report, 'prototype'))
    def test_b_candidate_blocks_expansion(self):
        self.report['stage'] = 'page'
        self.report['cases'][1]['grade'] = 'REJECT-B'
        self.assertTrue(module.validate(self.report, 'page'))
    def test_prototype_cannot_release_page(self):
        self.assertTrue(module.validate(self.report, 'page'))
    def test_native_scene_cannot_embed_bitmap(self):
        p = Path(self.asset['path'])
        p.write_text(json.dumps({'elements': [{'type': 'image'}], 'files': {}}))
        self.asset['sha256'] = hashlib.sha256(p.read_bytes()).hexdigest()
        self.assertTrue(module.validate(self.report, 'prototype'))

    def test_all_b_cannot_be_shown(self):
        self.report['stage'] = 'page'
        for c in self.report['cases']: c['grade'] = 'REJECT-B'
        self.assertTrue(module.validate(self.report, 'selection'))
    def test_one_target_can_be_shown_but_not_batch_released(self):
        self.report['stage'] = 'page'
        for c in self.report['cases'][1:]: c['grade'] = 'REJECT-B'
        self.assertEqual(module.validate(self.report, 'selection'), [])
        self.assertTrue(module.validate(self.report, 'page'))
    def test_content_blocker_prevents_selection(self):
        self.report['stage'] = 'page'
        self.report['cases'][1]['blocking_errors'] = ['来源错误']
        self.assertTrue(module.validate(self.report, 'selection'))
    def test_a_cannot_hide_behind_one_target(self):
        self.report['stage'] = 'page'
        self.report['cases'][2]['grade'] = 'REJECT-A'
        self.assertTrue(module.validate(self.report, 'selection'))
    def test_readback_does_not_prove_core_sufficiency(self):
        self.report['cases'][0]['core_explanation_sufficient'] = False
        self.assertTrue(module.validate(self.report, 'prototype'))
    def test_missing_counterproof_blocks_prototype(self):
        del self.report['cases'][0]['visual_gain_counterproof']['remove_subject']
        self.assertTrue(module.validate(self.report, 'prototype'))
    def test_target_requires_quality_evidence(self):
        self.report['stage'] = 'page'
        del self.report['cases'][0]['reference_comparison']
        self.assertTrue(module.validate(self.report, 'selection'))
    def test_single_case_is_internal_only(self):
        self.report['cases'] = self.report['cases'][:1]
        self.report['three_methods_passed'] = False
        self.assertEqual(module.validate(self.report, 'prototype', 'A'), [])
        self.report['stage'] = 'page'
        self.assertEqual(module.validate(self.report, 'page', 'A'), [])
        self.assertTrue(module.validate(self.report, 'selection', 'A'))
    def test_selection_still_checks_current_hash(self):
        self.report['stage'] = 'page'
        Path(self.asset['path']).write_text('已改变')
        self.assertTrue(module.validate(self.report, 'selection'))

    def test_readable_core_without_build_potential_blocks_refinement(self):
        case = self.report['cases'][0]
        case['full_build_ready'] = False
        self.assertTrue(case['core_explanation_sufficient'])
        self.assertIn('A完整构建准备度未获独立确认', module.validate(self.report, 'prototype'))

    def test_old_prototype_requires_current_readiness_review(self):
        for case in self.report['cases']:
            del case['full_build_ready']
            del case['full_build_readiness_evidence']
        original = copy.deepcopy(self.report)
        self.assertTrue(module.validate(self.report, 'prototype'))
        self.assertEqual(self.report, original)

    def test_readiness_flag_without_specific_evidence_blocks_refinement(self):
        for value in [None, {}, {'visual_responsibility': '有对照', 'composition': '可读',
                                 'reference_gap_and_plan': '  '},
                      {'visual_responsibility': True, 'composition': '可读',
                       'reference_gap_and_plan': '修改状态对照'}]:
            with self.subTest(evidence=value):
                self.report['cases'][0]['full_build_readiness_evidence'] = value
                self.assertTrue(module.validate(self.report, 'prototype'))

    def test_compact_condition_diagram_needs_no_extra_mechanism(self):
        self.report['cases'] = self.report['cases'][:1]
        self.report['three_methods_passed'] = False
        self.assertEqual(module.validate(self.report, 'prototype', 'A'), [])

    def test_existing_full_report_needs_no_retroactive_readiness_fields(self):
        self.report['stage'] = 'page'
        for case in self.report['cases']:
            del case['full_build_ready']
            del case['full_build_readiness_evidence']
        self.assertEqual(module.validate(self.report, 'page'), [])
        self.assertEqual(module.validate(self.report, 'selection'), [])

    def test_different_methods_do_not_prove_composition_diversity(self):
        self.report['stage'] = 'page'
        self.report['composition_diversity_passed'] = False
        self.assertTrue(self.report['three_methods_passed'])
        self.assertIn('整页构图探索与三案比较尚未成立', module.validate(self.report, 'selection'))

    def test_readable_core_with_unsuitable_composition_blocks_single_build(self):
        self.report['cases'] = self.report['cases'][:1]
        self.report['cases'][0]['composition_passed'] = False
        self.assertIn('A整页构图适配未获独立确认', module.validate(self.report, 'prototype', 'A'))

    def test_new_report_requires_current_composition_evidence_without_mutation(self):
        for case in self.report['cases']:
            del case['composition_passed']
            del case['composition_evidence']
        before = copy.deepcopy(self.report)
        self.assertTrue(module.validate(self.report, 'prototype'))
        self.assertEqual(self.report, before)

    def test_composition_flag_does_not_replace_specific_evidence(self):
        for value in [None, {}, {'main_organization': True, 'evidence_placement': '邻接',
                                'reading_path': '清楚', 'content_fit': '适合'},
                      {'main_organization': '主体', 'evidence_placement': '邻接',
                       'reading_path': '清楚', 'content_fit': '  '}]:
            with self.subTest(evidence=value):
                self.report['cases'][0]['composition_evidence'] = value
                self.assertTrue(module.validate(self.report, 'prototype', 'A'))

    def test_actual_peer_comparison_required_for_target(self):
        self.report['stage'] = 'page'
        self.report['cases'][0]['series_repetition_check'] = ''
        self.assertTrue(module.validate(self.report, 'selection'))

if __name__ == '__main__':
    unittest.main()
