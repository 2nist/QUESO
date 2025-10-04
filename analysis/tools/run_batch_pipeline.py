"""Batch runner for QUESO analysis pipeline.

Reads a list of inputs (local files and/or URLs) and invokes the CLI wrapper
for each entry, writing outputs into timestamped artifact directories. Useful
for manual regression testing when tuning analysis heuristics.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Tuple

ROOT = Path(__file__).resolve().parents[2]
CLI_MODULE = "analysis.cli"
DEFAULT_INPUTS = ROOT / "analysis" / "test_inputs" / "sources.json"
DEFAULT_OUT_ROOT = ROOT / "artifacts" / "test" / "batch_runs"


def _slugify(label: str) -> str:
    safe = "".join(ch if ch.isalnum() else "-" for ch in label)
    safe = "-".join(part for part in safe.split("-") if part)
    return safe[:48] or "input"


def _load_sources(path: Path) -> List[Tuple[str, str]]:
    if not path.exists():
        raise FileNotFoundError(f"Sources file not found: {path}")
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"Sources file {path} is empty")

    if path.suffix.lower() == ".json":
        payload = json.loads(text)
        entries: List[Tuple[str, str]] = []
        if isinstance(payload, dict):
            items = []
            for key, values in payload.items():
                if isinstance(values, Iterable):
                    for value in values:
                        if isinstance(value, str) and value.strip():
                            items.append((f"{key}", value.strip()))
            entries.extend(items)
        elif isinstance(payload, list):
            for value in payload:
                if isinstance(value, str) and value.strip():
                    entries.append(("auto", value.strip()))
        else:
            raise ValueError("JSON sources file must be list or dict")
        if not entries:
            raise ValueError(f"No usable entries found in {path}")
        return entries

    # Plain text fallback: one entry per line
    entries = []
    for line in text.splitlines():
        entry = line.strip()
        if entry and not entry.startswith("#"):
            entries.append(("auto", entry))
    if not entries:
        raise ValueError(f"No usable entries found in {path}")
    return entries


def _invoke_cli(input_arg: str, out_dir: Path, *, extra_opts: dict[str, object] | None = None) -> subprocess.CompletedProcess:
    cmd = [
        sys.executable,
        "-m",
        CLI_MODULE,
        "--input",
        input_arg,
        "--out",
        str(out_dir),
    ]
    if extra_opts:
        cmd.extend(["--opts", json.dumps(extra_opts)])
    return subprocess.run(cmd, text=True, capture_output=True)


def run_batch(sources_file: Path, out_root: Path, repeats: int, extra_opts: dict[str, object] | None = None) -> None:
    sources = _load_sources(sources_file)
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    batch_root = out_root / timestamp
    batch_root.mkdir(parents=True, exist_ok=True)

    summary: List[dict[str, object]] = []

    for repeat in range(repeats):
        for idx, (tag, value) in enumerate(sources, start=1):
            label = f"{repeat+1:02d}-{idx:02d}-{_slugify(value if tag == 'auto' else tag)}"
            out_dir = batch_root / label
            out_dir.mkdir(parents=True, exist_ok=True)
            start = time.perf_counter()
            result = _invoke_cli(value, out_dir, extra_opts=extra_opts)
            elapsed = time.perf_counter() - start

            meta_path = out_dir / "meta.json"
            status = "unknown"
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    status = meta.get("status", status)
                except Exception:
                    status = "meta-corrupt"
            else:
                status = "missing-meta"

            summary.append(
                {
                    "input": value,
                    "tag": tag,
                    "out_dir": str(out_dir.relative_to(ROOT)),
                    "returncode": result.returncode,
                    "status": status,
                    "elapsed_sec": round(elapsed, 2),
                }
            )

            if result.returncode != 0:
                print(f"[ERROR] Run failed for {value} -> {out_dir}")
                print(result.stderr or result.stdout)
            else:
                print(f"[OK] {value} -> {out_dir} ({elapsed:.1f}s, status={status})")

    summary_path = batch_root / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\nSummary written to {summary_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch runner for queso analysis CLI")
    parser.add_argument("--sources", type=Path, default=DEFAULT_INPUTS, help="Path to JSON/txt list of inputs")
    parser.add_argument("--out-root", type=Path, default=DEFAULT_OUT_ROOT, help="Directory to store batch outputs")
    parser.add_argument("--repeats", type=int, default=1, help="Number of passes over the sources list")
    parser.add_argument("--opts", type=str, help="JSON string of extra opts to forward to CLI")
    args = parser.parse_args()

    extra_opts = json.loads(args.opts) if args.opts else None
    run_batch(args.sources, args.out_root, max(1, args.repeats), extra_opts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
