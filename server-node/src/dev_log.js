
const MAX_LINES = 2000
const lines = []
const subs = new Set()

export function appendDevLog(msg) {
  const ts = new Date().toISOString()
  const entry = `[${ts}] ${msg}`
  lines.push(entry)
  if (lines.length > MAX_LINES) lines.shift()
  for (const s of subs) {
    try { s(entry) } catch (e) {}
  }
}

export function getLatest(n = 200) {
  return lines.slice(-n)
}

export function subscribe(cb) {
  subs.add(cb)
  return () => subs.delete(cb)
}
