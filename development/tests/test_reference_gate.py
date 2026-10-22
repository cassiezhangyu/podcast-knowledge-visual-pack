import copy, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from reference_gate import check_reference_notes

BASE = {
    'role': 'overview',
    'inputs': {'positive': [{'path': '/x/ep88-overview-abc/A-V16/P01@2x.png'}], 'negative': [{'path': '/x/capwords/01.png'}]},
    'references': [
        {'kind': 'positive', 'path': '/x/ep88-overview-abc/A-V16/P01@2x.png', 'observed': '中央流程面板承担主解释，周边小物件贴近对应判断，文字贴在发生处', 'effect_on_page': '本页用关系结构做主体'},
        {'kind': 'negative', 'path': '/x/capwords/01.png', 'observed': '粗糙人物与散落标签，大图占面积却没有相称解释，线条随意', 'effect_on_page': '禁止简笔人物和散落标签'},
    ],
    'allowed_graphic_language': ['并列关系结构', '来源具体物件的完整轮廓'],
    'forbidden_graphic_language': ['简笔画/火柴人', '扁平SVG图标'],
}

class ReferenceGate(unittest.TestCase):
    def run_gate(self, mutate):
        plan = copy.deepcopy(BASE); mutate(plan); check_reference_notes(plan)

    def test_complete_plan_passes(self):
        self.run_gate(lambda p: None)

    def test_missing_negative_rejected(self):
        def m(p): p['inputs']['negative'] = []
        with self.assertRaisesRegex(SystemExit, '反例'): self.run_gate(m)

    def test_negative_not_noted_rejected(self):
        def m(p): p['references'] = p['references'][:1]
        with self.assertRaisesRegex(SystemExit, 'negative'): self.run_gate(m)

    def test_short_observation_rejected(self):
        def m(p): p['references'][1]['observed'] = '已看'
        with self.assertRaisesRegex(SystemExit, 'observed'): self.run_gate(m)

    def test_overview_requires_formal_baseline(self):
        def m(p): p['references'][0]['path'] = '/x/other.png'
        with self.assertRaisesRegex(SystemExit, 'ep88-overview-abc|lingpixijing-vol69-overview-abc'): self.run_gate(m)

    def test_overview_accepts_vol69_baseline(self):
        def m(p):
            p['inputs']['positive'] = [{'path': '/x/lingpixijing-vol69-overview-abc/B-V6/P01.png'}]
            p['references'][0]['path'] = '/x/lingpixijing-vol69-overview-abc/B-V6/P01.png'
        self.run_gate(m)

    def test_cover_requires_ep88_cover_baseline(self):
        def m(p):
            p['role'] = 'cover'
            p['references'][0]['path'] = '/x/other.png'
            p['inputs']['positive'] = [{'path': '/x/other.png'}]
        with self.assertRaisesRegex(SystemExit, 'ep88-cover-user-confirmed-positive'): self.run_gate(m)

    def test_forbidden_language_must_ban_stick_figures(self):
        def m(p): p['forbidden_graphic_language'] = ['扁平SVG图标']
        with self.assertRaisesRegex(SystemExit, '简笔画'): self.run_gate(m)

    def test_missing_allowed_language_rejected(self):
        def m(p): del p['allowed_graphic_language']
        with self.assertRaisesRegex(SystemExit, 'allowed_graphic_language'): self.run_gate(m)

    def test_deep_dive_does_not_need_overview_baseline(self):
        def m(p): p['role'] = 'deep_dive'; p['references'][0]['path'] = '/x/other.png'
        self.run_gate(m)

class DiagnosticRendererGate(unittest.TestCase):
    def test_render_scene_refuses_without_preflight(self):
        import os, subprocess
        root = Path(__file__).resolve().parents[2]
        env = {k: v for k, v in os.environ.items() if k != 'PKVP_AUDIT_LAYER'}
        r = subprocess.run(['node', str(root / 'scripts/render_scene.mjs'), 'a.excalidraw', 'a.png', '1'], cwd=root, env=env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 3, r.stderr)
        self.assertIn('--preflight', r.stderr)

if __name__ == '__main__':
    unittest.main()
