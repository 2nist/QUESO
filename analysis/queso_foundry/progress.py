from __future__ import annotations
from pathlib import Path
import json, time
from typing import Optional

class MetaProgress:
    def __init__(self, out_dir: Path, product: str = 'queso', schema: str = 'queso-artifacts@1', input_path: Optional[str]=None, opts: Optional[dict]=None):
        self.path = out_dir / 'meta.json'
        self.meta = {
            'product': product,
            'schema': schema,
            'input': input_path,
            'opts': opts or {},
            'started': time.time(),
            'progress': 0,
            'status': 'running'
        }
        self._flush()

    def _flush(self):
        self.meta['updated'] = time.time()
        self.path.write_text(json.dumps(self.meta), encoding='utf-8')

    def step(self, pct: int, phase: str = ''):
        self.meta['progress'] = max(self.meta.get('progress', 0), int(pct))
        if phase:
            self.meta['phase'] = phase
        self._flush()

    def done(self):
        self.meta['progress'] = 100
        self.meta['ended'] = time.time()
        self.meta['status'] = 'done'
        self._flush()

    def fail(self, err: Exception):
        self.meta['ended'] = time.time()
        self.meta['status'] = 'failed'
        self.meta['error'] = str(err)
        self._flush()

    def is_cancelled(self) -> bool:
        return False
