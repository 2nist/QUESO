# QUESO — Creamery Lab

This experimental "Creamery Lab" is a playful sandbox for fast iteration on audio analysis
artifacts produced by QUESO (tempo, sections, chords, lyrics, stems). The goal is to
let musicians and designers quickly sketch musical ideas on top of analyzed material —
no destructive edits, no heavy stems processing in-browser.

Goals
- Fast feedback loop: run analysis, iterate, audition ideas.
- Lightweight musical sketching: chord painting, rhythm pads, scene export.
- UX-first: minimal friction, clear fallback indicators when artifacts are partial.

Non-goals
- Not a DAW; no multitrack editing, reliable real-time mixing, or heavy file rendering.

See `ARCHITECTURE.md` for dataflow and `PLAYBOOK.md` for how to extend the lab.

Getting started (developer)
1. Start the lab server + client (DEV):
   - Windows: `scripts/dev-lab.bat`
   - macOS/Linux: `scripts/dev-lab.sh`
2. Open http://localhost:5173 and click "Enter Lab" to begin.

User journey
1. Enter Lab (feature-gated via `LAB_MODE=true`).
2. Pick an input (URL or local file), toggle features, Run Analysis.
3. Watch live progress and logs (meta.json polling).
4. Inspect Section Map, play chord palette and rhythm pads locked to detected tempo.
5. Export the scene as JSON for sharing or later import.
