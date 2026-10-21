import importlib.util, json, tempfile, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('po', ROOT / 'scripts/check_project_overrides.py'); po = importlib.util.module_from_spec(spec); spec.loader.exec_module(po)

def ws(root, name, tokens_text='{"t":1}', register=True):
    w = Path(root) / name; (w / '02-visual-plan').mkdir(parents=True)
    t = w / '02-visual-plan/design_tokens.override.json'; t.write_text(tokens_text)
    if register:
        (w / po.REL).write_text(json.dumps({'overrides': [{'id': 'type-scale-x', 'what': '字号改为x', 'file': '02-visual-plan/design_tokens.override.json',
            'sha256': po.sha(t), 'why': '用户要求', 'user_authorization': '用户 10-21 消息', 'date': '2026-10-21'}]}))
    return w, t

class ProjectOverrides(unittest.TestCase):
    def test_unregistered_tokens_fail(self):
        with tempfile.TemporaryDirectory() as d:
            w, t = ws(d, 'ep1', register=False)
            self.assertTrue(po.check_workspace(w, t))
    def test_registered_tokens_pass_and_default_free(self):
        with tempfile.TemporaryDirectory() as d:
            w, t = ws(d, 'ep1')
            self.assertEqual(po.check_workspace(w, t), [])
            self.assertEqual(po.check_workspace(w, po.SKILL_TOKENS), [])
    def test_changed_file_fails(self):
        with tempfile.TemporaryDirectory() as d:
            w, t = ws(d, 'ep1'); t.write_text('{"t":2}')
            self.assertTrue(po.check_workspace(w))
    def test_two_episodes_flag_promotion(self):
        with tempfile.TemporaryDirectory() as d:
            ws(d, 'ep1'); self.assertEqual(po.scan(d), [])
            ws(d, 'ep2'); self.assertEqual(po.scan(d), [{'id': 'type-scale-x', 'episodes': ['ep1', 'ep2']}])

if __name__ == '__main__': unittest.main()
