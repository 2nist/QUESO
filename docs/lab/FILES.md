# Files in the Creamery Lab (brief catalog)

This document describes the principal files and folders that make up the
Creamery Lab feature. It is a compact catalog: what the file does, how you
access it, its primary outputs, and a quick note on relevance (ROT) and
origin/date.

Date: 2025-10-05

---

## client/lab/

- `client/lab/src/App.svelte`
  - Purpose: Main Lab landing and minimal developer preview. In dev this
    component auto-enters to show the Lab UI; it also hosts the MP3 downloader
    form used for quick extraction from YouTube.
  - Access: Browser at `/lab` (redirects to dev client when running) or via
    the main site "Enter Lab" link.
  - Output: UI state, triggers downloads that write to `artifacts/<slug>/`.
  - Relevance/ROT: High relevance for local development and manual testing.
    Origin: added during the Creamery Lab work; last touched 2025-10-05.

- `client/lab/src/lib/ChordPalette.svelte`
  - Purpose: Visual UI for selecting and painting chord events onto a
    timeline/section map.
  - Access: rendered inside `App.svelte` when the scene is loaded.
  - Output: user-created chord placement saved into `chords.lab` (when
    exported or written by the server-side analysis flow).
  - Relevance/ROT: Feature UI for composition workflows; medium-high
    relevance; created 2025-xx-xx (experimental branch).

- `client/lab/src/lib/RhythmPads.svelte`
  - Purpose: Interactive pad grid for sketching simple rhythmic patterns and
    sending MIDI events via WebMIDI or AudioWorklets.
  - Access: part of Lab UI when a scene is loaded.
  - Output: pattern arrays and control messages; can be exported to scene
    artifacts or mapped to MIDI outputs.
  - Relevance/ROT: UX experimentation; medium relevance; created 2025.

- `client/lab/src/lib/SectionMap.svelte`
  - Purpose: Timeline/section preview that displays section boundaries and
    lets the user drop chords or markers.
  - Access: part of Lab when scene artifacts are loaded from
    `artifacts/<slug>/`.
  - Output: edits to scene JSON or `sections.lab` text file.
  - Relevance/ROT: Core to scene preview; medium-high relevance.

- `client/lab/public/screens/*`
  - Purpose: static assets used by the onboarding tour and header (logos,
    screens). Located under the client public folder and served by Vite.
  - Access: included by `App.svelte` and tour components.
  - Output: visual assets only.
  - Relevance/ROT: static assets; low code-change risk but important for
    UX.

---

## server-node/lab/

- `server-node/src/lab/registerLabRoutes.js`
  - Purpose: Registers the Lab-specific API routes. These are small helper
    endpoints used by the Lab client to list examples, preview mixes, seed
    scenes, and download audio (MP3) from YouTube.
  - Access: HTTP under `/api/lab/*` (e.g. `/api/lab/examples`,
    `/api/lab/download-mp3`).
  - Output: JSON responses, artifacts written under `artifacts/<slug>/`, and
    log files (`download.log`, `job.log`).
  - Relevance/ROT: High. This file is the server surface for Lab features.
    Origin: edited/expanded on 2025-10-05 to add MP3 download and examples.

- `server-node/scripts/dev_lab_launcher.js`
  - Purpose: A convenience script that starts the API and front-end dev
    servers in the right sequence and can detect and proxy to the chosen API
    port. Also provides a development-friendly auto-open behavior.
  - Access: run as `node server-node/scripts/dev_lab_launcher.js` or via
    `npm run dev:lab` if configured in package.json.
  - Output: launches servers, writes INFO to stdout, sets `process.env.PORT`.
  - Relevance/ROT: Very high for dev workflow; created earlier in the
    Cheese Lab branch and is the recommended dev entry.

- `server-node/scripts/open_lab_ports.js`
  - Purpose: Small helper script that probes common dev ports (5173/5174/5175
    for Vite, 8080 for API) and opens the discovered URLs in your native
    browser. Used by the VS Code task "Open Lab (browser)".
  - Access: `node server-node/scripts/open_lab_ports.js` or via VS Code task.
  - Output: opens browser windows and prints a compact discovery log.
  - Relevance/ROT: Developer convenience; low risk; added 2025-10-05.

---

## artifacts/

- `artifacts/<slug>/`
  - Purpose: per-job / per-download artifact folders written by the server
    (analysis jobs, downloads). Contains files like `tempo.json`,
    `sections.lab`, `chords.lab`, `job.log`, `download.log`, and audio files.
  - Access: served statically by the API at `/artifacts/<slug>/*`.
  - Output: persistent artifacts you can inspect or ship back to other
    systems.
  - Relevance/ROT: Very high — these files are the canonical outputs of
    long-running analysis and download jobs. Keep them backed up as needed.

---

## How to run the Lab (quick)

1. From VS Code, open the Command Palette and run the Task: "Run Lab (dev + open)".
   This starts the dev servers and then opens browser windows to the detected
   Lab client and API pages.
2. Alternatively, on the command line: `npm run dev` and then run
   `node server-node/scripts/open_lab_ports.js` (or just visit
   `http://localhost:5174` and the API at `http://localhost:8080`).

---

If you want I can add a more formal autogenerated inventory (e.g. by
scanning directories and reading file headers) or append timestamps/commit
hashes for each file to make the ROT data strictly auditable. Which would
you prefer?
