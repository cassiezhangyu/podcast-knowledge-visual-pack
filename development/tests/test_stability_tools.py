import json
import sys
import tempfile
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SKILL / "scripts" / "lib"))
sys.path.insert(0, str(SKILL / "scripts"))

from scene_kit import Board, Palette, SceneKitError, under_text_ok  # noqa: E402
import check_reader_facing_text as reader_text  # noqa: E402
import check_overview_framework as framework  # noqa: E402
import make_preview_copies as preview  # noqa: E402


class SceneKitTest(unittest.TestCase):
    def setUp(self):
        self.p = Palette.from_library("04")

    def test_under_text_colors_pass_overlap_audit_threshold(self):
        for card in ("01", "02", "04"):
            p = Palette.from_library(card)
            self.assertTrue(under_text_ok(p.under_text_primary))
            self.assertTrue(under_text_ok(p.under_text_accent))
        self.assertFalse(under_text_ok("#E7F1F6"))

    def test_dark_fill_under_text_is_rejected(self):
        b = Board("t", self.p)
        with self.assertRaises(SceneKitError):
            b.rect(100, 300, 200, 60, bg=self.p.primary_soft, under_text=True)

    def test_text_on_solid_shape_and_edge_hugging_shape_are_caught(self):
        b = Board("t", self.p)
        b.rect(200, 400, 200, 80, bg=self.p.accent_tint)
        b.text(210, 420, "压在图形上", "body")
        b.rect(80, 600, 100, 60, role="object")  # roughness 2.0
        found = "\n".join(b.problems())
        self.assertIn("文字压图形", found)
        self.assertIn("安全区", found)
        with tempfile.TemporaryDirectory() as tmp, self.assertRaises(SceneKitError):
            b.finish(Path(tmp) / "x.excalidraw")

    def test_clean_page_writes_scene_with_contract_parts(self):
        b = Board("t", self.p)
        b.chrome("示例 / 知识总览", "标题", "内容陈述副标题", "整页结论")
        b.rect(300, 400, 200, 100, bg=self.p.under_text_primary, under_text=True)
        b.text(320, 430, "浅底上的字", "body")
        b.parcel(700, 400)
        b.outline(1436, "① 一  ② 二")
        b.footer(["节目：《示例》", "回听：整期"], "第01页 / 共01页")
        with tempfile.TemporaryDirectory() as tmp:
            out = b.finish(Path(tmp) / "p.excalidraw")
            scene = json.loads(out.read_text())
        roles = {e["customData"].get("typography_role") for e in scene["elements"] if e["type"] == "text"}
        self.assertTrue({"overview_title", "overview_thesis", "page_conclusion", "footer_meta"} <= roles)
        self.assertFalse(any(k.startswith("_") for e in scene["elements"] for k in e))

    def test_unknown_roles_are_rejected(self):
        b = Board("t", self.p)
        with self.assertRaises(SceneKitError):
            b.text(100, 100, "x", "tiny")
        with self.assertRaises(SceneKitError):
            b.rect(100, 100, 10, 10, role="wobbly")


class SubtitleLintTest(unittest.TestCase):
    def el(self, text, role="overview_thesis"):
        return {"type": "text", "text": text, "customData": {"typography_role": role}}

    def test_show_name_and_episode_number_are_rejected(self):
        meta = {"episode": {"podcast_name": "纵横四海", "title": "EP86 颠覆工作流"}}
        bad = reader_text.subtitle_violations([self.el("纵横四海 EP86｜运营管理总览")], meta)
        self.assertEqual(len(bad), 1)
        self.assertTrue(reader_text.subtitle_violations([self.el("本期节目讲什么")]))

    def test_content_statement_and_other_roles_pass(self):
        meta = {"episode": {"podcast_name": "纵横四海", "title": "EP86 颠覆工作流"}}
        ok = [self.el("用运营管理看产出：取舍、卡点与持续改进"), self.el("纵横四海 / 知识总览", "header_meta")]
        self.assertEqual(reader_text.subtitle_violations(ok, meta), [])


class UnifiedCarrierTest(unittest.TestCase):
    good = {"statement": "全期放在一条交付流上", "basis": "synthesis", "user_confirmed": True,
            "parts": [{"part": "入口", "content": "需求取舍"}, {"part": "管道", "content": "五种流不动"}]}

    def test_complete_carrier_passes(self):
        self.assertIsNone(framework.unified_carrier_error(self.good))

    def test_missing_or_unconfirmed_carrier_fails(self):
        self.assertIn("缺少", framework.unified_carrier_error(None))
        self.assertIn("确认", framework.unified_carrier_error({**self.good, "user_confirmed": False}))
        self.assertIn("parts", framework.unified_carrier_error({**self.good, "parts": [self.good["parts"][0]]}))


class PreviewCopiesTest(unittest.TestCase):
    def test_copies_drop_at_sign_and_compare_is_made(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            for name in ("a", "b"):
                (tmp / name).mkdir()
                Image.new("RGB", (240, 320), "white").save(tmp / name / "P01@2x.png")
            out = tmp / "preview"
            preview.main(["--out", str(out), "--compare-width", "600", f"A={tmp / 'a' / 'P01@2x.png'}", f"B={tmp / 'b' / 'P01@2x.png'}"])
            names = sorted(p.name for p in out.iterdir())
        self.assertEqual(names, ["A-2x.png", "B-2x.png", "compare-A-vs-B.png"])
        self.assertFalse(any("@" in n for n in names))


if __name__ == "__main__":
    unittest.main()
