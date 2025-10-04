# Architecture — Creamery Lab

```mermaid
flowchart LR
  UI[Svelte Lab UI] -->|POST /api/analyze| API(Node Express)
  API -->|spawn| PY[analysis.cli]
  PY -->|writes| ART[artifacts/*]
  UI -->|poll /api/status/:id| API
  UI -->|fetch| ART
  API -->|GET /api/lab/examples| LAB
```

Key notes:
- The analysis CLI is the single source of truth for generating artifacts.
- The Lab only reads artifacts and builds non-destructive "scene" overlays.
- All lab endpoints are gated by `LAB_MODE` for safety.
