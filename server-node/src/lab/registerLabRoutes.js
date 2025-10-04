import fs from 'node:fs'
import path from 'node:path'

/**
 * Lab routes. All routes except /api/lab/allowed are guarded by labAllowed().
 * @param {import('express').Express} app
 * @param {() => boolean} labAllowed - getter that returns live lab state
 */
export function registerLabRoutes(app, labAllowed) {
  // Public ping so the client can decide whether to show Lab UI
  app.get('/api/lab/allowed', (req, res) => res.json({ allowed: !!labAllowed() }))

  // Guard middleware
  function guard(req, res, next) {
    if (!labAllowed()) return res.status(403).json({ error: 'LAB_MODE disabled' })
    next()
  }

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
