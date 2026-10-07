import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("install_skill", Path(__file__).resolve().parents[1] / "scripts/install_skill.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InstallSkillTests(unittest.TestCase):
    def test_install_excludes_dependencies_and_binds_runtime(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "repository"
            source.mkdir()
            for name in module.ENTRY_FILES:
                (source / name).write_text("测试入口")
            (source / "rules").mkdir()
            (source / "rules/check.md").write_text("检查规则")
            for name in ["node_modules", "dist", "workspace", "artifacts"]:
                (source / name).mkdir()
                (source / name / "private.txt").write_text("不应复制")
            target = module.install(source, root / "skills/demo")
            self.assertEqual(json.loads((target / "RUNTIME_ROOT.json").read_text())["runtime_root"], str(source.resolve()))
            self.assertTrue((target / "rules/check.md").is_file())
            for name in ["node_modules", "dist", "workspace", "artifacts"]:
                self.assertFalse((target / name).exists())
            with self.assertRaisesRegex(ValueError, "目标已存在"):
                module.install(source, target)
            with self.assertRaisesRegex(ValueError, "仓库之外"):
                module.install(source, source / "recursive")


if __name__ == "__main__":
    unittest.main()
