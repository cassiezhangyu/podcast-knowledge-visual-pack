import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from content_plan_mapping import check_overview_count, component_role, connector_kind, build_relationships


class ApprovedPlanMappingTest(unittest.TestCase):
    def test_parallel_context_keeps_explicit_semantics(self):
        plan = {'overview_pages': [{'page_id': 'overview'}]}
        check_overview_count(plan)
        self.assertEqual(component_role({'id': '现象', 'model_role': 'signal'}), 'signal')
        self.assertEqual(connector_kind({'from_component': '现象', 'to_component': '边界', 'connector_kind': 'parallel_context'}), 'parallel_context')

    def test_causal_relation_requires_approved_graph_evidence(self):
        self.assertEqual(component_role({'id': '机制', 'model_role': 'process'}), 'process')
        with self.assertRaisesRegex(ValueError, 'accepted_relationship'):
            connector_kind({'from_component': '机制', 'to_component': '结果', 'connector_kind': 'relationship'})
        self.assertEqual(connector_kind({'connector_kind': 'relationship', 'accepted_relationship': {'from_source_id': 'det_1'}}), 'relationship')
        ledger = [{'connector_kind': 'relationship', 'accepted_relationship': {'from_source_id': 'det_1', 'to_source_id': 'mod_2', 'type': 'explains', 'direction': 'directed', 'evidence_anchor_ids': ['ea_1']}}]
        relationships, relation_map = build_relationships(ledger, {'det_1': 'clm_det_1', 'mod_2': 'clm_mod_2'}, {'ea_1'})
        self.assertEqual(relationships[0]['from_id'], 'clm_det_1')
        self.assertEqual(relationships[0]['to_id'], 'clm_mod_2')
        self.assertEqual(relation_map, {1: 'rel_approved_1'})
        with self.assertRaisesRegex(ValueError, '证据锚点'):
            build_relationships(ledger, {'det_1': 'clm_det_1', 'mod_2': 'clm_mod_2'}, set())

    def test_missing_semantics_and_continuation_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'model_role'):
            component_role({'id': '个人回应'})
        with self.assertRaisesRegex(ValueError, 'connector_kind'):
            connector_kind({'from_component': 'A', 'to_component': 'B'})
        check_overview_count({'overview_pages': [{'page_id': 'P01'}, {'page_id': 'P02'}]})
        with self.assertRaisesRegex(ValueError, '重复'):
            check_overview_count({'overview_pages': [{'page_id': 'P01'}, {'page_id': 'P01'}]})


if __name__ == '__main__':
    unittest.main()
