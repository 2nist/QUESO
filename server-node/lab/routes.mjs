import fs from 'node:fs'
import path from 'node:path'

export function registerLabRoutes(app) {
  const LAB_ALLOWED = (process.env.LAB_MODE || '').toLowerCase() === '1' || (process.env.LAB_MODE || '').toLowerCase() === 'true'

  app.get('/api/lab/allowed', (req, res) => {
    return res.json({ allowed: LAB_ALLOWED })
  })

  app.get('/api/lab/examples', (req, res) => {
    const src = path.resolve('analysis', 'test_inputs', 'sources.json')
    let payload = { youtube: [], local: [] }
    try {
      if (fs.existsSync(src)) payload = JSON.parse(fs.readFileSync(src, 'utf8'))
    } catch (e) {
      // ignore
    }
    return res.json(payload)
  })

  app.post('/api/lab/preview-mix', expressWrap((req, res) => {
    const { out_dir } = req.body || {}
    if (!out_dir) return res.status(400).json({ error: 'missing out_dir' })
    const base = path.resolve(out_dir)
    const tempo = safeReadJSON(path.join(base, 'tempo.json')) || { bpm: 120, beat_times: [] }
    const chords = safeReadLab(path.join(base, 'chords.lab'))
    const sections = safeReadLab(path.join(base, 'sections.lab'))
    const scene = {
      tempo: tempo.bpm || 120,
      beats: tempo.beat_times || [],
      chords,
      sections
    }
    return res.json({ scene })
  }))

  app.post('/api/lab/seed', expressWrap((req, res) => {
    const { out_dir } = req.body || {}
    if (!out_dir) return res.status(400).json({ error: 'missing out_dir' })
    const base = path.resolve(out_dir)
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
    const scene = {
      title: 'Seeded Scene',
      tempo: 120,
      beats_per_bar: 4,
      sections: [],
      chords: []
    }
    fs.writeFileSync(path.join(base, 'scene.json'), JSON.stringify(scene, null, 2), 'utf8')
    return res.json({ scene, path: path.join(base, 'scene.json') })
  }))

  function safeReadJSON(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (_) { return null }
  }

  function safeReadLab(p) {
    if (!fs.existsSync(p)) return []
    try {
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      return lines.map(l => {
        const parts = l.split(/\s+/)
        return { start: parseFloat(parts[0]||0), end: parseFloat(parts[1]||0), label: parts.slice(2).join(' ') }
      })
    } catch (e) { return [] }
  }

  function expressWrap(fn) {
    return (req, res) => {
      try { return fn(req, res) } catch (e) { return res.status(500).json({ error: String(e) }) }
    }
  }
}
