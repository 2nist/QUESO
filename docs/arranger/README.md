# Arranger demo wiring

This folder contains a small demo arrangement JSON contract and a minimal Svelte player + Spring Boot controller to serve it.

How it fits:
- `apps/server/data/output/demo-track-001.arrangement.json` — example arrangement JSON produced by the pipeline.
- `apps/server/src/main/kotlin/.../ArrangementController.kt` — simple REST endpoint to return the arrangement JSON and optionally proxy audio.
- `apps/web/src/lib/components/KaraokePlayer.svelte` — lightweight player that fetches arrangement JSON and plays the audio, updating section/chord/lyrics rails.

Run locally:
- Start server (Spring Boot) on :8080
- Start web app (SvelteKit/Vite) with `VITE_API_BASE=http://localhost:8080`
