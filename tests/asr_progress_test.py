import contextlib
import io
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'workers'))
from asr_progress import ProgressReporter

class ProgressTests(unittest.TestCase):
    def test_heartbeat_and_terminal_state(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stderr(io.StringIO()) as stream:
            path = Path(directory) / 'progress.json'
            with ProgressReporter(path, 'key', interval=0.01) as progress:
                progress.stage('transcribing')
                time.sleep(0.05)
                progress.stage('saving')
                progress.stage('completed', receipt='receipt.json')
            payload = json.loads(path.read_text())
            events = [json.loads(x) for x in stream.getvalue().splitlines()]
            self.assertGreaterEqual(sum(x['status'] == 'transcribing' for x in events), 3)
            self.assertEqual(payload['status'], 'completed')
            self.assertIsNone(payload['progress_percent'])
            self.assertIsNone(payload['processed_audio_ms'])
            self.assertGreater(payload['elapsed_seconds'], 0)
            self.assertEqual(events[-1]['status'], 'completed')

    def test_failure_does_not_claim_completion(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stderr(io.StringIO()):
            path = Path(directory) / 'progress.json'
            with self.assertRaisesRegex(RuntimeError, 'provider failed'):
                with ProgressReporter(path, 'key', interval=0.01) as progress:
                    progress.stage('transcribing')
                    raise RuntimeError('provider failed')
            self.assertEqual(json.loads(path.read_text())['status'], 'failed')

if __name__ == '__main__':
    unittest.main()
