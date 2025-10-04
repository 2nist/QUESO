from __future__ import annotations
from pathlib import Path
from typing import Dict, Any
from .progress import MetaProgress
from .artifacts import write_lab_start_end, write_lrc, write_tempo
from .adapters import yt2rpr_adapter as A

def run_pipeline(input_path: str, out_dir: Path, opts: Dict[str,Any], meta: MetaProgress) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    opts = dict(opts or {})
    opts['out_dir'] = str(out_dir)

    # tempo with bar-alignment options passed through and progress callbacks
    if meta.is_cancelled():
        return
    opts['on_progress'] = lambda frac: meta.step(int(5 + 10*max(0.0, min(1.0, float(frac)))), phase="tempo")
    bpm, beats = A.tempo_and_beats(input_path, opts)
    write_tempo(out_dir / "tempo.json", bpm, beats)
    meta.step(18, phase="tempo")

    # chords with normalization
    if meta.is_cancelled():
        return
    meta.step(22, phase="chords")
    chords = A.chords(input_path, opts)
    write_lab_start_end(out_dir / "chords.lab", chords)
    meta.step(45, phase="chords")

    # sections with spectral thresholds from profiles
    if meta.is_cancelled():
        return
    meta.step(50, phase="sections")
    sections = A.sections(input_path, opts)
    # sections.lab is already written by the adapter
    meta.step(72, phase="sections")

    # lyrics with word-level LRC when available
    if meta.is_cancelled():
        return
    meta.step(75, phase="lyrics")
    lrc_rows = A.lyrics(input_path, opts)
    # lyrics.lrc/.srt and word-level LRC are already written by the adapter
    meta.step(92, phase="lyrics")

    meta.step(99, phase="finalize")
