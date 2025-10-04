from __future__ import annotations
import os, json, shlex, subprocess, importlib
from pathlib import Path
from typing import Any, Dict, List, Tuple, Callable

USE = os.environ.get("QUESO_ADAPTER_MODE", "py").lower()

def _import(module: str):
    return importlib.import_module(module)

def _resolve(module: str, candidates: List[str]) -> Callable:
    mod = _import(module)
    for name in candidates:
        fn = getattr(mod, name, None)
        if callable(fn): return fn
    raise AttributeError(f"No candidate found in {module} among {candidates}")

def _run(cmd: str, cwd: Path | None = None):
    return subprocess.run(shlex.split(cmd), cwd=cwd, text=True, capture_output=True)

_ENH_SHARP = {
    'Cb':'B', 'Db':'C#', 'Eb':'D#', 'Fb':'E', 'Gb':'F#', 'Ab':'G#', 'Bb':'A#'
}
_ENH_FLAT = {
    'B#':'C', 'C#':'Db', 'D#':'Eb', 'E#':'F', 'F#':'Gb', 'G#':'Ab', 'A#':'Bb'
}

def _canon_root(root: str, enh: str = 'sharp') -> str:
    r = root.strip().upper().replace('M', '')  # strip accidental mistakes like "Am" as root
    if len(r) >= 2 and r[1] in ('#','B'):
        r = r[0] + ('#' if r[1] == '#' else 'b')
    if enh == 'sharp' and r in _ENH_SHARP:
        return _ENH_SHARP[r]
    if enh == 'flat' and r in _ENH_FLAT:
        return _ENH_FLAT[r]
    return r

def _normalize_chord_label(label: str, enh: str = 'sharp') -> str:
    lab = label.strip()
    if not lab:
        return lab
    if ':' in lab:
        left, right = lab.split(':', 1)
        root = _canon_root(left, enh)
        qual = right.strip().lower()
    else:
        root = _canon_root(lab[:2] if len(lab) > 1 and lab[1] in ('#','b','B') else lab[:1], enh)
        qual = lab[len(root):].strip().lower()
    repl = {
        'maj':'maj', 'major':'maj', 'm':'min', 'min':'min', 'minor':'min',
        'dim':'dim', 'aug':'aug', 'sus2':'sus2', 'sus4':'sus4'
    }
    outq = None
    for k,v in repl.items():
        if qual.startswith(k):
            outq = v + qual[len(k):]
            break
    if outq is None:
        outq = qual
    return f"{root}:{outq}" if outq else root

def _load_thresholds_profile(opts: Dict[str,Any]) -> Dict[str, Any]:
    if 'sections_thresholds' in opts and isinstance(opts['sections_thresholds'], dict):
        return opts['sections_thresholds']
    profile = opts.get('sections_profile')
    if not profile:
        return {}
    try:
        mod = importlib.import_module('processing_profiles')
        if hasattr(mod, profile):
            val = getattr(mod, profile)
            if isinstance(val, dict):
                return val
    except Exception:
        pass
    for cand in (Path.cwd()/ 'processing_profiles.json', Path.cwd()/ 'analysis'/ 'processing_profiles.json'):
        if cand.exists():
            try:
                data = json.loads(cand.read_text(encoding='utf-8'))
                if isinstance(data, dict) and profile in data and isinstance(data[profile], dict):
                    return data[profile]
            except Exception:
                pass
    return {}

def _read_lrc_or_srt(out_dir: Path):
    lrc = out_dir / "lyrics.lrc"
    if lrc.exists():
        rows=[]
        for line in lrc.read_text(encoding='utf-8').splitlines():
            line=line.strip()
            if not line or ']' not in line: continue
            ts, txt = line.split(']',1)
            ts = ts.strip('[]')
            m,s = ts.split(':')
            t = int(m)*60 + float(s)
            rows.append((t, txt.strip()))
        return rows
    srt = out_dir / "video_subtitles.srt"
    if srt.exists():
        import re
        rows=[]
        blocks = re.split(r'\n\s*\n', srt.read_text(encoding='utf-8').strip(), flags=re.M)
        for b in blocks:
            lines=[ln.strip() for ln in b.splitlines() if ln.strip()]
            if len(lines) < 2: continue
            m=re.search(r'(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})', lines[1])
            if not m: continue
            h1,m1,s1,ms1,h2,m2,s2,ms2 = map(int, m.groups())
            st = h1*3600+m1*60+s1+ms1/1000.0
            txt = " ".join(lines[2:])
            rows.append((st, txt))
        return rows
    return []

def _normalize_triplets(rows):
    out=[]
    for a,b,c in rows:
        s=float(a); e=float(b); lab=str(c)
        if e <= s: e = s + 1e-3
        out.append((s,e,lab))
    out.sort(key=lambda x:x[0])
    return out

def _try_write_word_level_lrc(out_dir: Path) -> bool:
    cands = [out_dir/ 'whisper.json', out_dir/ 'lyrics.words.json', out_dir/ 'lyrics.json']
    for p in cands:
        if not p.exists():
            continue
        try:
            data = json.loads(p.read_text(encoding='utf-8'))
        except Exception:
            continue
        lines: List[str] = []
        segments = data.get('segments') if isinstance(data, dict) else None
        if isinstance(segments, list):
            for seg in segments:
                words = seg.get('words') if isinstance(seg, dict) else None
                if not isinstance(words, list) or not words:
                    t = float(seg.get('start', 0.0)) if isinstance(seg, dict) else 0.0
                    txt = str(seg.get('text', '')).strip() if isinstance(seg, dict) else ''
                    m = int(t // 60); s = t - m*60
                    lines.append(f"[{m:02d}:{s:05.2f}] {txt}")
                    continue
                parts = []
                for w in words:
                    if not isinstance(w, dict):
                        continue
                    wt = float(w.get('start', seg.get('start', 0.0)))
                    m = int(wt // 60); s = wt - m * 60
                    parts.append(f"<{m:02d}:{s:05.2f}>{str(w.get('word','')).strip()}")
                if parts:
                    first_t = float(words[0].get('start', seg.get('start', 0.0)))
                    m0 = int(first_t // 60); s0 = first_t - m0*60
                    lines.append(f"[{m0:02d}:{s0:05.2f}] " + " ".join(parts))
        if lines:
            (out_dir/ 'lyrics.word.lrc').write_text("\n".join(lines) + "\n", encoding='utf-8')
            return True
    return False

def tempo_and_beats_py(input_path: str, opts: Dict[str,Any]):
    fn = _resolve("src.analysis_service", ["analyze_tempo_beats","estimate_tempo"])
    cb = opts.get('on_progress')
    if callable(cb):
        try:
            cb(0.1)
        except Exception:
            pass
    bpm, beats = fn(input_path, opts.get("beats_per_bar"), opts.get("tuning_priors"), opts.get("debug", False))
    if callable(cb):
        try:
            cb(0.9)
        except Exception:
            pass
    return float(bpm), [float(x) for x in beats]

def sections_py(input_path: str, opts: Dict[str,Any]):
    fn = _resolve("src.section_tools", ["estimate_sections"])
    thresholds = _load_thresholds_profile(opts)
    rows = fn(
        song=opts.get("song"),
        out_dir=opts["out_dir"],
        max_sections=opts.get("max_sections", 7),
        chord_lab_path=opts.get("chord_lab_path"),
        min_section_duration=opts.get("min_section_duration", 4.0),
        bar_align=opts.get("sections_bar_align", True),
        spectral_validate=opts.get("sections_spectral_validate", True),
        validation_thresholds=thresholds,
    )
    return _normalize_triplets(rows)

def chords_py(input_path: str, opts: Dict[str,Any]):
    fn = _resolve("src.analysis_service", ["analyze_chord_progression"])
    rows = fn(input_path, opts.get("key_prior"), opts.get("genre_priors"), opts.get("debug", False))
    enh = opts.get('chord_enharmonic', 'sharp')
    return _normalize_triplets([(s,e,_normalize_chord_label(lab, enh)) for s,e,lab in rows])

def lyrics_py(input_path: str, opts: Dict[str,Any]):
    fn = _resolve("src.main", ["run_whisper","transcribe_lyrics"])
    fn(input_path, opts["out_dir"]) 
    _try_write_word_level_lrc(Path(opts["out_dir"]))
    return _read_lrc_or_srt(Path(opts["out_dir"]))

def tempo_and_beats_cli(input_path: str, opts: Dict[str,Any]):
    out_dir = Path(opts["out_dir"]); out_dir.mkdir(parents=True, exist_ok=True)
    cmd = f'python -m src.main --in {shlex.quote(input_path)} --out {shlex.quote(str(out_dir))} --no-lyrics --no-chords --no-melody --no-drums --no-beatgrid --no-sections'
    p = _run(cmd); tempo_path = out_dir / "tempo.json"
    if tempo_path.exists():
        data = json.loads(tempo_path.read_text(encoding='utf-8'))
        return float(data.get('bpm',0.0)), list(map(float, data.get('beat_times',[])))
    raise RuntimeError(p.stderr or p.stdout or "tempo.json missing")

def sections_cli(input_path: str, opts: Dict[str,Any]):
    out_dir = Path(opts["out_dir"]); out_dir.mkdir(parents=True, exist_ok=True)
    cmd = f'python -m src.main --in {shlex.quote(input_path)} --out {shlex.quote(str(out_dir))} --no-lyrics --no-chords --no-melody --no-drums --no-beatgrid'
    p = _run(cmd); lab = out_dir / "sections.lab"
    if lab.exists():
        rows=[]
        for ln in lab.read_text(encoding='utf-8').splitlines():
            parts = ln.split()
            if len(parts)>=3:
                s,e = float(parts[0]), float(parts[1]); label = " ".join(parts[2:])
                rows.append((s,e,label))
        return _normalize_triplets(rows)
    raise RuntimeError(p.stderr or p.stdout or "sections.lab missing")

def chords_cli(input_path: str, opts: Dict[str,Any]):
    out_dir = Path(opts["out_dir"]); out_dir.mkdir(parents=True, exist_ok=True)
    cmd = f'python -m src.main --in {shlex.quote(input_path)} --out {shlex.quote(str(out_dir))} --no-lyrics --no-melody --no-drums --no-beatgrid --no-sections'
    p = _run(cmd); lab = out_dir / "chords.lab"
    if lab.exists():
        rows=[]
        for ln in lab.read_text(encoding='utf-8').splitlines():
            parts = ln.split()
            if len(parts)>=3:
                s,e = float(parts[0]), float(parts[1]); label = " ".join(parts[2:])
                rows.append((s,e,label))
        enh = opts.get('chord_enharmonic', 'sharp')
        rows = [(s,e,_normalize_chord_label(lab, enh)) for s,e,lab in rows]
        return _normalize_triplets(rows)
    raise RuntimeError(p.stderr or p.stdout or "chords.lab missing")

def lyrics_cli(input_path: str, opts: Dict[str,Any]):
    out_dir = Path(opts["out_dir"]); out_dir.mkdir(parents=True, exist_ok=True)
    cmd = f'python -m src.main --in {shlex.quote(input_path)} --out {shlex.quote(str(out_dir))} --no-chords --no-melody --no-drums --no-beatgrid --no-sections'
    p = _run(cmd); rows = _read_lrc_or_srt(out_dir)
    _try_write_word_level_lrc(out_dir)
    if rows: return rows
    raise RuntimeError(p.stderr or p.stdout or "lyrics.lrc/.srt missing")

def tempo_and_beats(input_path: str, opts: Dict[str,Any]): 
    return (tempo_and_beats_py if USE=='py' else tempo_and_beats_cli)(input_path, opts)

def sections(input_path: str, opts: Dict[str,Any]): 
    return (sections_py if USE=='py' else sections_cli)(input_path, opts)

def chords(input_path: str, opts: Dict[str,Any]): 
    return (chords_py if USE=='py' else chords_cli)(input_path, opts)

def lyrics(input_path: str, opts: Dict[str,Any]): 
    return (lyrics_py if USE=='py' else lyrics_cli)(input_path, opts)
