import express from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const app = express()
app.use(express.json())
app.use(cors())

// Helpful headers if/when you use AudioWorklets in dev
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  next()
})

// Serve artifacts for the UI (simple static)
const ARTIFACTS_ROOT = path.resolve('artifacts')
if (!fs.existsSync(ARTIFACTS_ROOT)) fs.mkdirSync(ARTIFACTS_ROOT, { recursive: true })
app.use('/artifacts', express.static(ARTIFACTS_ROOT, { acceptRanges: true }))

// In-memory job table
/** @type {Map<string,{proc:import('node:child_process').ChildProcess, slug:string, outDir:string, status:string, started:number, ended?:number}>} */
const JOBS = new Map()
app.jobs = JOBS // Expose jobs for testing

const PYTHON = process.env.PYTHON || 'python'
const PORT = process.env.PORT || 8080

app.post('/api/analyze', (req, res) => {
  const { input, opts = {} } = req.body || {}
  if (!input) return res.status(400).json({ error: 'missing input' })

  const jobId = randomUUID()
  const slug = opts.slug || Date.now().toString(36)
  const outDir = path.join(ARTIFACTS_ROOT, slug)
  fs.mkdirSync(outDir, { recursive: true })

  const args = ['-m', 'analysis.cli',
    '--input', input,
    '--out', outDir,
    '--opts', JSON.stringify(opts)
  ]

  const proc = spawn(PYTHON, args, { windowsHide: true, stdio: ['ignore','pipe','pipe'] })
  const job = { proc, slug, outDir, status: 'running', started: Date.now() }
  app.jobs.set(jobId, job)

  // Optional: persist a rolling log file per job
  const logFile = path.join(outDir, 'job.log')
  const log = (chunk, prefix='') => fs.appendFileSync(logFile, prefix + chunk.toString(), 'utf8')
  proc.stdout.on('data', d => log(d))
  proc.stderr.on('data', d => log(d, '[err] '))

  proc.on('exit', code => {
    job.status = code === 0 ? 'done' : 'failed'
    job.ended = Date.now()
  })

  return res.json({ jobId, slug })
})

app.get('/api/status/:id', (req, res) => {
  const job = app.jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'no such job' })

  let meta = {}
  try {
    meta = JSON.parse(fs.readFileSync(path.join(job.outDir, 'meta.json'), 'utf8'))
  } catch (_) {}
  const { progress = 0, phase = '', status: metaStatus, error } = meta
  const status = metaStatus || job.status

  return res.json({
    jobId: req.params.id,
    slug: job.slug,
    status,
    progress,
    phase,
    error,
    started: job.started,
    ended: job.ended
  })
})

let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`QUESO API running at http://localhost:${PORT}`)
  })
}

export { app, server }