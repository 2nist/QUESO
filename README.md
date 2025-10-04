
# Queso

**Q**uick **U**tility for the **E**xtraction of **S**ong **O**bjects

A full-stack application for musical analysis and visualization.

This starter gives you:
- **client/** – Vite + Svelte (TS), COOP/COEP headers for AudioWorklet & SharedArrayBuffer
- **server/** – Spring Boot (Gradle), REST API + COOP/COEP filter + CORS

## Quick start

### Prereqs
- Node 20+
- Java 21+

### 1) Run the API
```bash
cd server
./gradlew bootRun
# http://localhost:8080
```

### 2) Run the client
```bash
cd client
npm install
npm run dev
# http://localhost:5173
```

The client dev server proxies `/api/*` → `http://localhost:8080`.

### 3) Verify cross-origin isolation
Open http://localhost:5173 and check the banner shows `crossOriginIsolated: true`.
If not, ensure both servers add `COOP` and `COEP` headers.

## Next steps
- Drop `.lab/.lrc/.json` artifacts into `client/public/artifacts/demo/`
- Replace `public/worklets/scheduler.js` with a real scheduler
- Add `/api/analyze` to launch your Python pipeline and stream status
