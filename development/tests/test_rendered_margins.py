# -*- coding: utf-8 -*-
import importlib.util
import os
import subprocess
import sys
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("rendered_margins", ROOT / "scripts/audit_rendered_margins.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class RenderedMarginTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.canvas = json.loads((ROOT / "assets/design_tokens.json").read_text())["canvas"]

    def image(self, scale=1, top=64, bottom=68, left=80, right=80):
        w, h = round(1200 * scale), round(1600 * scale)
        im = Image.new("RGB", (w, h), "white")
        ImageDraw.Draw(im).rectangle((round(left*scale), round(top*scale), round((1200-right)*scale)-1,
                                     round((1600-bottom)*scale)-1), outline="black", width=max(1, round(scale)))
        p = Path(self.tmp.name) / "page.png"
        im.save(p)
        return p

    def test_correct_page_at_multiple_export_scales(self):
        for scale in [1, 2, 2.4]:
            r = audit.measure(self.image(scale), self.canvas)
            self.assertEqual(r["status"], "pass", r)
            self.assertAlmostEqual(r["margins"]["bottom"], 68, delta=.5)

    def test_current_failure_top64_bottom26_is_rejected(self):
        r = audit.measure(self.image(top=64, bottom=26), self.canvas)
        self.assertEqual(r["status"], "fail")
        self.assertFalse(r["checks"]["bottom_target"]["pass"])
        self.assertFalse(r["checks"]["vertical_balance"]["pass"])

    def test_shift_and_footer_near_edge(self):
        for top, bottom in [(84,48),(64,10)]:
            self.assertEqual(audit.measure(self.image(top=top,bottom=bottom), self.canvas)["status"], "fail")

    def test_balance_is_checked_even_when_targets_individually_fit(self):
        r = audit.measure(self.image(top=72,bottom=60), self.canvas)
        self.assertTrue(r["checks"]["top_target"]["pass"])
        self.assertTrue(r["checks"]["bottom_target"]["pass"])
        self.assertFalse(r["checks"]["vertical_balance"]["pass"])

    def test_rough_stroke_tolerance_and_horizontal_symmetry(self):
        self.assertEqual(audit.measure(self.image(scale=2,left=77.5,right=80), self.canvas)["status"], "pass")
        for left, right in [(77,80),(80,90)]:
            self.assertEqual(audit.measure(self.image(scale=2,left=left,right=right), self.canvas)["status"], "fail")

    def test_missing_parameter_blank_and_wrong_aspect_fail(self):
        p = self.image()
        c = dict(self.canvas); del c["bottom_visible_target"]
        with self.assertRaises(ValueError): audit.measure(p,c)
        Image.new("RGB",(1200,1600),"white").save(p)
        with self.assertRaises(ValueError): audit.measure(p,self.canvas)
        Image.new("RGB",(1200,1500),"black").save(p)
        with self.assertRaises(ValueError): audit.measure(p,self.canvas)

    def test_default_footer_real_render_respects_bottom_target(self):
        sys.path.insert(0, str(ROOT / "scripts/lib"))
        from scene_kit import Board, Palette
        b = Board("margin_test", Palette.from_library("05"))
        b.chrome("测试 / 知识总览", "边距测量测试", "使用真实字形测量外留白", "本图仅验证工具包的默认页脚位置。")
        b.footer(["节目：《测试》", "回听：整期 00:00:00–01:09:27"], "第01页 / 共01页")
        scene = b.finish(Path(self.tmp.name) / "footer.excalidraw")
        png = Path(self.tmp.name) / "footer.png"
        r = subprocess.run(["node", str(ROOT / "scripts/render_scene.mjs"), str(scene), str(png), "2"],
                           cwd=ROOT, env={**os.environ,"PKVP_AUDIT_LAYER":"1"}, capture_output=True, text=True)
        self.assertEqual(r.returncode,0,r.stderr)
        measured = audit.measure(png,self.canvas)
        self.assertEqual(measured["status"],"pass",measured)
        self.assertAlmostEqual(measured["margins"]["bottom"],68,delta=2)

    def test_authorized_parameters_are_used(self):
        c = {**self.canvas,"top_visible_target":80,"bottom_visible_target":80}
        self.assertEqual(audit.measure(self.image(top=80,bottom=80),c)["status"],"pass")
        self.assertEqual(audit.measure(self.image(top=80,bottom=80),self.canvas)["status"],"fail")


if __name__ == "__main__": unittest.main()
