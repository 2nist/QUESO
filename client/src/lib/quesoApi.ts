
export type AnalyzeResp = { jobId: string; slug: string }
export type StatusResp = { status: 'running'|'done'|'failed'; slug: string; progress: number }

const BASE = '/api'

export async function analyze(input: string, opts: Record<string,any> = {}): Promise<AnalyzeResp> {
  const r = await fetch(`${BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, opts })
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function status(jobId: string): Promise<StatusResp> {
  const r = await fetch(`${BASE}/status/${jobId}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export function streamLogs(jobId: string, onLine: (obj:any)=>void): () => void {
  const es = new EventSource(`${BASE}/logs/${jobId}`)
  es.onmessage = (ev) => {
    try { onLine(JSON.parse(ev.data)) } catch {}
  }
  es.addEventListener('end', ()=> es.close())
  return () => es.close()
}
