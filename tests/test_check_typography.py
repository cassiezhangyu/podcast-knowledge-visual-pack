"""用真实已通过页面检验文字层级门禁。"""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("check_typography", ROOT / "scripts/check_typography.py")
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)
TOKENS = json.loads((ROOT / "design_tokens.json").read_text())["typography"]
REFERENCE = ROOT / "examples/positive/mianji-p01-overview-user-approved-2026-09-29/P01.excalidraw"


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

    def test_default_cli_accepted_reference_still_passes(self):
        result = subprocess.run([
            sys.executable, str(ROOT / 'scripts/check_typography.py'), str(REFERENCE),
        ], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)['passed'])

    def test_accepted_reference_passes(self):
        scene = json.loads(REFERENCE.read_text())
        count, errors = CHECKER.validate_scene(
            scene, TOKENS["role_sizes"], set(TOKENS["strong_inner_roles"])
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
