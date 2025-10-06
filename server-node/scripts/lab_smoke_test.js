#!/usr/bin/env node
import http from 'node:http'
import { setTimeout as wait } from 'node:timers/promises'

async function check(url, timeout = 1000) {
  return new Promise((resolve) => {
    const req = http.request(url, { method: 'GET', timeout }, (res) => {
      res.resume();
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

async function main() {
  const apiPort = process.env.PORT || 8080
  const clientPorts = [5174, 5173, 5175]
  const deadline = Date.now() + 20000
  let apiOk = false
  while (Date.now() < deadline) {
    if (await check({ hostname: '127.0.0.1', port: apiPort, path: '/api/lab/allowed' })) { apiOk = true; break }
    await wait(1000)
  }
  if (!apiOk) {
    console.error('API did not respond on', apiPort)
    process.exit(1)
  }
  let clientOk = false
  for (const p of clientPorts) {
    if (Date.now() > deadline) break
    if (await check({ hostname: '127.0.0.1', port: p, path: '/' })) { clientOk = true; break }
  }
  if (!clientOk) {
    console.error('No client dev server found on common ports')
    process.exit(2)
  }
  console.log('Smoke test succeeded: API and client reachable')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(3) })
