from __future__ import annotations
from pathlib import Path
import json
from typing import Iterable, Tuple

Triplet = Tuple[float, float, str]


def write_tempo(path: Path, bpm: float, beat_times: Iterable[float]) -> None:
    path.write_text(json.dumps({
        'bpm': float(bpm),
        'beat_times': [float(t) for t in beat_times],
    }), encoding='utf-8')


def write_lab_start_end(path: Path, rows: Iterable[Triplet]) -> None:
    lines = []
    for s, e, lab in rows:
        lines.append(f"{float(s):.6f} {float(e):.6f} {lab}")
    path.write_text("\n".join(lines) + "\n", encoding='utf-8')


def write_lrc(path: Path, rows: Iterable[Tuple[float, str]]) -> None:
    lines = []
    for t, text in rows:
        m = int(t // 60)
        s = t - m * 60
        lines.append(f"[{m:02d}:{s:05.2f}] {text}")
    path.write_text("\n".join(lines) + "\n", encoding='utf-8')
