import json, subprocess, sys, tempfile, unittest
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import check_typography as ct
import audit_dead_space as ds

class DeadSpace(unittest.TestCase):
    def page(self, d: Path, hole: bool, scale=1):
        im = Image.new("RGB", (1200 * scale, 1600 * scale), "#FBFAF7"); dr = ImageDraw.Draw(im)
        for y in range(330, 1470, 40):
            for x in range(80, 1120, 40):
                if hole and 600 <= x < 1000 and 900 <= y < 1300: continue
                dr.rectangle([x * scale, y * scale, (x + 6) * scale, (y + 6) * scale], fill="black")
        p = d / f"p{int(hole)}{scale}.png"; im.save(p); return p
    def test_dense_passes_and_hole_fails_including_2x(self):
        with tempfile.TemporaryDirectory() as t:
            d = Path(t)
            self.assertEqual(ds.audit(self.page(d, False))["status"], "pass")
            self.assertEqual(ds.audit(self.page(d, True))["status"], "fail")
            self.assertEqual(ds.audit(self.page(d, True, 2))["status"], "fail")
    def test_light_tint_counts_as_empty(self):
        with tempfile.TemporaryDirectory() as t:
            p = Path(t) / "tint.png"; im = Image.new("RGB", (1200, 1600), "#FBFAF7"); ImageDraw.Draw(im).rectangle([100, 400, 700, 900], fill="#EDF2F7"); im.save(p)
            self.assertEqual(ds.audit(p)["status"], "fail")

class RoundDiff(unittest.TestCase):
    def test_claimed_change_without_visible_diff_fails(self):
        with tempfile.TemporaryDirectory() as t:
            d = Path(t); a = d / "a.png"; Image.new("RGB", (120, 160), "white").save(a)
            r = subprocess.run([sys.executable, str(ROOT / "scripts/round_diff.py"), "--previous", str(a), "--current", str(a), "--side-by-side", str(d / "s.png"), "--claims-changed", "--diff", "移了例子"], capture_output=True, text=True)
            self.assertEqual(r.returncode, 1); self.assertIn("看不出", r.stdout)
            b = d / "b.png"; im = Image.new("RGB", (120, 160), "white"); ImageDraw.Draw(im).rectangle([10, 10, 80, 80], fill="black"); im.save(b)
            r = subprocess.run([sys.executable, str(ROOT / "scripts/round_diff.py"), "--previous", str(a), "--current", str(b), "--side-by-side", str(d / "s.png"), "--claims-changed"], capture_output=True, text=True)
            self.assertEqual(r.returncode, 1); self.assertIn("清单为空", r.stdout)

class TypographyV047(unittest.TestCase):
    def el(self, i, text, size, **cd): return {"id": i, "type": "text", "text": text, "fontSize": size, "customData": cd}
    def test_content_bearing_small_text_fails(self):
        e, u = ct.small_text_review({"elements": [self.el("a", "第1周观察", 22, content_bearing=True)]}); self.assertTrue(e)
    def test_undeclared_small_text_needs_ruling_but_meta_exempt(self):
        e, u = ct.small_text_review({"elements": [self.el("a", "睡眠：照做", 22, typography_role="annotation"), self.el("b", "第01页", 22, typography_role="footer_meta"), self.el("c", "3", 22), self.el("d", "本页提纲", 22, text_function="navigation")]})
        self.assertEqual(e, []); self.assertEqual(len(u), 1); self.assertIn("a:", u[0])
    def test_widow(self):
        self.assertTrue(ct.widow_errors({"elements": [self.el("a", "只写触动你的一到三个\n点。", 24)]}))
        self.assertFalse(ct.widow_errors({"elements": [self.el("b", "第1周\n观察", 24)]}))
        self.assertFalse(ct.widow_errors({"elements": [self.el("c", "只写触动你的\n一到三个点。", 24)]}))

if __name__ == "__main__": unittest.main()
