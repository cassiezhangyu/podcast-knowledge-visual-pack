"""只测试用户条件的传递/失效/逐项记录，不模拟视觉质量。"""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = (Path(__file__).resolve().parents[2])
sys.path.insert(0, str(ROOT / 'scripts'))
from user_requirements import resolve_requirements, check_requirements
from check_visual_progression import validate


class UserRequirementsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.data = {'required_outcomes': [{'id': 'U1', 'requirement': '依据指向判断', 'verification': '指认双方'}, {'id': 'U2', 'requirement': '边界对象明确', 'verification': '逐项对应'}]}
        self.req = self.write('requirements.json', self.data)
        self.creation = self.write('creation.json', {'inputs': {'user_requirements': self.req}})
        self.result = {'basis': self.req, 'results': [{'id': x['id'], 'status': 'pass', 'visible_evidence': '当前图可定位的对应证据'} for x in self.data['required_outcomes']]}

    def write(self, name, data):
        p = self.root / name
        p.write_text(data if isinstance(data, str) else json.dumps(data), encoding='utf-8')
        return {'path': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}

    def test_no_conditions_is_compatible(self):
        self.assertIsNone(resolve_requirements({}))
        check_requirements(None, None)

    def test_consistent_chain_passes(self):
        self.assertEqual(resolve_requirements({'creation_packet': self.creation, 'user_requirements': self.req}), self.req)
        check_requirements(self.req, self.result)

    def test_omitted_preflight_condition_is_rejected(self):
        with self.assertRaisesRegex(ValueError, '漏传'):
            resolve_requirements({'creation_packet': self.creation})

    def test_different_chain_version_is_rejected(self):
        other = self.write('other.json', self.data)
        with self.assertRaisesRegex(ValueError, '版本不一致'):
            resolve_requirements({'creation_packet': self.creation, 'user_requirements': other})

    def test_modified_user_file_invalidates_binding(self):
        Path(self.req['path']).write_text('{}')
        with self.assertRaisesRegex(ValueError, '已变化'):
            check_requirements(self.req, self.result)

    def test_missing_duplicate_failed_and_empty_evidence_are_rejected(self):
        for mutation in ['missing', 'duplicate', 'fail', 'empty', 'stale_basis']:
            with self.subTest(mutation=mutation):
                result = copy.deepcopy(self.result)
                if mutation == 'missing': result['results'].pop()
                if mutation == 'duplicate': result['results'][1]['id'] = 'U1'
                if mutation == 'fail': result['results'][1]['status'] = 'fail'
                if mutation == 'empty': result['results'][1]['visible_evidence'] = ' '
                if mutation == 'stale_basis': result['basis']['sha256'] = '0' * 64
                with self.assertRaises(ValueError): check_requirements(self.req, result)

    def test_prepare_and_progression_transport_and_enforce_conditions(self):
        # 人工构造传输fixture，不声称这些占位字节经过真实渲染或视觉通过。
        scene = self.write('page.excalidraw', {'elements': [], 'files': {}})
        image = self.write('page.png', '仅绑定fixture')
        content = self.write('content.md', '当前内容')
        taste = self.write('taste.md', '当前审美')
        tokens = self.write('tokens.json', json.loads((ROOT / 'design_tokens.json').read_text()))
        ref = self.write('ref.png', '仅参考绑定fixture')
        inputs = {'creation_packet': self.creation, 'user_requirements': self.req}
        preflight = self.write('preflight.json', {
            'page_id': 'P01', 'role': 'cover', 'status': 'completed_before_construction',
            'content_sha256': content['sha256'], 'taste_sha256': taste['sha256'], 'design_tokens_sha256': tokens['sha256'],
            'inputs': inputs, 'references': [dict(ref, observed='真实规则要求具体观察证据', effect_on_page='本页应提供准确对应关系')],
            'main_visual_explanation': '具体状态对照解释本页判断', 'reading_path': '从标题进入判断及其依据',
            'text_graphic_split': '比较承担关系文字补足含义', 'mobile_type_plan': '正常字号下核验整页手机辨读',
            'color_role_plan': {k: '当前角色对应具体内容职责' for k in ['ink', 'primary', 'accent', 'weak']},
            'forbidden_patterns': ['禁止无来源关系']})
        # prepare要求正反各一次；参考清单包含两次相同字节，不模拟视觉样本多样性。
        plan = json.loads(Path(preflight['path']).read_text());plan['references'] *= 2
        preflight = self.write('preflight.json', plan)
        os.utime(preflight['path'], (1, 1))
        renderer = self.write('renderer.txt', 'renderer fixture')
        required = ['preconstruction_reference_plan', 'native_scene', 'typography_roles_sizes_strong_weight', 'stroke_roles', 'static_text_geometry', 'reader_facing_text', 'outline_alignment', 'current_input_bindings', 'same_scene_real_export']
        record = self.write('mechanical.json', {'kind': 'mechanical_render_record', 'status': 'pass', 'checks': [{'name': n, 'status': 'pass'} for n in required], 'current': {'scene': scene, 'png': image, 'phone': image, 'gray': image}, 'tokens': tokens, 'preflight': preflight, 'renderer': renderer, 'brand_asset': ref, 'outline_check': {'status': 'not_applicable', 'reason': 'cover'}})
        pagecheck_data = {'page_id': 'P01', 'scene_sha256': scene['sha256'], 'png_sha256': image['sha256'], 'status': 'submitted_for_independent_review', 'checks': {k: {'status': 'pass', 'visible_evidence': '仅测试当前输入绑定字段'} for k in ['content_coverage', 'visual_explanation', 'reference_alignment', 'text_geometry', 'mobile_readability']}, 'user_requirements_check': self.result}
        pagecheck = self.write('pagecheck.json', pagecheck_data)
        out = self.root / 'packet.json'
        command = [sys.executable, str(ROOT / 'scripts/prepare_independent_review.py'), '--page-id', 'P01', '--role', 'cover', '--creator-context-id', 'creator', '--scene', scene['path'], '--png', image['path'], '--phone', image['path'], '--gray', image['path'], '--content', content['path'], '--positive', ref['path'], '--negative', ref['path'], '--taste', taste['path'], '--design-tokens', tokens['path'], '--preflight', preflight['path'], '--page-check', pagecheck['path'], '--mechanical-check', record['path'], '--design-gates', taste['path'], '--review-protocol', taste['path'], '--output', str(out)]
        run = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(out.read_text())['standards']['user_requirements'], self.req)
        quality_path = ROOT / 'rules/visual_reasoning.md'
        self.assertEqual(json.loads(out.read_text())['standards']['quality_criteria'], {
            'path': str(quality_path.resolve()),
            'sha256': hashlib.sha256(quality_path.read_bytes()).hexdigest()})
        del pagecheck_data['user_requirements_check']
        self.write('pagecheck.json', pagecheck_data)
        self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
        case = {'case': 'A', 'grade': 'TARGET', 'readback': '当前可见的真实读回', 'visible_evidence': '当前比较和归属证据', 'explanatory_gain': '对应匹配工作减少', 'reference_comparison': '实际正例中的对应组织', 'composition_passed': True, 'composition_evidence': {k: '仅测试记录完整性，不判断视觉' for k in ['main_organization', 'evidence_placement', 'reading_path', 'content_fit']}, 'series_repetition_check': '首张图无相邻图，仅核参考', 'current': {'scene': scene, 'png': image, 'phone': image, 'gray': image, 'mechanical_render_record': record}, 'unfamiliar_reader_check': {'status': 'pass', 'entry_and_path': '当前主入口与主阅读路径', 'graphic_text_gain': '对应对象匹配工作减少', 'whole_page_summary': '当前图的判断依据及限制', 'block_readback': [{'block': '主体', 'observed': '当前内容', 'expected': '当前内容', 'match': True}], 'summary_matches_approved_content': True, 'breakpoints': [], 'repairs': []}, 'user_requirements_check': self.result}
        report = {'stage': 'page', 'page_id': 'P01', 'creator_context_id': 'creator', 'reviewer_context_id': 'reviewer', 'inputs': [content], 'cases': [case]}
        self.assertEqual(validate(report, 'page', 'A'), [])
        del case['user_requirements_check']
        self.assertTrue(any('用户条件' in x for x in validate(report, 'page', 'A')))


if __name__ == '__main__': unittest.main()
