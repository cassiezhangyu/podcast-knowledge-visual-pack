"""验证安装后的可用性和源独立性，不改动生产工作区。"""
import importlib.util
import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path


ROOT = (Path(__file__).resolve().parents[2])
spec = importlib.util.spec_from_file_location("layout_installer", ROOT / "scripts/install_skill.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
layout_spec = importlib.util.spec_from_file_location("skill_layout", ROOT / "scripts/check_skill_layout.py")
layout = importlib.util.module_from_spec(layout_spec)
layout_spec.loader.exec_module(layout)


class InstallationModes(unittest.TestCase):
    def fixture(self, parent):
        source = parent / "repository"
        source.mkdir()
        for name in installer.ENTRY_FILES + installer.CODE_FILES:
            (source / name).write_text("测试入口", encoding="utf8")
        for name in installer.CODE_DIRS:
            (source / name).mkdir()
            (source / name / "example.txt").write_text("执行资源", encoding="utf8")
        (source / "references/rules").mkdir(parents=True)
        (source / "references/rules/check.md").write_text("现行规则", encoding="utf8")
        (source / "rules").symlink_to("references/rules", target_is_directory=True)
        for name in ["node_modules", "dist", "workspace", "tests"]:
            (source / name).mkdir()
            (source / name / "private.txt").write_text("排除资源", encoding="utf8")
        return source

    def test_link_uses_one_live_source(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = self.fixture(base)
            target = installer.install(source, base / "skills/demo", "link")
            self.assertTrue(target.is_symlink())
            self.assertFalse(target.readlink().is_absolute())
            (source / "references/rules/check.md").write_text("修改后规则", encoding="utf8")
            self.assertEqual((target / "rules/check.md").read_text(), "修改后规则")

    def test_copy_survives_source_removal_and_relocation(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = self.fixture(base)
            target = installer.install(source, base / "installed", "copy")
            self.assertFalse(any(path.is_symlink() for path in target.rglob("*")))
            source.rename(base / "unavailable-source")
            moved = target.rename(base / "relocated")
            self.assertEqual((moved / "rules/check.md").read_text(), "现行规则")
            self.assertTrue((moved / "scripts/example.txt").is_file())
            self.assertFalse((moved / "RUNTIME_ROOT.json").exists())
            for name in ["node_modules", "dist", "workspace", "tests"]:
                self.assertFalse((moved / name).exists())


    def test_copy_expands_nested_file_and_directory_links(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = self.fixture(base)
            (source / "references/alias").symlink_to("rules", target_is_directory=True)
            (source / "references/check.md").symlink_to("rules/check.md")
            target = installer.install(source, base / "installed", "copy")
            self.assertEqual((target / "references/alias/check.md").read_text(), "现行规则")
            self.assertEqual((target / "references/check.md").read_text(), "现行规则")
            self.assertFalse(any(path.is_symlink() for path in target.rglob("*")))

    def test_copy_rejects_circular_directory_link(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = self.fixture(base)
            (source / "references/rules/loop").symlink_to("..", target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "循环"):
                installer.install(source, base / "installed", "copy")
            self.assertFalse((base / "installed").exists())
            self.assertEqual(list(base.glob(".skill-install-*")), [])

    def test_layout_accepts_copies_and_detects_modified_alias(self):
        with tempfile.TemporaryDirectory() as temp:
            source = self.fixture(Path(temp))
            target = installer.install(source, Path(temp) / "installed", "copy")
            with unittest.mock.patch.dict(layout.ALIASES, {"rules": "references/rules"}, clear=True):
                self.assertFalse(any("兼容路径" in error for error in layout.check(target)))
                (target / "rules/check.md").write_text("意外变更", encoding="utf8")
                self.assertIn("兼容路径与规范资源不一致：rules", layout.check(target))

    def test_legacy_retains_runtime_binding(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = self.fixture(base)
            target = installer.install(source, base / "installed")
            binding = json.loads((target / "RUNTIME_ROOT.json").read_text())
            self.assertEqual(binding["runtime_root"], str(source.resolve()))
            self.assertEqual((target / "rules/check.md").read_text(), "现行规则")

    def test_all_modes_reject_existing_or_dangling_link(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = self.fixture(base)
            target = base / "installed"
            target.symlink_to("missing")
            for mode in ["link", "copy", "legacy"]:
                with self.assertRaisesRegex(ValueError, "目标已存在"):
                    installer.install(source, target, mode)
            self.assertEqual(str(target.readlink()), "missing")

    def test_copy_missing_code_leaves_no_partial_install(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = self.fixture(base)
            (source / "package-lock.json").unlink()
            with self.assertRaisesRegex(ValueError, "缺少"):
                installer.install(source, base / "installed", "copy")
            self.assertFalse((base / "installed").exists())

    def test_copy_rejects_external_resource_link(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = self.fixture(base)
            external = base / "external"
            external.mkdir()
            (source / "examples").symlink_to(external, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "外部资源"):
                installer.install(source, base / "installed", "copy")
            self.assertFalse((base / "installed").exists())
            self.assertEqual(list(base.glob(".skill-install-*")), [])

    def test_recursive_install_rejected_in_all_modes(self):
        with tempfile.TemporaryDirectory() as temp:
            source = self.fixture(Path(temp))
            for mode in ["link", "copy", "legacy"]:
                with self.assertRaisesRegex(ValueError, "仓库之外"):
                    installer.install(source, source / "nested", mode)

    def test_copy_rejects_nested_external_link(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = self.fixture(base)
            (source / "references/outside").symlink_to(base / "external")
            with self.assertRaisesRegex(ValueError, "失效或外部"):
                installer.install(source, base / "installed", "copy")
            self.assertFalse((base / "installed").exists())


if __name__ == "__main__":
    unittest.main()
