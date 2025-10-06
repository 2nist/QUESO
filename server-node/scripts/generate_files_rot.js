#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const targets = [
  'client/lab/src/App.svelte',
  'client/lab/src/lib',
  'server-node/src/lab/registerLabRoutes.js',
  'server-node/scripts',
]

function listFiles(p) {
  const abs = path.join(ROOT, p)
  if (!fs.existsSync(abs)) return []
  const stat = fs.statSync(abs)
  if (stat.isFile()) return [p]
  const out = []
  for (const ent of fs.readdirSync(abs)) {
    const rel = path.join(p, ent)
    const s = fs.statSync(path.join(ROOT, rel))
    if (s.isFile()) out.push(rel)
    else if (s.isDirectory()) out.push(...listFiles(rel))
  }
  return out
}

function gitLast(pathToFile) {
  const r = spawnSync('git', ['log', '-1', '--format=%H|%an|%ad', '--', pathToFile], { encoding: 'utf8' })
  if (r.status !== 0) return null
  const out = (r.stdout || '').trim()
  if (!out) return null
  const [hash, author, date] = out.split('|')
  return { hash, author, date }
}

const files = new Set()
for (const t of targets) listFiles(t).forEach(f => files.add(f))

let md = '# Files ROT (auto-generated)\n\n'
md += `Generated: ${new Date().toISOString()}\n\n`
md += '| file | last_commit | author | date |\n|---|---|---|---|\n'
for (const f of Array.from(files).sort()) {
  const meta = gitLast(f) || { hash: 'n/a', author: 'n/a', date: 'n/a' }
  md += `| ${f} | ${meta.hash} | ${meta.author} | ${meta.date} |\n`
}

fs.writeFileSync(path.join('docs', 'lab', 'FILES_ROT.md'), md, 'utf8')
console.log('Wrote docs/lab/FILES_ROT.md')
