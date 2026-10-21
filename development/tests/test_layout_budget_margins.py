"""Ported v0.6.3 rules (v0.4.1-local): pre-render layout budget and margin/whitespace audit."""
import json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUDGET = ROOT / "scripts/layout_budget.py"
AUDIT = ROOT / "scripts/audit_overlap_margins.py"


def run(*args):
    return subprocess.run([sys.executable, *map(str, args)], capture_output=True, text=True, cwd=ROOT)


def text(i, x, y, s, size=24, w=300):
    return {"id": f"t{i}", "type": "text", "x": x, "y": y, "width": w, "height": size * 1.25, "text": s,
            "fontSize": size, "lineHeight": 1.25, "fontFamily": 2, "strokeColor": "#1f2328", "backgroundColor": "transparent",
            "angle": 0, "seed": i, "version": 1, "versionNonce": i, "isDeleted": False, "groupIds": [], "boundElements": [],
            "textAlign": "left", "verticalAlign": "top", "containerId": None, "originalText": s, "autoResize": True,
            "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid", "roughness": 0, "opacity": 100, "roundness": None,
            "frameId": None, "link": None, "locked": False, "updated": 1, "index": None}


def line(i, x, y, w):
    e = text(i, x, y, "")
    for k in ["text", "fontSize", "lineHeight", "fontFamily", "textAlign", "verticalAlign", "containerId", "originalText", "autoResize"]:
        e.pop(k)
    e.update(id=f"l{i}", type="line", width=w, height=0, points=[[0, 0], [w, 0]], strokeColor="#3E4552", strokeWidth=2)
    return e


def canvas():
    e = line(0, 0, 0, 1200)
    e.update(id="bg", type="rectangle", height=1600, strokeColor="transparent", backgroundColor="#ffffff")
    e.pop("points")
    return e


def scene(elements):
    return {"type": "excalidraw", "version": 2, "elements": elements, "appState": {"viewBackgroundColor": "#ffffff"}, "files": {}}


class LayoutBudgetTest(unittest.TestCase):
    def write(self, data):
        f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        json.dump(data, f); f.close(); self.addCleanup(os.unlink, f.name)
        return f.name

    def test_budget_fits(self):
        p = self.write({"body_top": 260, "footer_rule_y": 1490, "blocks": [{"name": "a", "h": 400}, {"name": "b", "h": 400}]})
        r = run(BUDGET, p)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("slack", r.stdout)

    def test_budget_overrun_and_tight_gap_fail(self):
        p = self.write({"body_top": 260, "footer_rule_y": 1490, "min_gap": 20,
                        "blocks": [{"name": "a", "h": 800, "gap_after": 8}, {"name": "b", "h": 500}]})
        r = run(BUDGET, p)
        self.assertEqual(r.returncode, 1)
        self.assertIn("overrun", r.stdout)
        self.assertIn("gap after a", r.stdout)

    def test_scene_mode_detects_estimated_overlap_and_footer_overrun(self):
        good = self.write(scene([text(1, 100, 300, "一"), text(2, 100, 360, "二"), line(3, 80, 1490, 1040)]))
        self.assertEqual(run(BUDGET, "--scene", good).returncode, 0)
        bad = self.write(scene([text(1, 100, 300, "一\n二\n三"), text(2, 100, 330, "四"),
                                text(4, 100, 1470, "页脚上方"), line(3, 80, 1490, 1040)]))
        r = run(BUDGET, "--scene", bad)
        self.assertEqual(r.returncode, 1)
        self.assertIn("estimated overlap", r.stdout)
        self.assertIn("overruns footer gap", r.stdout)


@unittest.skipUnless((ROOT / "dist/excalidraw-preview-browser.js").exists() and shutil.which("node"),
                     "需要先 npm run build 并有 Chromium")
class MarginAuditTest(unittest.TestCase):
    def audit(self, elements):
        f = tempfile.NamedTemporaryFile("w", suffix=".excalidraw", delete=False)
        json.dump(scene(elements), f); f.close(); self.addCleanup(os.unlink, f.name)
        r = run(AUDIT, f.name, 1)
        return r.returncode, json.loads(r.stdout)

    def chrome(self):
        return [canvas(), line(10, 80, 238, 1040), line(11, 80, 1490, 1040), text(12, 80, 60, "页眉", w=200)]

    def test_symmetric_page_passes(self):
        rc, res = self.audit(self.chrome() + [text(1, 100, 300, "正文", w=200)])
        self.assertEqual(rc, 0, res)
        self.assertLessEqual(res["side_margin_asymmetry"], 6)

    def test_asymmetric_margins_and_header_gap_fail(self):
        rc, res = self.audit([canvas(), line(10, 80, 238, 1000), line(11, 80, 1490, 1000),
                              text(12, 80, 60, "页眉", w=200), text(1, 100, 243, "贴着页眉线", w=200)])
        self.assertEqual(rc, 1)
        self.assertGreater(res["side_margin_asymmetry"], 6)
        self.assertLess(res["gap_header_rule_to_body"], 12)


if __name__ == "__main__":
    unittest.main()
