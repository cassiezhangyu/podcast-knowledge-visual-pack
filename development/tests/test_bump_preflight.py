import importlib.util, json, tempfile, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('bump', ROOT / 'scripts/bump_preflight.py'); bump = importlib.util.module_from_spec(spec); spec.loader.exec_module(bump)

class BumpPreflight(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); d = Path(self.tmp.name); self.d = d
        (d / 'tokens.json').write_text('{"a":1}'); (d / 'contract.json').write_text('{"c":1}')
        old = {'status': 'completed_before_construction', 'version': 'REFERENCE_PREFLIGHT_V3', 'page_id': 'P01',
               'design_tokens_sha256': bump.sha(d / 'tokens.json'), 'references': [{'observed': '保留的参考观察'}],
               'inputs': {'tokens': {'path': str(d / 'tokens.json'), 'sha256': bump.sha(d / 'tokens.json')},
                          'page_contract': {'path': str(d / 'contract.json'), 'sha256': bump.sha(d / 'contract.json')}}}
        (d / 'old.json').write_text(json.dumps(old))
    def tearDown(self): self.tmp.cleanup()
    def test_bump_rehashes_and_chains(self):
        (self.d / 'contract.json').write_text('{"c":2}')
        new, changed = bump.bump(self.d / 'old.json', self.d / 'new.json', '页面合同换了专辑封面哈希')
        self.assertEqual(new['version'], 'REFERENCE_PREFLIGHT_V4')
        self.assertEqual(new['inputs']['page_contract']['sha256'], bump.sha(self.d / 'contract.json'))
        self.assertEqual(changed, [str(self.d / 'contract.json')])
        self.assertEqual(new['previous']['version'], 'REFERENCE_PREFLIGHT_V3')
        self.assertEqual(new['references'][0]['observed'], '保留的参考观察')
        self.assertEqual(new['amendments'][-1]['note'], '页面合同换了专辑封面哈希')
    def test_new_tokens_update_hash(self):
        (self.d / 't2.json').write_text('{"a":2}')
        new, _ = bump.bump(self.d / 'old.json', self.d / 'new.json', '改用 skill 默认字号参数', tokens=self.d / 't2.json')
        self.assertEqual(new['design_tokens_sha256'], bump.sha(self.d / 't2.json'))
    def test_note_required(self):
        with self.assertRaises(ValueError): bump.bump(self.d / 'old.json', self.d / 'new.json', '改了')

if __name__ == '__main__': unittest.main()
