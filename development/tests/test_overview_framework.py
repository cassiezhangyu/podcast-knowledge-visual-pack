import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

p = (Path(__file__).resolve().parents[2]) / 'scripts/check_overview_framework.py'
spec = importlib.util.spec_from_file_location('framework', p)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FrameworkReadback(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'approved-plan.json'
        self.path.write_text(json.dumps({'overview_relation_ledger': [
            {'page_id': 'P01', 'from_component': '收益', 'to_component': '退出', 'relation_type': '解释'},
            {'page_id': 'P01', 'from_component': '人的约束', 'to_component': '执行', 'relation_type': '限制'},
            {'page_id': 'P02', 'from_component': '另一页', 'to_component': '边界', 'relation_type': '并列'}
        ]}, ensure_ascii=False))
        self.basis = {'path': str(self.path), 'sha256': hashlib.sha256(self.path.read_bytes()).hexdigest()}
        self.check = {'status': 'pass', 'basis': self.basis, 'framework_readback': '收益目标解释退出，人的约束限制实际执行。',
                      'relations': [{'from': '收益', 'to': '退出', 'relation_type': '解释', 'observed': '为何保留上涨空间', 'visible_evidence': '收益区到退出原则的限定说明', 'match': True},
                                    {'from': '人的约束', 'to': '执行', 'relation_type': '限制', 'observed': '亏后仍按规则', 'visible_evidence': '执行区亏后条件与固定动作对照', 'match': True}],
                      'missing_relations': [], 'misread_relations': []}

    def tearDown(self):
        self.tmp.cleanup()

    def test_complete_current_readback_passes_without_mutation(self):
        before = copy.deepcopy(self.check)
        self.assertEqual(module.framework_errors(self.check, self.basis, 'P01'), [])
        self.assertEqual(self.check, before)

    def test_point_coverage_and_summary_do_not_replace_relations(self):
        self.check['relations'] = self.check['relations'][:1]
        self.assertTrue(module.framework_errors(self.check, self.basis, 'P01'))

    def test_duplicate_relation_cannot_cover_another(self):
        self.check['relations'][1] = copy.deepcopy(self.check['relations'][0])
        self.assertTrue(module.framework_errors(self.check, self.basis, 'P01'))

    def test_wrong_direction_and_type_rejected(self):
        for field, value in [('from', '退出'), ('relation_type', '因果')]:
            with self.subTest(field=field):
                check = copy.deepcopy(self.check)
                check['relations'][0][field] = value
                self.assertTrue(module.framework_errors(check, self.basis, 'P01'))

    def test_empty_evidence_false_match_and_unresolved_gap_rejected(self):
        for field, value in [('visible_evidence', '  '), ('observed', ''), ('match', False)]:
            check = copy.deepcopy(self.check)
            check['relations'][0][field] = value
            self.assertTrue(module.framework_errors(check, self.basis, 'P01'))
        self.check['missing_relations'] = ['框架缺口']
        self.assertTrue(module.framework_errors(self.check, self.basis, 'P01'))

    def test_changed_or_unbound_basis_rejected(self):
        self.assertTrue(module.framework_errors(self.check, None, 'P01'))
        self.path.write_text('{}')
        self.assertTrue(module.framework_errors(self.check, self.basis, 'P01'))

    def test_old_readback_cannot_be_silently_upgraded(self):
        self.assertTrue(module.framework_errors(None, self.basis, 'P01'))


if __name__ == '__main__':
    unittest.main()
