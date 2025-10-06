import cors from 'cors'
import express from 'express'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { appendDevLog, getLatest, subscribe } from './dev_log.js'
import { registerLabRoutes } from './lab/registerLabRoutes.js'

const app = express()
app.use(express.json())
app.use(cors())

// Helpful headers if you plan to use AudioWorklets (optional)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  next()
})

// Serve artifacts (static)
const ARTIFACTS_ROOT = path.resolve('artifacts')
if (!fs.existsSync(ARTIFACTS_ROOT)) fs.mkdirSync(ARTIFACTS_ROOT, { recursive: true })
app.use('/artifacts', express.static(ARTIFACTS_ROOT, { acceptRanges: true }))

// ========= Lab Mode: SIMPLE =========
// Rule: ON by default in dev, OFF in production unless LAB_MODE explicitly set.
const envVal = (process.env.LAB_MODE || '').toLowerCase()
const defaultDev = process.env.NODE_ENV !== 'production'
const LAB_ALLOWED = envVal === '1' || envVal === 'true' ? true
                  : envVal === '0' || envVal === 'false' ? false
                  : defaultDev
export function labAllowed() { return LAB_ALLOWED }

// ========= Mount all Lab routes (guarded) =========
registerLabRoutes(app, labAllowed)

const isDev = process.env.NODE_ENV !== 'production'

// Convenience: allow developers to navigate to /lab in the browser. This
// endpoint will attempt to discover the running Lab client (via /api/lab/info)
// and redirect the browser there. If Lab is disabled, this will return 403.
app.get('/lab', (req, res) => {
  // In development we want a one-click entry to the Lab for fast iteration;
  // allow /lab to redirect to the Lab client even if LAB_MODE env is explicitly false.
  if (!labAllowed() && !isDev) return res.status(403).send('Lab mode disabled on this server')
  // Minimal HTML that redirects the browser to the actual lab client when possible
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Redirecting to Lab…</title></head><body>
  <p>Redirecting to Lab…</p>
  <script>
    (async function(){
      try{
        const r = await fetch('/api/lab/info');
        const j = await r.json().catch(()=>null);
        const url = j && j.api_base ? j.api_base.replace(/\/+$/,'') : '/lab/';
        window.location.replace(url);
      }catch(e){ window.location.replace('/lab/'); }
    })();
  </script>
  </body></html>`)
})

// NOTE: admin endpoints and runtime toggles removed. Lab allowed state is
// determined by LAB_MODE env when set, otherwise defaults ON in dev.

// Simple in-memory job table (for analyze/status)
const JOBS = new Map()

// Persist analysis job metadata so status can survive restarts.
const ANALYSIS_JOBS_DIR = path.resolve('server-node', 'data')
const ANALYSIS_JOBS_FILE = path.join(ANALYSIS_JOBS_DIR, 'analysis_jobs.json')

function ensureAnalysisJobsDir() { try { if (!fs.existsSync(ANALYSIS_JOBS_DIR)) fs.mkdirSync(ANALYSIS_JOBS_DIR, { recursive: true }) } catch (e) {} }
function persistAnalysisJobs() {
  try {
    ensureAnalysisJobsDir()
    const plain = Array.from(JOBS.entries()).map(([id, j]) => {
      // j.proc is not serializable; write only metadata
      const { proc, ...rest } = j
      return { jobId: id, ...rest }
    })
    fs.writeFileSync(ANALYSIS_JOBS_FILE, JSON.stringify(plain, null, 2), 'utf8')
  } catch (e) { appendDevLog(`/analysis persist error: ${String(e)}`) }
}
function loadAnalysisJobs() {
  try {
    if (!fs.existsSync(ANALYSIS_JOBS_FILE)) return
    const raw = fs.readFileSync(ANALYSIS_JOBS_FILE, 'utf8')
    const arr = JSON.parse(raw || '[]')
    arr.forEach(j => {
      if (j.status === 'running' || j.status === 'queued') {
        j.status = 'interrupted'
        j.ended = j.ended || Date.now()
      }
      // keep outDir and slug so status endpoint can read meta.json
      JOBS.set(j.jobId, j)
    })
    appendDevLog(`/analysis loaded ${JOBS.size} persisted jobs`)
  } catch (e) { appendDevLog(`/analysis load error: ${String(e)}`) }
}

// load analysis job metadata at startup
loadAnalysisJobs()

const PYTHON = process.env.PYTHON || 'python'

app.post('/api/analyze', (req, res) => {
  const { input, opts = {} } = req.body || {}
  if (!input) return res.status(400).json({ error: 'missing input' })
  const jobId = randomUUID()
  const slug = opts.slug || Date.now().toString(36)
  const ARTIFACTS_ROOT = path.resolve('artifacts')
  const outDir = path.join(ARTIFACTS_ROOT, slug)
  fs.mkdirSync(outDir, { recursive: true })
  const args = ['-m', 'analysis.cli', '--input', input, '--out', outDir, '--opts', JSON.stringify(opts)]
  appendDevLog(`Spawning analysis job ${jobId} -> ${input}`)
  const proc = spawn(PYTHON, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const job = { proc, slug, outDir, status: 'running', started: Date.now() }
  JOBS.set(jobId, job)
  // persist job metadata (proc is excluded by persistAnalysisJobs)
  persistAnalysisJobs()
  const logFile = path.join(outDir, 'job.log')
  const log = (chunk, prefix='') => fs.appendFileSync(logFile, prefix + chunk.toString(), 'utf8')
  proc.stdout.on('data', d => { log(d); appendDevLog(`[job ${jobId}] ${d.toString().trim()}`) })
  proc.stderr.on('data', d => { log(d, '[err] '); appendDevLog(`[job ${jobId}][ERR] ${d.toString().trim()}`) })
  proc.on('exit', code => {
    job.status = code === 0 ? 'done' : 'failed'
    job.ended = Date.now()
    appendDevLog(`Job ${jobId} exited with ${code}`)
    // ensure persisted metadata reflects final state
    persistAnalysisJobs()
  })
  res.json({ jobId, slug })
})

app.get('/api/status/:id', (req, res) => {
  const job = JOBS.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'no such job' })
  let meta = {}
  try { meta = JSON.parse(fs.readFileSync(path.join(job.outDir, 'meta.json'), 'utf8')) } catch (_) {}
  const { progress = 0, phase = '', status: metaStatus, error } = meta
  const status = metaStatus || job.status
  res.json({ jobId: req.params.id, slug: job.slug, status, progress, phase, error, started: job.started, ended: job.ended })
})

// SSE logs streaming
app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders()
  const send = (line) => res.write(`data: ${line.replace(/\n/g,'')}\n\n`)
  const unsub = subscribe(send)
  // send recent history
  getLatest(200).forEach(l => send(l))
  req.on('close', () => unsub())
})

app.get('/api/logs/latest', (req, res) => {
  res.json({ lines: getLatest(200) })
})

// ========= Your existing core API routes go below =========
// e.g. POST /api/analyze, GET /api/status/:id, etc.
// (left untouched)

const START_PORT = Number(process.env.PORT) || 8080

function tryListen(startPort, maxAttempts = 10) {
  let port = Number(startPort) || 8080
  const attempt = (attemptsLeft) => {
    const server = app.listen(port, () => {
      process.env.PORT = String(port)
      console.log(`API listening on http://localhost:${port} LAB_ALLOWED=${LAB_ALLOWED} NODE_ENV=${process.env.NODE_ENV}`)
    })
    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} in use, trying ${port + 1}...`)
        try { server.close?.() } catch (e) {}
        port += 1
        if (attemptsLeft > 0) return attempt(attemptsLeft - 1)
        console.error('Unable to bind API to any port; giving up.')
        process.exit(1)
      }
      console.error('Server error', err)
      process.exit(1)
    })
  }
  attempt(maxAttempts)
}

tryListen(START_PORT, 20)
