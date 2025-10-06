import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / "analysis" / "tests" / "autotest" / "mp3" / "Turn It On.mp3"
PY = str(ROOT / ".venv" / "Scripts" / "python.exe")
OUT_ROOT = ROOT / "artifacts" / "grid_runs"
OUT_ROOT.mkdir(parents=True, exist_ok=True)

combos = []
for bar_align in (False, True):
    for max_sections in (12, 20):
        for min_len in (2.5, 1.5):
            for delta in (0.06, 0.03):
                combos.append({
                    "sections_bar_align": bar_align,
                    "sections_max_sections": max_sections,
                    "sections_min_section_duration": min_len,
                    "sections_peak_params": {"smooth_window": 48, "delta": delta, "pre_max": 24, "post_max": 24, "pre_avg": 24, "post_avg": 24, "wait": 24},
                })

summary = []
for i, combo in enumerate(combos, start=1):
    out_dir = OUT_ROOT / f"run_{i:02d}"
    out_dir.mkdir(parents=True, exist_ok=True)
    opts = {
        "sections": True,
        "tempo": True,
        "sections_aggressive": True,
        "sections_debug": True,
        "sections_spectral_validate": True,
        "sections_validation_thresholds": {"energy_drop_db": 2.0, "centroid_jump_hz": 100.0, "chroma_max_corr": 0.9},
    }
    opts.update(combo)
    opts_json = json.dumps(opts)
    cmd = [PY, "analysis/cli.py", "--input", str(INPUT), "--out", str(out_dir), "--opts", opts_json, "--preset", "low_cpu"]
    print(f"Running {i}/{len(combos)}: bar_align={combo['sections_bar_align']} max_sections={combo['sections_max_sections']} min_len={combo['sections_min_section_duration']} delta={combo['sections_peak_params']['delta']}")
    proc = subprocess.run(cmd, capture_output=True, text=True)
    # save run log
    (out_dir / "run_stdout.txt").write_text(proc.stdout)
    (out_dir / "run_stderr.txt").write_text(proc.stderr)

    summary_path = out_dir / "sections_summary.json"
    if summary_path.exists():
        try:
            data = json.loads(summary_path.read_text())
            segments = data.get("segments", [])
            labels = [s.get("label") for s in segments]
            n = len(segments)
            durations = [s.get("duration", 0.0) for s in segments]
            avg_len = sum(durations) / n if n else 0
            has_chorus = any("Chorus" in (lbl or "") for lbl in labels)
            # simple score: favor more segments and presence of chorus
            score = n + (3 if has_chorus else 0)
            summary.append({
                "run": i,
                "out_dir": str(out_dir),
                "n_segments": n,
                "avg_segment_len": round(avg_len, 2),
                "labels": labels,
                "score": score,
                "params": combo,
            })
        except Exception as e:
            summary.append({"run": i, "out_dir": str(out_dir), "error": str(e), "params": combo})
    else:
        summary.append({"run": i, "out_dir": str(out_dir), "error": "no sections_summary.json", "params": combo})

# write a CSV summary
csv_path = OUT_ROOT / "grid_summary.json"
csv_path.write_text(json.dumps(summary, indent=2))

# print top 5
summary_sorted = sorted([s for s in summary if s.get("n_segments")], key=lambda r: (-r.get("score",0), r.get("avg_segment_len",9999)))
print("\nTop candidates:\n")
for s in summary_sorted[:5]:
    print(f"run={s['run']} score={s['score']} n_segments={s['n_segments']} avg_len={s['avg_segment_len']} labels={s['labels']} out={s['out_dir']}")

print('\nGrid search completed. Summary written to:', csv_path)
