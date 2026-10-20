import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("fixed_chrome", (Path(__file__).resolve().parents[2]) / "scripts/check_fixed_chrome.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
check = module.check_fixed_chrome


class FixedChromeTests(unittest.TestCase):
    def setUp(self):
        self.scene = {"elements": [{"id": "本页线", "type": "line", "x": 80, "y": 231, "width": 1040,
                                    "height": 0, "opacity": 100, "points": [[0, 0], [1040, 0]]}]}
        self.contract = {"fixed_chrome": {"elements": [{"id": "本页线", "purpose": "页头分隔",
                           "expected": {"type": "line", "x": 80, "y": 231, "points": [[0, 0], [1040, 0]]}}]}}

    def test_declared_contract_and_content_edit(self):
        self.scene["elements"].append({"id": "正文", "type": "text", "text": "本次新内容"})
        self.assertEqual(check(self.scene, self.contract)["status"], "pass")

    def test_missing_deleted_and_duplicate(self):
        for elements in [[], [{**self.scene["elements"][0], "isDeleted": True}], self.scene["elements"] * 2]:
            with self.subTest(elements=elements), self.assertRaises(ValueError):
                check({"elements": elements}, self.contract)

    def test_hidden_moved_retyped_and_changed_points(self):
        for patch in [{"opacity": 0}, {"y": 232}, {"type": "rectangle"}, {"points": [[0, 0], [500, 0]]}]:
            scene = copy.deepcopy(self.scene)
            scene["elements"][0].update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                check(scene, self.contract)

    def test_page_specific_coordinates_and_partial_locks(self):
        self.scene["elements"][0]["y"] = 600
        self.contract["fixed_chrome"]["elements"][0]["expected"]["y"] = 600
        self.scene["elements"][0]["width"] = 900  # 未锁定宽度不强制其他案例的默认值。
        self.assertEqual(check(self.scene, self.contract)["status"], "pass")

    def test_legacy_not_declared_is_not_pass(self):
        self.assertEqual(check({"elements": []}, {})["status"], "not_declared")

    def test_malformed_contract_fails(self):
        for chrome in [None, [], {}, {"elements": []}, {"elements": [{}]}, {"elements": [None]}]:
            with self.subTest(chrome=chrome), self.assertRaises(ValueError):
                check(self.scene, {"fixed_chrome": chrome})

    def test_duplicate_contract_ids_fail(self):
        self.contract["fixed_chrome"]["elements"] *= 2
        with self.assertRaises(ValueError):
            check(self.scene, self.contract)


if __name__ == "__main__":
    unittest.main()
