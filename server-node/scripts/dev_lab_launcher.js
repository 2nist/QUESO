#!/usr/bin/env node
const { spawn, exec } = require('child_process')
const path = require('path')

const API_SCRIPT = path.resolve(__dirname, '..', 'src', 'node_api_server.js')
const VITE_CMD = 'npx'
const VITE_ARGS = ['vite', '--config', 'client/lab/vite.config.js']

const env = { ...process.env, LAB_MODE: '1', PORT: process.env.PORT || '8081' }

let apiProcess = null
let viteProcess = null

let apiPort = null

function startAPI() {
  console.log('Starting API...')
  apiProcess = spawn(process.execPath, [API_SCRIPT], { env, stdio: ['ignore', 'pipe', 'pipe'] })

  apiProcess.stdout.on('data', (chunk) => {
    const s = chunk.toString()
    process.stdout.write(`[api] ${s}`)
    const m = s.match(/API listening on http:\/\/localhost:(\d+)/)
    if (m && !apiPort) {
      apiPort = m[1]
      console.log(`Detected API port: ${apiPort}`)
      startVite(apiPort)
    }
  })
  apiProcess.stderr.on('data', (c) => process.stderr.write(`[api.err] ${c.toString()}`))
  apiProcess.on('exit', (code, sig) => console.log(`API exited code=${code} sig=${sig}`))
}
  function findProcessUsingPort(port, cb) {
    if (process.platform === 'win32') {
      // netstat -ano | findstr :PORT
      const cmd = `netstat -ano | findstr :${port}`
      exec(cmd, { windowsHide: true }, (err, stdout) => {
        if (err || !stdout) return cb(null)
        const lines = stdout.trim().split(/\r?\n/).filter(Boolean)
        const pids = new Set()
        for (const l of lines) {
          const parts = l.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          if (pid) pids.add(pid)
        }
        cb(Array.from(pids))
      })
    } else {
      // try lsof -i :port
      exec(`lsof -i :${port} -sTCP:LISTEN -Pn`, (err, stdout) => {
        if (err || !stdout) return cb(null)
        const lines = stdout.trim().split(/\r?\n/).slice(1)
        const pids = new Set()
        for (const l of lines) {
          const parts = l.trim().split(/\s+/)
          const pid = parts[1]
          if (pid) pids.add(pid)
        }
        cb(Array.from(pids))
      })
    }
  }

  function promptYesNo(question, cb) {
    process.stdout.write(question + ' (y/N): ')
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', (data) => {
      const val = (data || '').toString().trim().toLowerCase()
      cb(val === 'y' || val === 'yes')
    })
  }

  const AUTO_KILL = process.env.DEV_LAUNCHER_AUTOKILL === '1' || process.argv.includes('--autokill')

  async function startLauncher() {
      const desiredPort = Number(env.PORT || 8081)
    findProcessUsingPort(desiredPort, (pids) => {
      if (pids && pids.length) {
          console.log(`Port ${desiredPort} is in use by PID(s): ${pids.join(', ')}`)
          if (AUTO_KILL) {
            console.log('Auto-kill enabled, terminating processes...')
            for (const pid of pids) {
              try { process.kill(Number(pid), 'SIGTERM') } catch (e) { console.warn('Failed to kill', pid, e) }
            }
            setTimeout(startAPI, 800)
          } else {
            promptYesNo('Kill these process(es) and continue?', (ok) => {
              if (ok) {
                for (const pid of pids) {
                  try { process.kill(Number(pid), 'SIGTERM') } catch (e) { console.warn('Failed to kill', pid, e) }
                }
                // small delay to allow OS to release
                setTimeout(startAPI, 800)
              } else {
                console.log('Aborting launcher — please free the port and retry.')
                process.exit(1)
              }
            })
          }
      } else {
        startAPI()
      }
    })
  }



function startVite(port) {
  const viteEnv = { ...process.env, PORT: port }
  console.log('Starting Vite with API proxy target port', port)
  viteProcess = spawn(VITE_CMD, VITE_ARGS, { env: viteEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  viteProcess.stdout.on('data', (c) => process.stdout.write(`[vite] ${c.toString()}`))
  viteProcess.stderr.on('data', (c) => process.stderr.write(`[vite.err] ${c.toString()}`))
  viteProcess.on('exit', (code, sig) => console.log(`Vite exited code=${code} sig=${sig}`))

  // open the browser when vite reports the local url
  viteProcess.stdout.on('data', (chunk) => {
    const s = chunk.toString()
    const m = s.match(/Local:\s+(https?:\/\/[^\s]+)/)
    if (m) {
      const url = m[1]
      console.log('Opening browser to', url)
      // Windows start
      if (process.platform === 'win32') exec(`start ${url}`)
      else exec(`open ${url}`)
    }
  })
}

// Cleanup on Ctrl-C
process.on('SIGINT', () => {
  console.log('Shutting down dev launcher...')
  try { if (apiProcess) apiProcess.kill('SIGINT') } catch (e) {}
  try { if (viteProcess) viteProcess.kill('SIGINT') } catch (e) {}
  process.exit(0)
})

startLauncher()
