
# QUESO Artifacts v1

All outputs live under `artifacts/<slug>/`.

## Files
- `sections.lab` — `<tStart> <label>` per line
- `chords.lab`   — `<tStart> <chordSymbol>` per line
- `lyrics.lrc` or `.srt` — time-tagged lines
- `tempo.json`   — `{ "bpm": 120, "beat_times": [0,0.5,1,...] }`
- `melody.mid`, `drums.mid` — optional MIDI
- `stems/{mix,vox,bass,drums,other}.ogg` — optional audio stems
- `meta.json`    — `{ "product":"queso","schema":"queso-artifacts@1","progress": 100, ... }`

## Invariants
- Times in seconds, non-decreasing.
- `beat_times[0]` is the first downbeat when known, else 0.0.
- Re-imports should be idempotent (consumers must avoid duplicates).
