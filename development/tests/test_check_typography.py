"""用真实已通过页面检验文字层级门禁。"""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = (Path(__file__).resolve().parents[2])
SPEC = importlib.util.spec_from_file_location("check_typography", ROOT / "scripts/check_typography.py")
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)
TOKENS = json.loads((ROOT / "design_tokens.json").read_text())["typography"]
REFERENCE = ROOT / "examples/retired/mianji-p01-overview-user-approved-2026-09-29/P01.excalidraw"


class TypographyHierarchyTest(unittest.TestCase):
    def test_cli_uses_current_tokens_and_preserves_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scene = root / 'current.excalidraw'
            scene.write_text(json.dumps({'elements': [{
                'id': 'body', 'type': 'text', 'text': '当前正文', 'fontSize': 26,
                'width': 200, 'customData': {'typography_role': 'body'},
            }]}))
            current = json.loads((ROOT / 'design_tokens.json').read_text())
            current['typography']['role_sizes']['body'] = 26
            tokens = root / 'current_tokens.json'
            tokens.write_text(json.dumps(current))
            command = [sys.executable, str(ROOT / 'scripts/check_typography.py')]
            default = subprocess.run(command + [str(scene)], capture_output=True, text=True)
            self.assertEqual(default.returncode, 1)
            self.assertTrue(any('expected=24' in e for e in json.loads(default.stdout)['errors']))
            explicit = subprocess.run(command + [str(scene), '--design-tokens', str(tokens)], capture_output=True, text=True)
            self.assertEqual(explicit.returncode, 0, explicit.stderr)
            self.assertTrue(json.loads(explicit.stdout)['passed'])
            directory = subprocess.run(command + [str(root), '--design-tokens', str(tokens)], capture_output=True, text=True)
            self.assertEqual(directory.returncode, 0, directory.stderr)
            self.assertEqual(json.loads(directory.stdout)['text_elements'], 1)

    def test_cli_missing_current_tokens_does_not_fall_back(self):
        missing = ROOT / 'tests/nonexistent-current-tokens.json'
        result = subprocess.run([
            sys.executable, str(ROOT / 'scripts/check_typography.py'),
            str(REFERENCE), '--design-tokens', str(missing),
        ], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(str(missing), result.stderr)

    LEGACY = ROOT / 'development/tests/fixtures/design_tokens_v0.4.3_legacy.json'

    def test_legacy_cli_accepted_reference_still_passes(self):
        # accepted reference was made under the pre-v0.4.4 scale; it passes with its own tokens
        result = subprocess.run([
            sys.executable, str(ROOT / 'scripts/check_typography.py'), str(REFERENCE), '--design-tokens', str(self.LEGACY), '--legacy-scale',
        ], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)['passed'])

    def test_default_scale_rejects_old_45px_title(self):
        result = subprocess.run([
            sys.executable, str(ROOT / 'scripts/check_typography.py'), str(REFERENCE),
        ], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('expected=48', result.stdout + result.stderr)

    def test_default_scale_values(self):
        sizes = TOKENS["role_sizes"]
        self.assertEqual((sizes["overview_title"], sizes["page_conclusion"], sizes["section_entry"], sizes["overview_thesis"], sizes["body"], sizes["diagram_label"], sizes["annotation"], sizes["footer_meta"]), (48, 32, 32, 26, 24, 24, 22, 22))

    def _scene(self, sizes):
        return {'elements': [{'id': f't{i}', 'type': 'text', 'text': '字', 'fontSize': s, 'width': 100,
                              'customData': {'typography_role': 'body'}} for i, s in enumerate(sizes)]}
    def test_scale_five_levels_two_px_pass(self):
        self.assertEqual(CHECKER.scale_errors(self._scene([48, 32, 26, 24, 22])), [])
    def test_scale_rejects_six_levels(self):
        self.assertTrue(any('超过5级' in e for e in CHECKER.scale_errors(self._scene([48, 32, 28, 26, 24, 22]))))
    def test_scale_rejects_near_levels(self):
        self.assertTrue(any('相差不足' in e for e in CHECKER.scale_errors(self._scene([45, 30, 25, 24]))))
    def test_phone_min_glyph(self):
        errs = CHECKER.scale_errors(self._scene([48, 24, 20]))
        self.assertTrue(any('手机预览' in e and '删字' in e for e in errs))
    def test_cli_applies_scale_checks(self):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/check_typography.py'), str(REFERENCE), '--design-tokens', str(self.LEGACY)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)

    def test_accepted_reference_passes(self):
        scene = json.loads(REFERENCE.read_text())
        legacy = json.loads(self.LEGACY.read_text())["typography"]
        count, errors = CHECKER.validate_scene(
            scene, legacy["role_sizes"], set(legacy["strong_inner_roles"])
        )
        self.assertGreater(count, 0)
        self.assertEqual(errors, [])

    def test_missing_title_weight_fails(self):
        scene = json.loads(REFERENCE.read_text())
        titles = [
            e for e in scene["elements"]
            if e.get("type") == "text"
            and e.get("customData", {}).get("typography_role") == "overview_title"
        ]
        self.assertEqual(len(titles), 2)
        scene["elements"].remove(titles[-1])
        _, errors = CHECKER.validate_scene(
            scene, TOKENS["role_sizes"], set(TOKENS["strong_inner_roles"])
        )
        self.assertTrue(any("overview_title" in error and "重字副本" in error for error in errors))

    def test_long_line_is_flagged_before_render(self):
        scene = json.loads(REFERENCE.read_text())
        text = next(e for e in scene["elements"] if e.get("type") == "text" and e.get("text"))
        text["text"] = "这是一句无法装入当前文本区域的说明" * 4
        _, errors = CHECKER.validate_scene(
            scene, TOKENS["role_sizes"], set(TOKENS["strong_inner_roles"])
        )
        self.assertTrue(any("可能超出文本宽度" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
