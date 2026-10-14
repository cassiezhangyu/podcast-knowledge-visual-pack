"""Minimal tests for the v0.5.1–v0.6.2 QA scripts (layout_budget, audit_stroke_shapes, audit_cjk_glyphs,
audit_overlap_margins). Rendering tests are skipped when the box renderer (node + playwright) is unavailable."""
import json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable

def scene(elements):
    base = [{"id": "bg", "type": "rectangle", "x": 0, "y": 0, "width": 1200, "height": 1600, "strokeColor": "transparent",
             "backgroundColor": "#ffffff", "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid", "roughness": 0,
             "opacity": 100, "angle": 0, "seed": 1, "version": 1, "versionNonce": 1, "isDeleted": False, "groupIds": [],
             "boundElements": None, "updated": 1, "link": None, "locked": False, "roundness": None, "frameId": None}]
    return {"type": "excalidraw", "version": 2, "source": "test", "elements": base + elements, "appState": {"viewBackgroundColor": "#ffffff"}, "files": {}}

def text(id_, x, y, s, size=24, w=400):
    n = s.count("\n") + 1
    return {"id": id_, "type": "text", "x": x, "y": y, "width": w, "height": n * size * 1.25, "text": s, "originalText": s,
            "fontSize": size, "fontFamily": 2, "lineHeight": 1.25, "textAlign": "left", "verticalAlign": "top",
            "strokeColor": "#273348", "backgroundColor": "transparent", "fillStyle": "solid", "strokeWidth": 1,
            "strokeStyle": "solid", "roughness": 0, "opacity": 100, "angle": 0, "seed": 2, "version": 1, "versionNonce": 1,
            "isDeleted": False, "groupIds": [], "boundElements": None, "updated": 1, "link": None, "locked": False,
            "containerId": None, "autoResize": True, "roundness": None, "frameId": None, "baseline": size}

def line(id_, pts, rough=0.9, role="curve", x=100, y=300):
    return {"id": id_, "type": "line", "x": x, "y": y, "width": max(p[0] for p in pts), "height": max(p[1] for p in pts) or 1,
            "points": pts, "strokeColor": "#3E4552", "backgroundColor": "transparent", "fillStyle": "solid", "strokeWidth": 2,
            "strokeStyle": "solid", "roughness": rough, "opacity": 100, "angle": 0, "seed": 3, "version": 1, "versionNonce": 1,
            "isDeleted": False, "groupIds": [], "boundElements": None, "updated": 1, "link": None, "locked": False,
            "roundness": None, "frameId": None, "customData": {"stroke_role": role}, "lastCommittedPoint": None,
            "startBinding": None, "endBinding": None, "startArrowhead": None, "endArrowhead": None}

def run(args, sc):
    d = tempfile.mkdtemp(); p = os.path.join(d, "s.excalidraw"); Path(p).write_text(json.dumps(sc, ensure_ascii=False))
    try: return subprocess.run(args + [p] if "{}" not in args else [a.replace("{}", p) for a in args], cwd=ROOT, capture_output=True, text=True, timeout=300)
    finally: pass

RENDER_OK = shutil.which("node") and (ROOT / "node_modules" / "playwright").exists() and os.environ.get("PKVP_SKIP_RENDER_TESTS") != "1"

class LayoutBudget(unittest.TestCase):
    def test_scene_pass(self):
        r = run([PY, "scripts/layout_budget.py", "--scene", "{}"], scene([text("a", 100, 300, "第一行"), text("b", 100, 400, "第二行")]))
        self.assertEqual(r.returncode, 0, r.stdout)
    def test_scene_overlap_fails(self):
        r = run([PY, "scripts/layout_budget.py", "--scene", "{}"], scene([text("a", 100, 300, "一\n二\n三"), text("b", 100, 330, "压住了")]))
        self.assertEqual(r.returncode, 1); self.assertIn("estimated overlap", r.stdout)
    def test_scene_footer_overrun_fails(self):
        r = run([PY, "scripts/layout_budget.py", "--scene", "{}"], scene([text("a", 100, 1470, "太靠下")]))
        self.assertEqual(r.returncode, 1)
    def test_budget_json(self):
        d = tempfile.mkdtemp(); p = os.path.join(d, "b.json")
        json.dump({"body_top": 300, "footer_rule_y": 1490, "blocks": [{"name": "x", "h": 2000}]}, open(p, "w")); 
        self.assertEqual(subprocess.run([PY, "scripts/layout_budget.py", p], cwd=ROOT, capture_output=True).returncode, 1)

class StrokeShapes(unittest.TestCase):
    def test_short_path_passes(self):
        r = run([PY, "scripts/audit_stroke_shapes.py"], scene([line("l", [[0, 0], [100, 0], [200, 20]])]))
        self.assertEqual(r.returncode, 0, r.stdout)
    def test_many_points_fails(self):
        r = run([PY, "scripts/audit_stroke_shapes.py"], scene([line("l", [[i * 10, (i % 2) * 5] for i in range(12)])]))
        self.assertEqual(r.returncode, 1)
    def test_long_rough_path_fails(self):
        r = run([PY, "scripts/audit_stroke_shapes.py"], scene([line("l", [[0, 0], [400, 0]], rough=2.0, role="relation")]))
        self.assertEqual(r.returncode, 1)

@unittest.skipUnless(RENDER_OK, "renderer unavailable")
class RenderedAudits(unittest.TestCase):
    def test_cjk_glyphs_sc(self):
        r = run(["node", "scripts/audit_cjk_glyphs.mjs"], scene([text("a", 100, 300, "门直骨关，：")]))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
    def test_cjk_negative_control(self):
        d = tempfile.mkdtemp(); p = os.path.join(d, "s.excalidraw"); Path(p).write_text(json.dumps(scene([text("a", 100, 300, "门直骨关")]), ensure_ascii=False))
        r = subprocess.run(["node", "scripts/audit_cjk_glyphs.mjs", p], cwd=ROOT, capture_output=True, text=True, timeout=300,
                           env=dict(os.environ, PKVP_GLYPH_NEGATIVE_CONTROL="1"))
        self.assertEqual(r.returncode, 1, r.stdout)
    def test_overlap_detects_text_on_text(self):
        r = run([PY, "scripts/audit_overlap_margins.py"], scene([text("a", 100, 300, "重叠的文字"), text("b", 110, 305, "重叠的文字")]))
        self.assertEqual(r.returncode, 1)

if __name__ == "__main__": unittest.main()
