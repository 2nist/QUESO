import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { appendDevLog } from '../dev_log.js'
// lightweight lab routes; avoid noisy dev-only logging here

/**
 * Lab routes. All routes except /api/lab/allowed are guarded by labAllowed().
 * @param {import('express').Express} app
 * @param {() => boolean} labAllowed - getter that returns live lab state
 */
export function registerLabRoutes(app, labAllowed) {
  // Public ping so the client can decide whether to show Lab UI
  app.get('/api/lab/allowed', (req, res) => res.json({ allowed: !!labAllowed() }))

  // Public helper to report the API base for developer convenience
  app.get('/api/lab/info', (req, res) => {
    const port = process.env.PORT || 8081
    const apiBase = `http://localhost:${port}`
    console.log('/api/lab/info requested ->', apiBase)
    res.json({ api_base: apiBase })
  })

  // Lightweight health check for developer diagnostics. Reports presence
  // of native tools and Python packages used by the analysis pipeline.
  const PYTHON = process.env.PYTHON || 'python'
  app.get('/api/lab/health', guard, (req, res) => {
    try {
      const ytdlpCheck = spawnSync('yt-dlp', ['--version'], { encoding: 'utf8' })
      const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
      const pythonCheck = spawnSync(PYTHON, ['-c', 'import sys; print(sys.version)'], { encoding: 'utf8' })
      const pkgCheckCmd = `import json, importlib, importlib.util; req=['torch','demucs','faster_whisper','librosa','crepe','soundfile']; r={};
for k in req: r[k]=bool(importlib.util.find_spec(k)); print(json.dumps(r))`
      const pkgCheck = spawnSync(PYTHON, ['-c', pkgCheckCmd], { encoding: 'utf8' })
      let pkgs = {}
      try { pkgs = JSON.parse((pkgCheck.stdout||'').trim() || '{}') } catch (e) { pkgs = {} }
      // torch cuda probe
      let torch_cuda = { available: false, version: null, cuda: false }
      try {
        const t = spawnSync(PYTHON, ['-c', 'import json, torch; print(json.dumps({"available": True, "version": getattr(torch, "__version__", None), "cuda": torch.cuda.is_available(), "cuda_version": getattr(torch.version, "cuda", None)}))'], { encoding: 'utf8' })
        if (t && t.stdout) torch_cuda = JSON.parse(t.stdout.trim())
      } catch (e) { torch_cuda = { available: false } }

      // Native GPU tooling probes
      const nvsmiCheck = spawnSync('nvidia-smi', ['--query-gpu=name,driver_version,cuda_version', '--format=csv,noheader'], { encoding: 'utf8' })
      const nvccCheck = spawnSync('nvcc', ['--version'], { encoding: 'utf8' })

      // Try a PowerShell probe for display adapters on Windows (best-effort)
      let displayAdapters = null
      try {
        const ps = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-PnpDevice -Class Display | Select-Object -Property FriendlyName,InstanceId,Status | ConvertTo-Json -Compress'], { encoding: 'utf8' })
        if (ps && ps.stdout) {
          try { displayAdapters = JSON.parse(ps.stdout.trim()) } catch (e) { displayAdapters = ps.stdout.trim() }
        }
      } catch (e) { displayAdapters = null }

      // Performance recommendation logic
      let perf = { level: 'cpu-only', recommendation: 'No GPU acceleration detected. The analysis pipeline will run, but heavy ML steps (Demucs, Whisper) will be much slower on CPU. For better performance install an NVIDIA GPU with drivers and CUDA runtime, then install a matching PyTorch CUDA wheel.' }
      try {
        const nvsmiPresent = !(nvsmiCheck.error || nvsmiCheck.status !== 0)
        const nvccPresent = !(nvccCheck.error || nvccCheck.status !== 0)
        if (torch_cuda && torch_cuda.available && torch_cuda.cuda) {
          perf.level = 'gpu-ready'
          perf.recommendation = 'GPU acceleration available: PyTorch detects CUDA. You should be able to run Demucs and other models with GPU performance.'
        } else if (nvsmiPresent || (displayAdapters && ((Array.isArray(displayAdapters) && displayAdapters.some(a=>String(a.FriendlyName||'').toLowerCase().includes('nvidia'))) || (typeof displayAdapters === 'string' && displayAdapters.toLowerCase().includes('nvidia'))))) {
          perf.level = 'gpu-present-driver-only'
          perf.recommendation = 'NVIDIA hardware/driver detected but PyTorch does not detect CUDA. Ensure the NVIDIA driver and CUDA runtime libraries are installed and that you install a PyTorch wheel matching your CUDA runtime (see installer TORCH_CUDA override). nvcc (CUDA compiler) is NOT required to run GPU PyTorch.'
        } else {
          perf.level = 'cpu-only'
          perf.recommendation = 'No NVIDIA GPU detected. Pipeline will work in CPU-only mode but expect much longer processing times for Demucs/Whisper. If you plan to process many songs, consider a machine with an NVIDIA GPU.'
        }
        perf.nvidia_tools = { nvidia_smi: !(nvsmiCheck.error || nvsmiCheck.status !== 0), nvcc: !(nvccCheck.error || nvccCheck.status !== 0) }
      } catch (e) {
        perf = Object.assign(perf, { error: String(e) })
      }

      res.json({
        ok: true,
        tools: {
          yt_dlp: !(ytdlpCheck.error || ytdlpCheck.status !== 0),
          ffmpeg: !(ffmpegCheck.error || ffmpegCheck.status !== 0),
          python: { cmd: PYTHON, ok: !(pythonCheck.error || pythonCheck.status !== 0), details: (pythonCheck.stdout||pythonCheck.stderr||'').trim() }
        },
        python_packages: pkgs,
        torch: torch_cuda,
        display_adapters: displayAdapters,
        performance: perf
      })
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // Guard middleware
  function guard(req, res, next) {
    if (!labAllowed()) return res.status(403).json({ error: 'LAB_MODE disabled' })
    next()
  }

  // Long-lived analysis worker management. The worker is a Python HTTP process
  // that keeps models cached to speed repeated analysis runs on CPU-bound machines.
  let ANALYSIS_WORKER = null
  const ANALYSIS_WORKER_PORT = process.env.ANALYSIS_WORKER_PORT || 5001
  // Keep an in-memory circular log buffer for worker stdout/stderr and active SSE clients
  const WORKER_LOG_BUFFER = []
  const WORKER_LOG_SSE_CLIENTS = new Set()
  const MAX_WORKER_LOG_LINES = 2000

  function pushWorkerLog(line) {
    try {
      const ts = Date.now()
      const entry = { ts, line: String(line) }
      WORKER_LOG_BUFFER.push(entry)
      if (WORKER_LOG_BUFFER.length > MAX_WORKER_LOG_LINES) WORKER_LOG_BUFFER.splice(0, WORKER_LOG_BUFFER.length - MAX_WORKER_LOG_LINES)
      // broadcast to SSE clients
      for (const res of WORKER_LOG_SSE_CLIENTS) {
        try { res.write(`data: ${JSON.stringify(entry).replace(/\n/g, '\\n')}\n\n`) } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  }

  app.post('/api/lab/analysis/worker/start', guard, (req, res) => {
    if (ANALYSIS_WORKER && !ANALYSIS_WORKER.killed) return res.json({ ok: true, message: 'worker already running' })
    const PY = process.env.PYTHON || 'python'
    const workerScript = path.resolve('external', 'yt2rpr', 'src', 'analysis_worker.py')
    try {
      ANALYSIS_WORKER = spawn(PY, [workerScript], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ANALYSIS_WORKER_PORT: String(ANALYSIS_WORKER_PORT) } })
      ANALYSIS_WORKER.stdout.on('data', d => { appendDevLog('[worker] ' + d.toString()); pushWorkerLog('[worker] ' + d.toString()) })
      ANALYSIS_WORKER.stderr.on('data', d => { appendDevLog('[worker-err] ' + d.toString()); pushWorkerLog('[worker-err] ' + d.toString()) })
      ANALYSIS_WORKER.on('exit', (code) => { appendDevLog(`/analysis worker exited ${code}`); pushWorkerLog(`/analysis worker exited ${code}`) })
      // Optionally warmup models if requested in body
      try {
        const body = req.body || {}
        if (body.warmup) {
          const wurl = `http://127.0.0.1:${ANALYSIS_WORKER_PORT}/warmup`
          // fire-and-forget
          fetch(wurl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opts: { preset: 'low_cpu' } }) }).then(r => r.text().then(t => pushWorkerLog('[warmup] ' + t))).catch(e => pushWorkerLog('[warmup-err] ' + String(e)))
        }
      } catch (e) {}
      return res.json({ ok: true, started: true })
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) })
    }
  })

  app.post('/api/lab/analysis/worker/stop', guard, (req, res) => {
    if (!ANALYSIS_WORKER) return res.json({ ok: true, message: 'no worker' })
    try {
      ANALYSIS_WORKER.kill()
      ANALYSIS_WORKER = null
      return res.json({ ok: true, stopped: true })
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) })
    }
  })

  app.get('/api/lab/analysis/worker/status', guard, (req, res) => {
    const running = !!(ANALYSIS_WORKER && !ANALYSIS_WORKER.killed)
    res.json({ running, pid: ANALYSIS_WORKER ? ANALYSIS_WORKER.pid : null, port: ANALYSIS_WORKER_PORT })
  })

  // SSE stream of worker logs
  app.get('/api/lab/analysis/worker/logs/stream', guard, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.flushHeaders()
    // send existing buffer
    try {
      for (const e of WORKER_LOG_BUFFER.slice(-200)) {
        res.write(`data: ${JSON.stringify(e).replace(/\n/g, '\\n')}\n\n`)
      }
    } catch (e) {}
    WORKER_LOG_SSE_CLIENTS.add(res)
    req.on('close', () => {
      try { WORKER_LOG_SSE_CLIENTS.delete(res) } catch (e) {}
    })
  })

  // Forward an analyze request to the worker (starts worker if not running)
  app.post('/api/lab/analysis/worker/analyze', guard, async (req, res) => {
    const { input, out, opts } = req.body || {}
    if (!input || !out) return res.status(400).json({ error: 'missing input/out' })
    try {
      // Ensure worker running
      if (!ANALYSIS_WORKER || ANALYSIS_WORKER.killed) {
        // start it synchronously
        const PY = process.env.PYTHON || 'python'
        const workerScript = path.resolve('external', 'yt2rpr', 'src', 'analysis_worker.py')
        ANALYSIS_WORKER = spawn(PY, [workerScript], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ANALYSIS_WORKER_PORT: String(ANALYSIS_WORKER_PORT) } })
        ANALYSIS_WORKER.stdout.on('data', d => { appendDevLog('[worker] ' + d.toString()); pushWorkerLog('[worker] ' + d.toString()) })
        ANALYSIS_WORKER.stderr.on('data', d => { appendDevLog('[worker-err] ' + d.toString()); pushWorkerLog('[worker-err] ' + d.toString()) })
      }
      // forward via HTTP and immediately return job id (worker queues job)
      const url = `http://127.0.0.1:${ANALYSIS_WORKER_PORT}/analyze`
      const payload = { input, out, opts: opts || {} }
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await r.json()
      return res.status(r.status).json(j)
    } catch (e) {
      appendDevLog(`/analysis forward failed: ${String(e)}`)
      return res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // Forward worker job list and job logs endpoints
  app.get('/api/lab/analysis/worker/jobs', guard, async (req, res) => {
    try {
      if (!ANALYSIS_WORKER || ANALYSIS_WORKER.killed) return res.json({ jobs: [] })
      const url = `http://127.0.0.1:${ANALYSIS_WORKER_PORT}/jobs`
      const r = await fetch(url)
      const j = await r.json()
      return res.status(r.status).json(j)
    } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  app.get('/api/lab/analysis/worker/jobs/:id/logs', guard, async (req, res) => {
    try {
      if (!ANALYSIS_WORKER || ANALYSIS_WORKER.killed) return res.status(404).json({ error: 'no worker' })
      const url = `http://127.0.0.1:${ANALYSIS_WORKER_PORT}/jobs/${req.params.id}/logs`
      const r = await fetch(url)
      const j = await r.json()
      return res.status(r.status).json(j)
    } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  // Proxy per-job SSE logs from worker so client can connect through Node (preserves guard)
  app.get('/api/lab/analysis/worker/jobs/:id/logs/stream', guard, (req, res) => {
    if (!ANALYSIS_WORKER || ANALYSIS_WORKER.killed) return res.status(404).json({ error: 'no worker' })
    const jid = req.params.id
    const options = {
      hostname: '127.0.0.1',
      port: Number(ANALYSIS_WORKER_PORT),
      path: `/jobs/${jid}/logs/stream`,
      method: 'GET',
      headers: { 'Accept': 'text/event-stream' }
    }
    const proxyReq = http.request(options, (proxyRes) => {
      res.statusCode = proxyRes.statusCode || 200
      // copy headers (but ensure SSE content-type)
      res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'text/event-stream')
      res.setHeader('Cache-Control', proxyRes.headers['cache-control'] || 'no-cache')
      proxyRes.on('data', (chunk) => {
        try { res.write(chunk) } catch (e) { /* ignore */ }
      })
      proxyRes.on('end', () => { try { res.end() } catch (e) {} })
      proxyRes.on('error', (err) => { try { res.end() } catch (e) {} })
    })
    proxyReq.on('error', (err) => { res.status(500).json({ error: String(err) }) })
    proxyReq.end()
    // close proxy if client disconnects
    req.on('close', () => { try { proxyReq.destroy() } catch (e) {} })
  })

  app.post('/api/lab/analysis/worker/warmup', guard, async (req, res) => {
    try {
      // start worker if not running
      if (!ANALYSIS_WORKER || ANALYSIS_WORKER.killed) {
        const PY = process.env.PYTHON || 'python'
        const workerScript = path.resolve('external', 'yt2rpr', 'src', 'analysis_worker.py')
        ANALYSIS_WORKER = spawn(PY, [workerScript], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ANALYSIS_WORKER_PORT: String(ANALYSIS_WORKER_PORT) } })
        ANALYSIS_WORKER.stdout.on('data', d => { appendDevLog('[worker] ' + d.toString()); pushWorkerLog('[worker] ' + d.toString()) })
        ANALYSIS_WORKER.stderr.on('data', d => { appendDevLog('[worker-err] ' + d.toString()); pushWorkerLog('[worker-err] ' + d.toString()) })
      }
      const url = `http://127.0.0.1:${ANALYSIS_WORKER_PORT}/warmup`
      const payload = req.body || {}
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await r.json()
      return res.status(r.status).json(j)
    } catch (e) {
      appendDevLog(`/analysis warmup forward failed: ${String(e)}`)
      return res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // Endpoint to run the lightweight smoke/benchmark script and return results
  app.get('/api/lab/benchmark', guard, (req, res) => {
    try {
      const PY = process.env.PYTHON || 'python'
      const script = path.resolve('server-node', 'scripts', 'gpu_smoke_test.py')
      const out = spawnSync(PY, [script], { encoding: 'utf8' })
      if (out.error) return res.status(500).json({ ok: false, error: String(out.error) })
      const txt = out.stdout || out.stderr || ''
      let j = null
      try { j = JSON.parse(txt) } catch (e) { return res.status(500).json({ ok: false, raw: txt }) }
      return res.json({ ok: true, results: j })
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) })
    }
  })

  app.get('/api/lab/examples', guard, (req, res) => {
    const src = path.resolve('analysis', 'test_inputs', 'sources.json')
    let payload = { youtube: [], local: [] }
    try {
      if (fs.existsSync(src)) payload = JSON.parse(fs.readFileSync(src, 'utf8'))
    } catch {}
    res.json(payload)
  })

  app.post('/api/lab/preview-mix', guard, (req, res) => {
    const { out_dir } = req.body || {}
    if (!out_dir) return res.status(400).json({ error: 'missing out_dir' })
    const base = path.resolve(out_dir)
    const tempo = safeReadJSON(path.join(base, 'tempo.json')) || { bpm: 120, beat_times: [] }
    const chords = safeReadLab(path.join(base, 'chords.lab'))
    const sections = safeReadLab(path.join(base, 'sections.lab'))
    res.json({ scene: { tempo: tempo.bpm || 120, beats: tempo.beat_times || [], chords, sections } })
  })

  app.post('/api/lab/seed', guard, (req, res) => {
    const { out_dir } = req.body || {}
    if (!out_dir) return res.status(400).json({ error: 'missing out_dir' })
    const base = path.resolve(out_dir)
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
    const scene = { title: 'Seeded Scene', tempo: 120, beats_per_bar: 4, sections: [], chords: [] }
    fs.writeFileSync(path.join(base, 'scene.json'), JSON.stringify(scene, null, 2), 'utf8')
    res.json({ scene, path: path.join(base, 'scene.json') })
  })

  // Download a YouTube URL as MP3 using yt-dlp. Saves into artifacts/<slug>/
  app.post('/api/lab/download-mp3', guard, (req, res) => {
    const { url, slug: maybeSlug, opts = {} } = req.body || {}
    if (!url) return res.status(400).json({ error: 'missing url' })
    const slug = maybeSlug || Date.now().toString(36)
    const base = path.resolve('artifacts', slug)
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
    const outTemplate = path.join(base, opts.output_template || 'audio.%(ext)s')
    const logFile = path.join(base, 'download.log')
    const writeLog = (c) => fs.appendFileSync(logFile, c.toString(), 'utf8')
    appendDevLog(`/api/lab/download-mp3 -> ${url} -> ${slug} opts=${JSON.stringify(opts)}`)

    // Check prerequisites
    const ytdlpCheck = spawnSync('yt-dlp', ['--version'], { encoding: 'utf8' })
    if (ytdlpCheck.error || ytdlpCheck.status !== 0) {
      const help = 'yt-dlp not found on PATH. Install: https://github.com/yt-dlp/yt-dlp#installation'
      appendDevLog(`/api/lab/download-mp3 -> missing yt-dlp: ${String(ytdlpCheck.error||ytdlpCheck.stderr||ytdlpCheck.stdout)}`)
      return res.status(500).json({ error: 'yt-dlp-not-found', help })
    }
    const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
    if (ffmpegCheck.error || ffmpegCheck.status !== 0) {
      const help = 'ffmpeg not found on PATH. Install: https://ffmpeg.org/download.html'
      appendDevLog(`/api/lab/download-mp3 -> missing ffmpeg: ${String(ffmpegCheck.error||ffmpegCheck.stderr||ffmpegCheck.stdout)}`)
      return res.status(500).json({ error: 'ffmpeg-not-found', help })
    }
    try {
  const audioFormat = (opts.audio_format || 'mp3')
  const audioQuality = opts.audio_quality ? ['--audio-quality', String(opts.audio_quality)] : []
  const args = ['-x', '--audio-format', audioFormat, '-o', outTemplate, ...audioQuality, url]
  appendDevLog(`/api/lab/download-mp3 spawn yt-dlp ${args.join(' ')}`)
  const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] })
      proc.stdout.on('data', d => writeLog(d))
      proc.stderr.on('data', d => writeLog('[err] ' + d.toString()))
      proc.on('error', (err) => writeLog('[spawn-err] ' + String(err)))
      proc.on('close', (code) => {
        try {
          const files = fs.readdirSync(base).filter(f => f.toLowerCase().endsWith('.mp3'))
          if (files.length) {
            const mp3 = files[0]
            return res.json({ url: `/artifacts/${slug}/${mp3}`, slug })
          }
          const errTxt = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : `exit ${code}`
          return res.status(500).json({ error: 'download failed', details: errTxt })
        } catch (e) {
          return res.status(500).json({ error: 'download failed', details: String(e) })
        }
      })
    } catch (e) {
      return res.status(500).json({ error: 'spawn failed', details: String(e) })
    }
  })

  // Job-based downloader: create a background job and return a jobId.
  const DOWNLOAD_JOBS = new Map()

  // Persisted job store on disk so job metadata survives server restarts.
  const JOBS_DIR = path.resolve('server-node', 'data')
  const JOBS_FILE = path.join(JOBS_DIR, 'download_jobs.json')

  function ensureJobsDir() {
    try { if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true }) } catch (e) { /* ignore */ }
  }

  function persistJobs() {
    try {
      ensureJobsDir()
      const plain = Array.from(DOWNLOAD_JOBS.values()).map(j => {
        // strip runtime-only props
        const { _persistTimeout, _lastPersistedAt, ...rest } = j
        return rest
      })
      fs.writeFileSync(JOBS_FILE, JSON.stringify(plain, null, 2), 'utf8')
    } catch (e) {
      appendDevLog(`/jobs persist error: ${String(e)}`)
    }
  }

  function loadPersistedJobs() {
    try {
      if (!fs.existsSync(JOBS_FILE)) return
      const raw = fs.readFileSync(JOBS_FILE, 'utf8')
      const arr = JSON.parse(raw || '[]')
      arr.forEach(j => {
        // Recover job and mark interrupted jobs as such so UI knows they didn't finish
        if (j.status === 'running' || j.status === 'queued') {
          j.status = 'interrupted'
          j.ended = j.ended || Date.now()
        }
        DOWNLOAD_JOBS.set(j.jobId, j)
      })
      appendDevLog(`/jobs loaded ${DOWNLOAD_JOBS.size} persisted jobs`)
    } catch (e) {
      appendDevLog(`/jobs load error: ${String(e)}`)
    }
  }

  // Helper to schedule a persisted write (debounced per job)
  function schedulePersist(job) {
    try {
      if (job._persistTimeout) return
      job._persistTimeout = setTimeout(() => {
        try { delete job._persistTimeout } catch (e) {}
        persistJobs()
      }, 600)
    } catch (e) { /* ignore */ }
  }

  // Load persisted jobs when the lab routes are registered so status endpoints
  // can report previous jobs across restarts.
  loadPersistedJobs()

  app.post('/api/lab/download-mp3-job', guard, (req, res) => {
    const { url, slug: maybeSlug, opts = {} } = req.body || {}
    if (!url) return res.status(400).json({ error: 'missing url' })
    const slug = maybeSlug || Date.now().toString(36)
    const jobId = randomUUID()
    const base = path.resolve('artifacts', slug)
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
    const logFile = path.join(base, 'download.log')
    const job = { jobId, slug, status: 'queued', progress: 0, started: Date.now(), ended: null, logFile }
  DOWNLOAD_JOBS.set(jobId, job)
  // persist initial queued job to disk so it's visible immediately
  persistJobs()
    // respond immediately with job id
    res.json({ jobId, slug })

    // spawn the background task
    setImmediate(() => {
      try {
        const outTemplate = path.join(base, opts.output_template || 'audio.%(ext)s')
        const audioFormat = (opts.audio_format || 'mp3')
        const audioQuality = opts.audio_quality ? ['--audio-quality', String(opts.audio_quality)] : []
        const args = ['-x', '--audio-format', audioFormat, '-o', outTemplate, ...audioQuality, url]
        appendDevLog(`/api/lab/download-mp3-job spawn yt-dlp ${args.join(' ')}`)
        job.status = 'running'
        // status changed — persist this important transition
        persistJobs()
        const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] })
        const writeLog = (c) => fs.appendFileSync(logFile, c.toString(), 'utf8')
        proc.stdout.on('data', d => {
          const s = d.toString()
          writeLog(s)
          // parse basic progress like: "[download]  12.3%"
          const m = s.match(/\[download\]\s*([0-9]{1,3}(?:\.[0-9]+)?)%/i)
          if (m) {
            const p = Math.min(100, Math.max(0, parseFloat(m[1])))
            if (p !== job.progress) {
              job.progress = p
              schedulePersist(job)
            }
          }
        })
        proc.stderr.on('data', d => writeLog('[err] ' + d.toString()))
        proc.on('error', (err) => { writeLog('[spawn-err] ' + String(err)); job.status = 'failed'; job.ended = Date.now(); persistJobs() })
        proc.on('close', (code) => {
          try {
            const files = fs.readdirSync(base).filter(f => f.toLowerCase().endsWith('.mp3') || f.toLowerCase().endsWith('.m4a'))
            if (files.length) {
              job.artifact = `/artifacts/${slug}/${files[0]}`
              job.status = code === 0 ? 'done' : 'failed'
            } else {
              job.status = 'failed'
            }
          } catch (e) {
            job.status = 'failed'
          }
          job.ended = Date.now()
          // ensure final state is written
          persistJobs()
        })
      } catch (e) {
        appendDevLog(`/api/lab/download-mp3-job error: ${String(e)}`)
        job.status = 'failed'
        job.ended = Date.now()
        persistJobs()
      }
    })
  })

  app.get('/api/lab/download/status/:id', guard, (req, res) => {
    const job = DOWNLOAD_JOBS.get(req.params.id)
    if (!job) return res.status(404).json({ error: 'no such job' })
    res.json({ jobId: job.jobId, slug: job.slug, status: job.status, progress: job.progress, started: job.started, ended: job.ended, artifact: job.artifact || null })
  })

  app.get('/api/lab/download/logs/latest/:id', guard, (req, res) => {
    const job = DOWNLOAD_JOBS.get(req.params.id)
    if (!job) return res.status(404).json({ error: 'no such job' })
    const lf = job.logFile
    if (!fs.existsSync(lf)) return res.json({ lines: [] })
    const content = fs.readFileSync(lf, 'utf8')
    const lines = content.split(/\r?\n/).filter(Boolean)
    res.json({ lines: lines.slice(-200) })
  })

  // SSE stream of job logs (simple poll-based tail)
  app.get('/api/lab/download/logs/stream/:id', guard, (req, res) => {
    const job = DOWNLOAD_JOBS.get(req.params.id)
    if (!job) return res.status(404).end('no such job')
    const lf = job.logFile
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.flushHeaders()
    let last = ''
    const send = (s) => { res.write(`data: ${s.replace(/\n/g, '\\n')}\n\n`) }
    const interval = setInterval(() => {
      try {
        if (!fs.existsSync(lf)) return
        const all = fs.readFileSync(lf, 'utf8')
        if (all.length > last.length) {
          const chunk = all.slice(last.length)
          last = all
          send(chunk)
        }
        if (job.ended) {
          send(`[job ${job.jobId}] status=${job.status}`)
          clearInterval(interval)
          res.end()
        }
      } catch (e) {
        clearInterval(interval)
        res.end()
      }
    }, 800)
    req.on('close', () => { clearInterval(interval) })
  })

  // Return all persisted download jobs (sanitized)
  app.get('/api/lab/download/jobs', guard, (req, res) => {
    try {
      const jobs = Array.from(DOWNLOAD_JOBS.values()).map(j => ({
        jobId: j.jobId,
        slug: j.slug,
        status: j.status,
        progress: j.progress || 0,
        started: j.started || null,
        ended: j.ended || null,
        artifact: j.artifact || null,
        logFile: j.logFile || null,
      }))
      res.json({ jobs })
    } catch (e) {
      res.status(500).json({ error: 'failed', details: String(e) })
    }
  })

  // Read lyrics for a given session slug. Supports .lrc or .txt files.
  app.get('/api/lab/lyrics/:slug', guard, (req, res) => {
    const slug = req.params.slug
    if (!slug) return res.status(400).json({ error: 'missing slug' })
    const base = path.resolve('artifacts', slug)
    const lrc = path.join(base, 'lyrics.lrc')
    const txt = path.join(base, 'lyrics.txt')
    try {
      let content = null
      let type = null
      if (fs.existsSync(lrc)) { content = fs.readFileSync(lrc, 'utf8'); type = 'lrc' }
      else if (fs.existsSync(txt)) { content = fs.readFileSync(txt, 'utf8'); type = 'txt' }
      else return res.status(404).json({ error: 'no lyrics found' })

      if (type === 'lrc') {
        const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        const parsed = []
        const timeRe = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g
        for (const line of lines) {
          let match
          const times = []
          while ((match = timeRe.exec(line)) !== null) {
            const m = match
            const mm = parseInt(m[1], 10)
            const ss = parseFloat(m[2])
            const t = mm * 60 + ss
            times.push(t)
          }
          const text = line.replace(timeRe, '').trim()
          if (times.length) {
            for (const t of times) parsed.push({ time: t, text })
          } else {
            parsed.push({ time: null, text })
          }
        }
        return res.json({ type: 'lrc', lines: parsed })
      }
      // plain text: return each non-empty line
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => ({ time: null, text: l }))
      return res.json({ type: 'txt', lines })
    } catch (e) {
      return res.status(500).json({ error: 'read-failed', details: String(e) })
    }
  })

  // Upload lyrics content for a session. Expects JSON { slug, filename, content }
  app.post('/api/lab/lyrics', guard, (req, res) => {
    const { slug, filename, content } = req.body || {}
    if (!slug) return res.status(400).json({ error: 'missing slug' })
    if (!filename || !content) return res.status(400).json({ error: 'missing filename/content' })
    const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_')
    const ext = path.extname(safe).toLowerCase()
    if (!['.lrc', '.txt'].includes(ext)) return res.status(400).json({ error: 'filename must be .lrc or .txt' })
    const base = path.resolve('artifacts', slug)
    try {
      if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
      fs.writeFileSync(path.join(base, safe), String(content), 'utf8')
      appendDevLog(`/api/lab/lyrics uploaded ${safe} for ${slug}`)
      return res.json({ ok: true, path: `/artifacts/${slug}/${safe}` })
    } catch (e) {
      appendDevLog(`/api/lab/lyrics upload error: ${String(e)}`)
      return res.status(500).json({ error: 'write-failed', details: String(e) })
    }
  })

  // Save sections for a session (writes sections.lab and updates scene.json)
  app.post('/api/lab/sections', guard, (req, res) => {
    const { slug, sections } = req.body || {}
    if (!slug) return res.status(400).json({ error: 'missing slug' })
    if (!Array.isArray(sections)) return res.status(400).json({ error: 'sections must be an array' })
    const base = path.resolve('artifacts', slug)
    try {
      if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
      const lines = sections.map(s => `${Number(s.start)||0} ${Number(s.end)||0} ${String(s.label||'')}`)
      fs.writeFileSync(path.join(base, 'sections.lab'), lines.join('\n'), 'utf8')
      // update scene.json if present
      const scenePath = path.join(base, 'scene.json')
      let scene = null
      try { scene = JSON.parse(fs.readFileSync(scenePath, 'utf8')) } catch { scene = { title: slug, sections: [], chords: [] } }
      scene.sections = sections.map(s => ({ start: Number(s.start)||0, end: Number(s.end)||0, label: s.label||'' }))
      fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2), 'utf8')
      appendDevLog(`/api/lab/sections saved for ${slug}`)
      return res.json({ ok: true })
    } catch (e) {
      appendDevLog(`/api/lab/sections error: ${String(e)}`)
      return res.status(500).json({ error: 'save-failed', details: String(e) })
    }
  })

  function safeReadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
  function safeReadLab(p) {
    if (!fs.existsSync(p)) return []
    try {
      return fs.readFileSync(p, 'utf8')
        .split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        .map(l => { const parts = l.split(/\s+/); return { start: +parts[0]||0, end: +parts[1]||0, label: parts.slice(2).join(' ') } })
    } catch { return [] }
  }
}
