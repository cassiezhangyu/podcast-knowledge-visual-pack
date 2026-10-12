import importlib.util, pathlib, unittest
p = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'check_reader_facing_text.py'
spec = importlib.util.spec_from_file_location('crf', p); crf = importlib.util.module_from_spec(spec); spec.loader.exec_module(crf)
T = lambda s: {'type': 'text', 'id': s, 'text': s}

class ReaderFacingText(unittest.TestCase):
    def test_reader_facing_map_passes(self):
        self.assertEqual(crf.find_violations([T('整包内容地图'), T('本期内容'), T('· 主播五步')]), [])
    def test_scope_and_deferred_metadata_rejected(self):
        for s in ['本轮范围：\n只做总览', '暂缓的深读主题\n（未出页）', 'deferred topics', 'production_scope']:
            self.assertEqual(len(crf.find_violations([T(s)])), 1, s)
    def test_deleted_elements_ignored(self):
        self.assertEqual(crf.find_violations([{**T('未出页'), 'isDeleted': True}]), [])

if __name__ == '__main__':
    unittest.main()
