import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from content_plan_mapping import resolve_production_scope, check_deep_dive_targets

MODULES = {'mod_01', 'mod_02'}
UNITS = {'cu_01', 'cu_02', 'cu_03'}
MODULE_UNITS = {'mod_01': ['cu_01', 'cu_02'], 'mod_02': ['cu_03']}


def plan(pages=None, targets=None):
    p = {}
    if pages is not None:
        p['production_scope'] = {'pages': pages, 'source': 'user_specified', 'user_words': 'x'}
        if targets is not None:
            p['production_scope']['deep_dive_targets'] = targets
    return p


class ProductionScopeTest(unittest.TestCase):
    def test_full_pack_default(self):
        scope = resolve_production_scope(plan(), MODULES, UNITS)
        self.assertEqual(scope['pages'], ['cover', 'overview', 'deep_dive'])
        self.assertEqual(scope['source'], 'default_full_pack')

    def test_cover_only(self):
        self.assertEqual(resolve_production_scope(plan(['cover']), MODULES, UNITS)['pages'], ['cover'])

    def test_overview_only(self):
        self.assertEqual(resolve_production_scope(plan(['overview']), MODULES, UNITS)['pages'], ['overview'])

    def test_deep_dive_only(self):
        scope = resolve_production_scope(plan(['deep_dive']), MODULES, UNITS)
        self.assertEqual(scope['pages'], ['deep_dive'])
        check_deep_dive_targets(scope, [{'page_id': 'DD1', 'module_ids': ['mod_01']}, {'page_id': 'DD2', 'module_ids': ['mod_02']}], MODULE_UNITS)

    def test_combination_is_canonically_ordered(self):
        self.assertEqual(resolve_production_scope(plan(['deep_dive', 'cover']), MODULES, UNITS)['pages'], ['cover', 'deep_dive'])

    def test_targeted_deep_dive_by_module_and_unit(self):
        scope = resolve_production_scope(plan(['deep_dive'], [{'topic': '证据', 'module_ids': ['mod_02']}]), MODULES, UNITS)
        check_deep_dive_targets(scope, [{'page_id': 'DD1', 'module_ids': ['mod_02']}], MODULE_UNITS)
        with self.assertRaisesRegex(ValueError, 'deep_dive_targets'):
            check_deep_dive_targets(scope, [{'page_id': 'DD2', 'module_ids': ['mod_01']}], MODULE_UNITS)
        scope = resolve_production_scope(plan(['deep_dive'], [{'topic': '自由文本主题', 'unit_ids': ['cu_02']}]), MODULES, UNITS)
        check_deep_dive_targets(scope, [{'page_id': 'DD1', 'module_ids': ['mod_01']}], MODULE_UNITS)

    def test_invalid_scopes_rejected(self):
        for bad in [plan([]), plan(['poster']), plan(['overview', 'overview'])]:
            with self.assertRaises(ValueError):
                resolve_production_scope(bad, MODULES, UNITS)
        with self.assertRaisesRegex(ValueError, 'user_specified'):
            resolve_production_scope({'production_scope': {'pages': ['overview'], 'source': 'default_full_pack'}})
        with self.assertRaisesRegex(ValueError, 'deep_dive_targets'):
            resolve_production_scope(plan(['overview'], [{'topic': 't', 'module_ids': ['mod_01']}]), MODULES, UNITS)
        with self.assertRaisesRegex(ValueError, 'topic'):
            resolve_production_scope(plan(['deep_dive'], [{'module_ids': ['mod_01']}]), MODULES, UNITS)
        with self.assertRaisesRegex(ValueError, '不存在的模块'):
            resolve_production_scope(plan(['deep_dive'], [{'topic': 't', 'module_ids': ['mod_99']}]), MODULES, UNITS)


if __name__ == '__main__':
    unittest.main()
