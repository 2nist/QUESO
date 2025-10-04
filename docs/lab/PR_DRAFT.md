# Draft PR: exp/creamery-lab

Summary
------
Adds an experimental Creamery Lab: client UI skeleton, server lab routes, docs, dev helpers, and CI validation.

Checklist
- [x] Lab UI skeleton under `client/lab`
- [x] Lab routes under `server-node/lab`
- [x] Dev scripts for launching LAB_MODE
- [x] CI validation step for lab routes
- [ ] Flesh out interactive components (chord palette, rhythm pads, MIDI)
- [ ] Add demo scenes and UX polish

Notes
-----
This PR intentionally keeps all lab code feature-gated under `LAB_MODE` and within `client/lab` and `server-node/lab` so
it does not affect the stable API or analysis pipeline. The next PR will flesh out playback and MIDI integration fully.
