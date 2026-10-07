"""转写心跳：只报告存活和阶段，不估算完成百分比。"""
import json
import os
import threading
import time
from pathlib import Path


class ProgressReporter:
    def __init__(self, path, asr_key, interval=10):
        self.path = Path(path)
        self.asr_key = asr_key
        self.interval = interval
        self.started = time.monotonic()
        self.started_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        self.status = 'starting'
        self.details = {}
        self.stop = threading.Event()
        self.lock = threading.Lock()
        self.thread = threading.Thread(target=self._heartbeat, daemon=True)

    def _write(self):
        payload = {'event': 'asr.progress', 'asr_key': self.asr_key, 'status': self.status,
                   'started_at': self.started_at, 'updated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                   'elapsed_seconds': round(time.monotonic() - self.started, 3),
                   'progress_percent': None, 'processed_audio_ms': None,
                   'heartbeat': {'actor': 'mlx-whisper-provider', 'pid': os.getpid(), 'meaning': 'process_alive'},
                   'details': self.details}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name('.' + self.path.name + '.tmp')
        temporary.write_text(json.dumps(payload, ensure_ascii=False) + '\n', encoding='utf-8')
        os.replace(temporary, self.path)
        import sys
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr, flush=True)

    def stage(self, status, **details):
        with self.lock:
            self.status, self.details = status, details
            self._write()

    def _heartbeat(self):
        while not self.stop.wait(self.interval):
            with self.lock:
                self._write()

    def __enter__(self):
        self.stage('starting')
        self.thread.start()
        return self

    def __exit__(self, kind, error, traceback):
        self.stop.set()
        self.thread.join()
        if error is not None:
            self.stage('failed', message=str(error))
        elif self.status != 'completed':
            self.stage('failed', message='转写未提交完成回执')
        return False
