import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
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

// ========= Lab Mode state (env + runtime override) =========
const envAllowed = ((process.env.LAB_MODE || '').toLowerCase() === '1' || (process.env.LAB_MODE || '').toLowerCase() === 'true')
let runtimeOverride = false
export function labAllowed() {
  return !!(envAllowed || runtimeOverride)
}

// Admin guard (dev only or LAB_ADMIN_KEY)
function isLocal(req) {
  const host = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString()
  return host.includes('127.0.0.1') || host.includes('::1') || host.includes('localhost')
}
function adminGuard(req, res, next) {
  const key = req.headers['x-lab-key']
  const hasKey = process.env.LAB_ADMIN_KEY && key === process.env.LAB_ADMIN_KEY
  const dev = process.env.NODE_ENV !== 'production'
  if ((dev && isLocal(req)) || hasKey) return next()
  return res.status(403).json({ error: 'admin endpoint disabled' })
}

// Admin endpoints to inspect/toggle lab mode (frontend dev-only)
app.get('/api/lab/admin/state', adminGuard, (req, res) => {
  const allowed = labAllowed()
  const source = allowed && envAllowed && runtimeOverride ? 'both'
               : allowed && envAllowed ? 'env'
               : allowed && runtimeOverride ? 'runtime'
               : 'none'
  res.json({ allowed, source })
})
app.post('/api/lab/admin/state', adminGuard, (req, res) => {
  const { enabled } = req.body || {}
  runtimeOverride = !!enabled
  const allowed = labAllowed()
  const source = allowed && envAllowed && runtimeOverride ? 'both'
               : allowed && envAllowed ? 'env'
               : allowed && runtimeOverride ? 'runtime'
               : 'none'
  res.json({ allowed, source })
})

// ========= Mount all Lab routes (guarded) =========
registerLabRoutes(app, labAllowed)

// ========= Your existing core API routes go below =========
// e.g. POST /api/analyze, GET /api/status/:id, etc.
// (left untouched)

const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT} LAB_MODE(env)=${envAllowed} NODE_ENV=${process.env.NODE_ENV}`)
})
