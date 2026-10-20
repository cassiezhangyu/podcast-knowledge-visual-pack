import importlib.util
import json
import tempfile
import sys
import unittest
from pathlib import Path


SCRIPT = (Path(__file__).resolve().parents[2]) / 'scripts/build_visual_creation_packet.py'
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location('creation_packet', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CreationPacketTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'rules').mkdir()
        for name in ['visual_reasoning.md', 'page_quality_check.md', 'visual_creation_context.md', 'acceptance_case_index.md', 'visual_translation_examples.md']:
            (self.root / 'rules' / name).write_text('当前规则', encoding='utf-8')
        (self.root / 'taste.md').write_text('当前审美', encoding='utf-8')
        self.content = self.root / 'page.md'
        self.content.write_text('# P06｜批准内容\n真实内容', encoding='utf-8')
        self.tokens = self.root / 'tokens.json'
        self.tokens.write_text('{"canvas": {"width": 1200}}')
        self.palette = self.root / 'palette.json'
        self.palette.write_text('{"primary": "#6656A6"}')
        self.image = self.root / 'reference.png'
        self.image.write_bytes(b'\x89PNG\r\n\x1a\nfixture')
        self.out = self.root / 'output'

    def build(self, **kwargs):
        params = dict(skill=self.root, page_id='P05', content=self.content,
                      tokens=self.tokens, palette=self.palette,
                      positive=[self.image], negative=[self.image], output=self.out,
                      source_page_id='P06')
        params.update(kwargs)
        return MODULE.build_packet(**params)

    def test_mapping_explicit_and_no_approval_or_quality_claim(self):
        result = self.build()
        self.assertEqual(result['source_page_id'], 'P06')
        self.assertFalse(result['approval_verified_by_this_script'])
        self.assertFalse(result['visual_quality_verified_by_this_script'])
        self.assertEqual(result['context_policy']['creation_executor'], 'current_context')
        self.assertEqual(result['context_policy']['max_new_agents_per_user_task'], 0)
        self.assertEqual(result['context_policy']['reviewer_policy'], 'disabled')
        self.assertFalse(result['context_policy']['nested_delegation_allowed'])

    def test_expression_dispatch_stops_before_page_production(self):
        result = self.build(creation_stage='expression')
        task = (self.out / 'CREATOR_TASK.md').read_text()
        self.assertEqual(result['creation_stage'], 'expression')
        self.assertNotIn('## 整页原型与完整制作', task)
        self.assertEqual(result['inputs']['content']['sha256'], MODULE.bind(self.content, 'text')['sha256'])

    def test_page_dispatch_retains_full_page_task(self):
        result = self.build(creation_stage='page')
        self.assertEqual(result['creation_stage'], 'page')
        self.assertIn('## 整页原型与完整制作', (self.out / 'CREATOR_TASK.md').read_text())

    def test_execution_boundary_survives_both_stage_templates(self):
        policies = []
        for stage in ['expression', 'page']:
            policies.append(self.build(creation_stage=stage)['context_policy'])
            task = (self.out / 'CREATOR_TASK.md').read_text()
            self.assertIn('当前主会话完成创作', task)
            self.assertIn('不创建或调用审核agent', task)
            self.assertNotIn('reviewer_context_id', task)
        self.assertEqual(policies[0], policies[1])

    def test_invalid_stage_rejected_before_writing(self):
        with self.assertRaises(ValueError):
            self.build(creation_stage='unrecognized')
        self.assertFalse(self.out.exists())

    def test_missing_mapping_fails_before_output(self):
        with self.assertRaises(ValueError):
            self.build(source_page_id=None)
        self.assertFalse(self.out.exists())

    def test_missing_reference_fails_before_output(self):
        with self.assertRaises(FileNotFoundError):
            self.build(positive=[self.root / 'missing.png'])
        self.assertFalse(self.out.exists())

    def test_text_renamed_png_is_rejected(self):
        self.image.write_text('not an image')
        with self.assertRaises(ValueError):
            self.build()
        self.assertFalse(self.out.exists())

    def test_hash_changes_with_current_source(self):
        first = self.build()['inputs']['content']['sha256']
        self.content.write_text('# P06｜当前新输入\n新内容', encoding='utf-8')
        second = self.build()['inputs']['content']['sha256']
        self.assertNotEqual(first, second)

    def test_current_page_contract_is_bound_without_claiming_approval(self):
        contract = self.root / 'current_contract.json'
        contract.write_text('{"working_pages": 16, "approval_scope": "协调者核验"}')
        result = self.build(page_contract=contract)
        self.assertEqual(result['inputs']['page_contract']['path'], str(contract.resolve()))
        self.assertFalse(result['approval_verified_by_this_script'])

    def test_approved_details_bound_without_automatic_approval(self):
        detail = self.root / 'approved_detail.md'
        detail.write_text('同一批准案例的比较依据', encoding='utf-8')
        result = self.build(approved_details=[detail])
        self.assertEqual(result['inputs']['approved_details'][0]['path'], str(detail.resolve()))
        self.assertFalse(result['approval_verified_by_this_script'])

    def test_missing_approved_details_fails_before_output(self):
        with self.assertRaises(FileNotFoundError):
            self.build(approved_details=[self.root / 'missing_detail.md'])
        self.assertFalse(self.out.exists())

    def test_user_conditions_auto_transferred_from_page_contract(self):
        req = self.root / 'requirements.json'
        req.write_text(json.dumps({'required_outcomes': [{'id': 'U1', 'requirement': '依据对应判断', 'verification': '当前图指认双方'}]}))
        bound = MODULE.bind(req, 'json')
        contract = self.root / 'contract.json'
        contract.write_text(json.dumps({'user_requirements': {k: bound[k] for k in ['path', 'sha256']}}))
        result = self.build(page_contract=contract)
        self.assertEqual(result['inputs']['user_requirements']['sha256'], bound['sha256'])
        self.assertIn('user_requirements', (self.out / 'CREATOR_TASK.md').read_text())

    def test_explicit_user_conditions_cannot_replace_contract_version(self):
        req = self.root / 'requirements.json'
        req.write_text(json.dumps({'required_outcomes': [{'id': 'U1', 'requirement': '依据对应判断', 'verification': '当前图指认双方'}]}))
        bound = MODULE.bind(req, 'json')
        contract = self.root / 'contract.json'
        contract.write_text(json.dumps({'user_requirements': bound}))
        other = self.root / 'other.json'
        other.write_text(json.dumps({'required_outcomes': [{'id': 'U2', 'requirement': '另一要求', 'verification': '另一证据'}]}))
        with self.assertRaises(ValueError):
            self.build(page_contract=contract, user_requirements=other)
        self.assertFalse(self.out.exists())

    def test_changed_contract_user_conditions_rejected(self):
        req = self.root / 'requirements.json'
        req.write_text(json.dumps({'required_outcomes': [{'id': 'U1', 'requirement': '依据对应判断', 'verification': '当前图指认双方'}]}))
        contract = self.root / 'contract.json'
        contract.write_text(json.dumps({'user_requirements': MODULE.bind(req, 'json')}))
        req.write_text('{}')
        with self.assertRaises(ValueError):
            self.build(page_contract=contract)
        self.assertFalse(self.out.exists())

    def test_packet_does_not_include_unrelated_history(self):
        (self.root / 'old_rejection.json').write_text('{"grade": "REJECT-B"}')
        self.build()
        stored = json.loads((self.out / 'CREATION_PACKET.json').read_text())
        self.assertEqual(set(stored['inputs']), {'content', 'tokens', 'palette',
            'positive', 'negative', 'creation_rules', 'quality_standards', 'context_rules', 'reference_selection_rules', 'taste'})

    def test_reference_selection_rule_is_bound_and_updates_with_source(self):
        first = self.build()['inputs']['reference_selection_rules']
        rule = self.root / 'rules/acceptance_case_index.md'
        self.assertEqual(first['path'], str(rule.resolve()))
        rule.write_text('当前页必看基准与相关案例', encoding='utf-8')
        second = self.build()['inputs']['reference_selection_rules']
        self.assertNotEqual(first['sha256'], second['sha256'])

    def test_missing_reference_selection_rule_fails_before_output(self):
        (self.root / 'rules/acceptance_case_index.md').unlink()
        with self.assertRaises(FileNotFoundError):
            self.build()
        self.assertFalse(self.out.exists())


if __name__ == '__main__':
    unittest.main()
