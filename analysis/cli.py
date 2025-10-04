# analysis/cli.py
# Minimal QUESO CLI that wraps your legacy src/main.py `process()` and
# keeps meta.json updated so the UI can poll /api/status.

from __future__ import annotations
import argparse, json, sys, time, threading, traceback, importlib, types
from pathlib import Path
from typing import Any, Dict

PRODUCT = "queso"
SCHEMA  = "queso-artifacts@1"

def _read_json_arg(maybe_json: str) -> Dict[str, Any]:
    """Accept either a JSON string or a path to a JSON file."""
    s = (maybe_json or "").strip()
    if not s:
        return {}
    p = Path(s)
    if p.exists() and p.is_file():
        return json.loads(p.read_text(encoding="utf-8"))
    return json.loads(s)

class MetaWriter:
    def __init__(self, out_dir: Path, base: Dict[str, Any]) -> None:
        self.path = out_dir / "meta.json"
        self.meta = dict(base)
        self._lock = threading.Lock()
        self._alive = True
        self._hb = threading.Thread(target=self._heartbeat, daemon=True)
        self._hb.start()

    def _heartbeat(self) -> None:
        # Touch "updated" field so the UI can see liveness while process() is running.
        while self._alive:
            with self._lock:
                self.meta["updated"] = time.time()
                self.path.write_text(json.dumps(self.meta), encoding="utf-8")
            time.sleep(1.0)

    def write(self, **fields: Any) -> None:
        with self._lock:
            self.meta.update(fields)
            self.meta["updated"] = time.time()
            self.path.write_text(json.dumps(self.meta), encoding="utf-8")

    def stop(self) -> None:
        self._alive = False
        # one last flush
        with self._lock:
            self.meta["updated"] = time.time()
            self.path.write_text(json.dumps(self.meta), encoding="utf-8")

def main() -> int:
    ap = argparse.ArgumentParser(description="QUESO analyze (wraps src.main.process)")
    ap.add_argument("--input", required=True, help="file path or URL")
    ap.add_argument("--out", required=True, help="artifacts output directory")
    ap.add_argument("--opts", default="{}", help="JSON string or path to JSON file")
    args = ap.parse_args()

    input_path = args.input
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    opts: Dict[str, Any] = _read_json_arg(args.opts)

    base_meta = {
        "product": PRODUCT,
        "schema": SCHEMA,
        "input": input_path,
        "opts": opts,
        "started": time.time(),
        "progress": 0,
        "phase": "init",
        "status": "running",
    }
    meta = MetaWriter(out_dir, base_meta)

    # Log helper: prints (for /api/logs) and also appends to meta.log (optional).
    def log(msg: str) -> None:
        print(msg, flush=True)

    try:
        # Resolve your legacy orchestrator
        try:
            mod = importlib.import_module("src.main")
        except ModuleNotFoundError:
            root = Path(__file__).resolve().parents[1]
            yt2rpr_src = root / "external" / "yt2rpr" / "src"
            if yt2rpr_src.is_dir():
                pkg = types.ModuleType("src")
                pkg.__path__ = [str(yt2rpr_src)]
                sys.modules.setdefault("src", pkg)
                sys.path.append(str(yt2rpr_src.parent))
                mod = importlib.import_module("src.main")
            else:
                raise
        if not hasattr(mod, "process"):
            raise AttributeError("src.main.process not found")

        meta.write(progress=5, phase="starting", status="running")
        log("[QUESO] starting process()")

        # Optional: seed/cancel hooks could be read from opts
        # (e.g., opts.get('seed'), etc). Keep it minimal for now.

        # Call your real pipeline
        mod.process(input_path, str(out_dir), opts)

        # If your process() writes some artifacts progressively, we keep HB alive.
        meta.write(progress=100, phase="done", status="done", ended=time.time())
        log("[QUESO] done")
        return 0

    except Exception as e:
        tb = traceback.format_exc(limit=6)
        meta.write(status="failed", error=str(e), traceback=tb, phase="error", ended=time.time())
        print(f"[QUESO][error] {e}", file=sys.stderr, flush=True)
        print(tb, file=sys.stderr, flush=True)
        return 1

    finally:
        meta.stop()

if __name__ == "__main__":
    raise SystemExit(main())