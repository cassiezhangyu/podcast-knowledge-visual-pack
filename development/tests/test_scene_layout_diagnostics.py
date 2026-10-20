import importlib.util
import json
from pathlib import Path
import unittest

ROOT = (Path(__file__).resolve().parents[2])
spec = importlib.util.spec_from_file_location('layout', ROOT / 'scripts/audit_scene_layout.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
TOKENS = json.loads((ROOT / 'design_tokens.json').read_text())


def text(id, y):
    return {'id': id, 'type': 'text', 'x': 80, 'y': y, 'width': 200, 'height': 30,
            'fontSize': 24, 'lineHeight': 1.25, 'text': id, 'customData': {'typography_role': 'body'}}


class Diagnostics(unittest.TestCase):
    def test_positive_gap_below_threshold_is_reported(self):
        scene = {'elements': [text('一', 80), text('二', 115)]}
        self.assertTrue(module.diagnose(scene, TOKENS, 12)['findings'])
        self.assertFalse(module.diagnose(scene, TOKENS, 4)['findings'])

    def test_columns_and_deleted_elements_do_not_false_alarm(self):
        a, b = text('一', 80), text('二', 80)
        b['x'] = 400
        deleted = {**text('已删除', 80), 'isDeleted': True}
        self.assertFalse(module.diagnose({'elements': [a, b, deleted]}, TOKENS)['findings'])

    def test_long_relation_is_risk_but_valid_dashes_and_complex_objects_are_allowed(self):
        relation = {'id': '关系', 'type': 'arrow', 'width': 300, 'height': 0, 'roughness': 2,
                    'points': [[0, 0], [300, 0]], 'customData': {'stroke_role': 'relation'}}
        obj = {**relation, 'id': '对象', 'strokeStyle': 'dashed', 'points': [[i, 0] for i in range(20)], 'customData': {'stroke_role': 'object'}}
        result = module.diagnose({'elements': [relation, obj]}, TOKENS)
        self.assertEqual([f['ids'] for f in result['findings']], [['关系']])
        self.assertEqual(result['status'], 'needs_rendered_review')

    def test_tall_ellipse_and_dense_curve_are_detected(self):
        ellipse = {'id': '椭圆', 'type': 'ellipse', 'width': 20, 'height': 100, 'roughness': 2}
        curve = {'id': '曲线', 'type': 'line', 'width': 10, 'height': 10, 'roughness': .9,
                 'points': [[i, i] for i in range(8)], 'customData': {'stroke_role': 'curve'}}
        kinds = {f['kind'] for f in module.diagnose({'elements': [ellipse, curve]}, TOKENS)['findings']}
        self.assertEqual(kinds, {'ellipse_stroke_risk', 'curve_control_points'})


if __name__ == '__main__':
    unittest.main()
