# Lab Mode

**What:** Experimental features and playful UI panels, gated behind a runtime flag.

**Why:** Let us iterate fast without risking stability or breaking artifact contracts.

---

## Enabling

**Local dev (recommended):**
```bash
npm run dev:lab
# equivalent:
LAB_MODE=1 npm run dev
```

**Prod:** Disabled by default. Enable only with an explicit `LAB_MODE` env or admin key.

---

## Server behavior

- Lab allow state = `LAB_MODE` env **OR** runtime admin toggle.
- Public check: `GET /api/lab/allowed` → `{ allowed: boolean }`.
- All other `/api/lab/*` endpoints return **403** when Lab is disabled.
- When enabled, routes include: `/api/lab/examples`, `/api/lab/preview-mix`, `/api/lab/seed`.

### Admin (dev only or with `LAB_ADMIN_KEY`)
- `GET /api/lab/admin/state` → `{ allowed, source }`
- `POST /api/lab/admin/state` `{ enabled: boolean }` → toggles runtime override
- Guarded by:
  - local dev (`NODE_ENV !== "production"` and request from `localhost/127.0.0.1`)
  - **or** header `x-lab-key: <LAB_ADMIN_KEY>`

---

## Client behavior

- On load, call `GET /api/lab/allowed` to decide whether to show “Enter Lab”.
- Dev-only “Lab Toggle” panel can flip runtime state via admin endpoints.
- Optional: store `LAB_ADMIN_KEY` in localStorage for remote testing.

---

## Safety rails

- No breaking changes to core `/api/*` or artifact schemas.
- Lab-only code lives under `client/lab/*` and `server-node/lab/*` where possible.
- CI must pass with `LAB_MODE=0`.
