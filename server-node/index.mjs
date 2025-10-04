
import Fastify from 'fastify'
import staticPlugin from '@fastify/static'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const PORT = process.env.PORT || 8081
const PYTHON = process.env.PYTHON || 'python'

export function build(opts = {}) {
  const app = Fastify(opts)
  app.jobs = new Map()

  app.addHook('onSend', (req, reply, payload, done) => {
    reply.header('Cross-Origin-Opener-Policy', 'same-origin')
    reply.header('Cross-Origin-Embedder-Policy', 'require-corp')
    done()
  })

  app.register(staticPlugin, {
    root: path.resolve('artifacts'),
    prefix: '/artifacts/',
    acceptRanges: true,
    decorateReply: false
  })

  app.post('/api/analyze', async (req, reply) => {
    const { input, opts = {} } = req.body || {}
    if (!input) return reply.code(400).send({ error: 'missing input' })

    const slug = opts.slug || Date.now().toString(36)
    const outDir = path.resolve('artifacts', slug)
    fs.mkdirSync(outDir, { recursive: true })

    const jobId = randomUUID()
    const args = ['-m','analysis.cli','--input', input,'--out', outDir,'--opts', JSON.stringify(opts)]
    const py = spawn(PYTHON, args, { cwd: process.cwd(), windowsHide: true })

    const job = { pid: py.pid, status:'running', slug, outDir, log:[], started: Date.now() }
    app.jobs.set(jobId, job)

    const push = (s) => job.log.push({ t: Date.now(), line: s })
    py.stdout.on('data', d => push(d.toString()))
    py.stderr.on('data', d => push('[err] ' + d.toString()))
    py.on('exit', code => { job.status = code === 0 ? 'done' : 'failed'; job.ended = Date.now() })

    return { jobId, slug }
  })

  app.get('/api/status/:id', async (req, reply) => {
    const job = app.jobs.get(req.params.id)
    if (!job) return reply.code(404).send({ error: 'no such job' })
    let progress = 0
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(job.outDir, 'meta.json'), 'utf8'))
      progress = meta.progress ?? 0
    } catch {}
    return { status: job.status, slug: job.slug, progress, started: job.started, ended: job.ended }
  })

  app.get('/api/logs/:id', async (req, reply) => {
    const job = app.jobs.get(req.params.id)
    if (!job) return reply.code(404).send()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })
    let i = 0
    const timer = setInterval(() => {
      while (i < job.log.length) {
        reply.raw.write(`data: ${JSON.stringify(job.log[i++])}\n\n`)
      }
      if (job.status === 'done' || job.status === 'failed') {
        clearInterval(timer)
        reply.raw.write(`event: end\ndata: ${job.status}\n\n`)
        reply.raw.end()
      }
    }, 200)
  })

  return app
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = build({ logger: false })
  app.listen({ port: PORT })
    .then(() => console.log(`QUESO serve on http://localhost:${PORT}`))
    .catch(err => { console.error(err); process.exit(1) })
}
