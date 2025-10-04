# Creamery Lab Playbook

This short playbook explains how to add a new Lab plugin (UI panel + optional server hook).

1. Add a UI panel under `client/lab/src/lib/panels/`:
   - Create a Svelte component that accepts a `scene` prop and exposes `on:change` events.

2. (Optional) Add a server helper under `server-node/lab/` to perform small tasks (e.g., pattern generation).
   - Export a function that accepts `(req, res, app)` and mount it in `routes.mjs`.

3. Add an entry to `docs/lab/ARCHITECTURE.md` describing the dataflow for your plugin.

4. Write tests under `analysis/tests/` or `server-node/lab/__tests__/` and add a small integration case to `.github/workflows/lab-ci.yml`.

Be mindful of the non-goals: the Lab must not modify artifact files on disk; plugins should operate on overlays/scene exports.
