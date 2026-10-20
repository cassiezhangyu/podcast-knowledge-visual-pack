"""核对证据范围与推进约束，不模拟读者理解或审美。"""
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str((Path(__file__).resolve().parents[2]) / 'scripts'))
from check_visual_progression import reader_provenance_errors, validate


class ReaderProvenanceTests(unittest.TestCase):
    def reader(self, mode, exposure):
        return {'review_mode': mode, 'prior_exposure': exposure,
                'readback_scope': '本轮只读当前图，接触情况按字段披露；仅测试记录'}

    def test_legacy_compatibility_and_new_required_disclosure(self):
        self.assertEqual(reader_provenance_errors({}), [])
        self.assertTrue(reader_provenance_errors({}, required=True))

    def test_known_or_unknown_context_cannot_claim_first_read(self):
        for exposure in ('content_or_draft', 'unknown'):
            self.assertTrue(reader_provenance_errors(self.reader('first_read', exposure), True))

    def test_honest_regression_and_first_read_are_allowed(self):
        for mode, exposure in [('first_read', 'none'), ('informed_regression', 'content_or_draft'), ('informed_regression', 'unknown')]:
            self.assertEqual(reader_provenance_errors(self.reader(mode, exposure), True), [])

    def test_new_prototype_cannot_omit_provenance(self):
        # 本fixture有其他缺项，只验证1.1推进时确实接入披露检查。
        report = {'schema_version': '1.1', 'cases': [{'case': 'A', 'unfamiliar_reader_check': {}}]}
        self.assertTrue(any('上下文' in e for e in validate(report, 'prototype', 'A')))

    def test_partial_and_blank_disclosure_are_rejected(self):
        self.assertTrue(reader_provenance_errors({'review_mode': 'informed_regression'}))
        reader = self.reader('informed_regression', 'content_or_draft')
        reader['readback_scope'] = ' '
        self.assertTrue(reader_provenance_errors(reader, True))
