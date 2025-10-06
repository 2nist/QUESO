#!/usr/bin/env node
// Attempts to discover active Lab-related dev servers (client Vite and API)
// and opens them in the native browser. Useful as a companion to a VS Code
// task so developers can press one button and the right pages open.

import { exec } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import { promisify } from 'node:util'

const execP = promisify(exec)

function checkTcp(port, host = '127.0.0.1', timeout = 300) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host }, () => {
      s.destroy()
      resolve(true)
    })
    s.on('error', () => resolve(false))
    setTimeout(() => {
      try { s.destroy() } catch (e) {}
      resolve(false)
    }, timeout)
  })
}

async function probeHttp(port) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/', method: 'GET', timeout: 500 }, (res) => {
      res.resume()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

async function openUrl(url) {
  const plat = process.platform
  try {
    if (plat === 'win32') {
      // use start via cmd
      await execP(`cmd /c start "" "${url}"`)
    } else if (plat === 'darwin') {
      await execP(`open "${url}"`)
    } else {
      await execP(`xdg-open "${url}"`)
    }
    console.log('Opened', url)
  } catch (e) {
    console.warn('Failed to open', url, e && e.message)
  }
}

async function main() {
  console.log('Probing common Lab dev ports...')
  // First prefer client common Vite ports (popular presets used in this repo)
  const clientPorts = [5174, 5173, 5175]
  let clientUrl = null
  for (const p of clientPorts) {
    const ok = await probeHttp(p)
    if (ok) { clientUrl = `http://localhost:${p}`; break }
  }

  // Probe API hint
  let apiBase = null
  try {
    // try to GET /api/lab/info from local API default port
    const p = process.env.PORT || 8080
    const ok = await probeHttp(p)
    if (ok) apiBase = `http://localhost:${p}`
    // but prefer an explicit /api/lab/info if the API is already running
    try {
      const info = await new Promise((res) => {
        const req = http.request({ hostname: '127.0.0.1', port: p, path: '/api/lab/info', method: 'GET', timeout: 600 }, (r) => {
          let buf = ''
          r.on('data', d => buf += d)
          r.on('end', () => { try { res(JSON.parse(buf)) } catch { res(null) } })
        })
        req.on('error', () => res(null))
        req.end()
      })
      if (info && info.api_base) apiBase = info.api_base
    } catch (e) {}
  } catch (e) {}

  console.log('discovered:', { clientUrl, apiBase })

  if (clientUrl) await openUrl(clientUrl)
  if (apiBase) await openUrl(apiBase)
  if (!clientUrl && !apiBase) console.log('No lab servers found on common ports. If you just started servers, try running this task again in a few seconds.')
}

main().catch(e => { console.error(e); process.exit(1) })
