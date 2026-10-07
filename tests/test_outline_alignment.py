"""检查实际区域导航、编号对应和同级入口标题，机器结果不代替视觉审查。"""

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/check_outline_body_alignment.py"
SPEC = importlib.util.spec_from_file_location("outline_alignment", SCRIPT)
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)


def text(value, x, y, size=30, role="module_title", deleted=False):
    return {"type": "text", "text": value, "x": x, "y": y,
            "fontSize": size, "customData": {"typography_role": role},
            "isDeleted": deleted}


def fixture(layout="legacy"):
    elements = []
    for number in range(1, 4):
        elements.extend([text(str(number), 100, 400 + number * 100),
                         text(f"正文入口{number}", 145, 402 + number * 100)])
        if layout == "bottom":
            x, y = 100 + (number - 1) * 300, 1220
        elif layout == "left":
            x, y = 10, 400 + number * 100
        else:
            x, y = 930, 1015 + (number - 1) * 64
        elements.extend([text(str(number), x, y, 22, "annotation"),
                         text(f"提纲名称{number}", x + 40, y + 2, 23, "diagram_label")])
    if layout == "legacy":
        regions = None
    else:
        regions = {
            "body_regions": [{"x": 100, "y": 350, "width": 1000, "height": 800}],
            "outline_regions": ([{"x": 80, "y": 1200, "width": 1020, "height": 150}]
                                if layout == "bottom" else
                                [{"x": 0, "y": 350, "width": 90, "height": 800}]),
        }
    return {"elements": elements}, regions


class OutlineAlignmentTest(unittest.TestCase):
    def run_check(self, scene, regions=None):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "scene.excalidraw"
            path.write_text(json.dumps(scene), encoding="utf-8")
            return CHECKER.check(path, regions)

    def test_legacy_passes(self):
        result = self.run_check(*fixture())
        self.assertEqual(result["status"], "pass", result)
        self.assertEqual([row["number"] for row in result["mapping"]], [1, 2, 3])
        self.assertTrue(result["manual_semantic_review_required"])

    def test_approved_legacy_reference_passes(self):
        reference = ROOT / "examples/positive/mianji-p01-overview-user-approved-2026-09-29/P01.excalidraw"
        result = CHECKER.check(reference)
        self.assertEqual(result["status"], "pass", result)
        self.assertEqual([r["number"] for r in result["mapping"]], [1, 2, 3, 4])

    def test_bottom_and_left_pass_and_bind_nearest_labels(self):
        for layout in ("bottom", "left"):
            with self.subTest(layout=layout):
                result = self.run_check(*fixture(layout))
                self.assertEqual(result["status"], "pass", result)
                self.assertEqual([r["rail_label"] for r in result["mapping"]],
                                 ["提纲名称1", "提纲名称2", "提纲名称3"])

    def test_bottom_same_y_next_label_does_not_win(self):
        scene, regions = fixture("bottom")
        for e in scene["elements"]:
            if e["text"].startswith("提纲名称"):
                e["y"] = 1220
        scene["elements"].reverse()
        result = self.run_check(scene, regions)
        self.assertEqual(result["mapping"][0]["rail_label"], "提纲名称1")

    def test_bottom_small_baseline_offsets_stay_with_nearest_label(self):
        scene, regions = fixture("bottom")
        next(e for e in scene["elements"] if e["text"] == "提纲名称2")["y"] = 1220
        result = self.run_check(scene, regions)
        self.assertEqual(result["mapping"][0]["rail_label"], "提纲名称1")

    def test_duplicate_body_fails(self):
        scene, regions = fixture()
        scene["elements"].append(text("1", 100, 850))
        result = self.run_check(scene, regions)
        self.assertEqual(result["status"], "fail")
        self.assertIn("正文编号 1 出现 2 次", result["errors"])

    def test_outline_without_body_fails(self):
        scene, regions = fixture()
        scene["elements"] = [e for e in scene["elements"] if not (e["text"] == "3" and e["x"] == 100)]
        result = self.run_check(scene, regions)
        self.assertIn("正文编号 3 出现 0 次", result["errors"])

    def test_body_without_outline_fails(self):
        scene, regions = fixture()
        scene["elements"] = [e for e in scene["elements"] if not (e["text"] == "3" and e["x"] == 930)]
        result = self.run_check(scene, regions)
        self.assertIn("提纲编号 3 出现 0 次", result["errors"])

    def test_duplicate_and_noncontinuous_outline_fail(self):
        scene, regions = fixture()
        scene["elements"].append(text("1", 930, 1300))
        self.assertIn("提纲编号 1 出现 2 次", self.run_check(scene, regions)["errors"])
        scene, regions = fixture()
        next(e for e in scene["elements"] if e["text"] == "2" and e["x"] == 930)["text"] = "4"
        self.assertTrue(any("连续" in error for error in self.run_check(scene, regions)["errors"]))

    def test_heading_size_and_role_must_each_match(self):
        for size, role in ((26, "subheading"), (26, "module_title"), (30, "subheading")):
            with self.subTest(size=size, role=role):
                scene, regions = fixture()
                heading = next(e for e in scene["elements"] if e["text"] == "正文入口3")
                heading.update(fontSize=size, customData={"typography_role": role})
                self.assertTrue(any("同级入口标题" in error for error in self.run_check(scene, regions)["errors"]))

    def test_deleted_numbers_and_headings_do_not_pollute(self):
        scene, regions = fixture()
        scene["elements"].extend([text("1", 100, 850, deleted=True),
                                  text("1", 930, 1300, deleted=True),
                                  text("错误旧标题", 140, 500, 26, "subheading", deleted=True)])
        self.assertEqual(self.run_check(scene, regions)["status"], "pass")

    def test_inline_circled_body_heading_and_multiple_regions(self):
        scene, regions = fixture("bottom")
        scene["elements"] = [e for e in scene["elements"] if not e["text"].startswith("正文入口")]
        for e in scene["elements"]:
            if e["x"] == 100 and e["y"] < 1000:
                e["text"] = "①②③"[int(e["text"]) - 1] + " 正文入口"
        regions["body_regions"] = [{"x": 100, "y": 350, "width": 1000, "height": 260},
                                   {"x": 100, "y": 610, "width": 1000, "height": 540}]
        self.assertEqual(self.run_check(scene, regions)["status"], "pass")

    def test_invalid_regions_fail_explicitly(self):
        scene, valid = fixture("bottom")
        bad_configs = [[], {}, {"body_regions": [], "outline_regions": valid["outline_regions"]}]
        for field, value in (("x", True), ("y", "1200"), ("x", float("nan")),
                             ("height", float("inf")), ("width", 0), ("height", -1)):
            bad = copy.deepcopy(valid)
            bad["outline_regions"][0][field] = value
            bad_configs.append(bad)
        overlap = copy.deepcopy(valid)
        overlap["outline_regions"][0]["y"] = 1100
        bad_configs.append(overlap)
        for bad in bad_configs:
            with self.subTest(regions=bad):
                result = self.run_check(scene, bad)
                self.assertEqual(result["status"], "fail")
                self.assertTrue(result["errors"][0].startswith("区域配置无效"))

    def test_missing_heading_fails(self):
        scene, regions = fixture("bottom")
        scene["elements"] = [e for e in scene["elements"] if e["text"] != "提纲名称3"]
        self.assertIn("提纲编号 3 附近缺提纲文字", self.run_check(scene, regions)["errors"])

    def test_cli_regions_and_malformed_json(self):
        scene, regions = fixture("bottom")
        with tempfile.TemporaryDirectory() as temp:
            path, config = Path(temp) / "scene.excalidraw", Path(temp) / "regions.json"
            path.write_text(json.dumps(scene), encoding="utf-8")
            for content, code in ((json.dumps(regions), 0), ("{", 1), ("null", 1)):
                config.write_text(content, encoding="utf-8")
                completed = subprocess.run([sys.executable, str(SCRIPT), str(path), "--regions", str(config)],
                                           capture_output=True, text=True)
                self.assertEqual(completed.returncode, code, completed.stderr)
                self.assertTrue(json.loads(completed.stdout)["manual_semantic_review_required"])


if __name__ == "__main__":
    unittest.main()
