
# Lab Mode

Experimental features and playful UI panels, behind a simple flag.

---

## Enabling

**Local dev (default):** Lab Mode is **ON by default** when `NODE_ENV !== "production"`.
```bash
npm run dev    # starts API + client; lab is enabled
```


Prod (Lab OFF by default):

```bash
npm run api
```

Force ON/OFF anywhere:

```bash
LAB_MODE=1 npm run api   # force ON
LAB_MODE=0 npm run dev   # force OFF
```

Server behavior

- Lab allow state = LAB_MODE env if set, otherwise defaults to ON in dev and OFF in prod.

Public check: GET /api/lab/allowed → { allowed: boolean }.

All other /api/lab/* endpoints return 403 when Lab is disabled.

When enabled, routes include: /api/lab/examples, /api/lab/preview-mix, /api/lab/seed.

---

## How to run now

- **Dev (Lab ON by default):**
  ```bash
  npm run dev
  ```

Prod (Lab OFF by default):

```bash
npm run api
```

Force ON/OFF anywhere:

```bash
LAB_MODE=1 npm run api   # force ON
LAB_MODE=0 npm run dev   # force OFF
```

This keeps the rails, kills the noise, and lets you just build. If you want me to also drop in a barebones client/lab landing page to make sure the “Enter Lab” link resolves, say the word and I’ll add it.
