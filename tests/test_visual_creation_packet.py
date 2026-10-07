import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/build_visual_creation_packet.py'
SPEC = importlib.util.spec_from_file_location('creation_packet', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CreationPacketTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'rules').mkdir()
        for name in ['visual_reasoning.md', 'visual_creation_context.md', 'acceptance_case_index.md']:
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
        self.assertEqual(result['context_policy']['preferred_fork_turns'], 'none')

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

    def test_packet_does_not_include_unrelated_history(self):
        (self.root / 'old_rejection.json').write_text('{"grade": "REJECT-B"}')
        self.build()
        stored = json.loads((self.out / 'CREATION_PACKET.json').read_text())
        self.assertEqual(set(stored['inputs']), {'content', 'tokens', 'palette',
            'positive', 'negative', 'creation_rules', 'context_rules', 'reference_selection_rules', 'taste'})

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
