import argparse
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str((Path(__file__).resolve().parents[2]) / 'scripts'))
from prepare_independent_review import asset, check_preflight


class OverviewPreflightBasis(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.scene = self.root / 'scene.excalidraw'
        self.scene.write_text('{}')
        self.basis = self.root / 'relations.json'
        self.basis.write_text('{"relations": []}')
        self.bound = asset(str(self.basis))
        self.plan = {
            'page_id': 'P01', 'role': 'overview',
            'status': 'completed_before_construction',
            'content_sha256': 'content', 'taste_sha256': 'taste',
            'design_tokens_sha256': 'tokens', 'references': [],
            'inputs': {'framework_basis': self.bound},
            **{k: '当前内容的具体观察和可见表达依据' for k in
               ['main_visual_explanation', 'reading_path', 'text_graphic_split', 'mobile_type_plan']},
            'module_relations': [{'from': 'a', 'to': 'b', 'relation_type': '条件',
                                 'reader_question': '读者需要辨别哪些条件和结果',
                                 'forbidden_reading': '条件不保证结果'}],
            'color_role_plan': {k: '当前颜色的具体内容职责和适用范围'
                                for k in ['ink', 'primary', 'accent', 'weak']},
            'forbidden_patterns': ['无依据的因果连线'],
        }

    def check(self):
        path = self.root / 'preflight.json'
        path.write_text(json.dumps(self.plan, ensure_ascii=False))
        stamp = time.time() + 1
        os.utime(self.scene, (stamp, stamp))
        args = argparse.Namespace(page_id='P01', role=self.plan['role'],
                                  revalidate_existing=False, scene=str(self.scene))
        return check_preflight(str(path), args, [], {'sha256': 'content'},
                               {'sha256': 'taste'}, {'sha256': 'tokens'})

    def test_current_basis_accepted(self):
        self.assertEqual(self.check()['path'], str((self.root / 'preflight.json').resolve()))

    def test_missing_basis_rejected(self):
        self.plan['inputs'] = {}
        with self.assertRaisesRegex(SystemExit, 'framework_basis'):
            self.check()

    def test_changed_basis_rejected(self):
        self.basis.write_text('{"relations": [{"from": "a", "to": "b"}]}')
        with self.assertRaisesRegex(SystemExit, 'framework_basis'):
            self.check()

    def test_missing_basis_file_rejected(self):
        self.basis.unlink()
        with self.assertRaises(SystemExit):
            self.check()

    def test_other_roles_do_not_require_overview_basis(self):
        self.plan['inputs'] = {}
        for role in ['deep_dive', 'cover']:
            with self.subTest(role=role):
                self.plan['role'] = role
                self.check()


if __name__ == '__main__':
    unittest.main()
