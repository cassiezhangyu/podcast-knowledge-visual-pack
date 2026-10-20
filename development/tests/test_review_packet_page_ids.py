import importlib.util, pathlib, sys, unittest
root = (pathlib.Path(__file__).resolve().parents[2]) / 'scripts'
sys.path.insert(0, str(root))
spec = importlib.util.spec_from_file_location('pir', root / 'prepare_independent_review.py'); pir = importlib.util.module_from_spec(spec); spec.loader.exec_module(pir)

class PacketPageIds(unittest.TestCase):
    def test_manifest_page_id_carried(self):
        self.assertEqual(pir.packet_page_ids('P01', 'edp_overview_x'), {'page_id': 'P01', 'manifest_page_id': 'edp_overview_x'})
    def test_default_same_as_page_id(self):
        self.assertEqual(pir.packet_page_ids('P01', None), {'page_id': 'P01', 'manifest_page_id': 'P01'})

if __name__ == '__main__':
    unittest.main()
