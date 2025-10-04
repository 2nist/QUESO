# analysis/cli.py
# Minimal QUESO CLI that wraps your legacy src/main.py `process()` and
# keeps meta.json updated so the UI can poll /api/status.

from __future__ import annotations
import argparse
import importlib
import json
import sys
import threading
import time
import traceback
from pathlib import Path
from typing import Any, Dict, Optional

PRODUCT = "queso"
SCHEMA  = "queso-artifacts@1"


def _prepare_backend_paths() -> Optional[Path]:
    """Ensure external/yt2rpr/src is importable as the `src` package."""
    root = Path(__file__).resolve().parents[1]
    yt2rpr_src = root / "external" / "yt2rpr" / "src"
    if not yt2rpr_src.is_dir():
        return None
    parent = str(yt2rpr_src.parent)
    if parent not in sys.path:
        sys.path.insert(0, parent)
    return yt2rpr_src


def _resolve_input_path(raw_input: str, out_dir: Path, opts: Dict[str, Any]) -> str:
    """Download remote inputs before dispatching to process()."""
    if raw_input.lower().startswith(("http://", "https://")):
        try:
            yt_tools = importlib.import_module("src.youtube_tools")
        except ModuleNotFoundError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError(
                "YouTube/URL inputs require src.youtube_tools; ensure external/yt2rpr is available"
            ) from exc

        cache_dir = out_dir / "source"
        cache_dir.mkdir(parents=True, exist_ok=True)
        download_path = yt_tools.yt_to_mp3(raw_input, str(cache_dir))
        opts.setdefault("source", {})
        opts["source"].setdefault("type", "url")
        opts["source"]["url"] = raw_input
        opts["source"]["local_path"] = download_path
        return download_path

    # G_NEW: Resolve "test_input" from sources.json
    if raw_input == "test_input":
        sources_path = Path(__file__).parent / "test_inputs" / "sources.json"
        if sources_path.exists():
            try:
                sources = json.loads(sources_path.read_text(encoding="utf-8"))
                local_files = sources.get("local", [])
                if local_files:
                    # Use the first local file as the resolved path.
                    # Note: assumes paths in sources.json are relative to project root.
                    resolved_path = (Path(__file__).parent.parent / local_files[0]).resolve()
                    if resolved_path.exists():
                        return str(resolved_path)
            except (json.JSONDecodeError, IndexError):
                pass  # Fall through if JSON is bad or list is empty

    return raw_input

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
        _prepare_backend_paths()
        mod = importlib.import_module("src.main")
        if not hasattr(mod, "process"):
            raise AttributeError("src.main.process not found")

        resolved_input = _resolve_input_path(input_path, out_dir, opts)
        if resolved_input != input_path:
            log(f"[QUESO] downloaded input -> {resolved_input}")
            meta.write(progress=10, phase="downloaded", resolved_input=resolved_input, status="running")

        meta.write(progress=5, phase="starting", status="running")
        log("[QUESO] starting process()")

        # Optional: seed/cancel hooks could be read from opts
        # (e.g., opts.get('seed'), etc). Keep it minimal for now.

        # Call your real pipeline
        mod.process(resolved_input, str(out_dir), opts)

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
