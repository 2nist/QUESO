export async function labAllowed(): Promise<boolean> {
  const r = await fetch('/api/lab/allowed')
  const j = await r.json().catch(() => ({}))
  return !!j.allowed
}

export async function getLabAdminState(): Promise<{allowed:boolean, source:string}> {
  const r = await fetch('/api/lab/admin/state', { headers: adminHeaders() })
  if (!r.ok) throw new Error('admin state not allowed')
  return r.json()
}

export async function setLabAdminState(enabled: boolean): Promise<{allowed:boolean, source:string}> {
  const r = await fetch('/api/lab/admin/state', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...adminHeaders() },
    body: JSON.stringify({ enabled })
  })
  if (!r.ok) throw new Error('admin toggle not allowed')
  return r.json()
}

function adminHeaders() {
  const key = localStorage.getItem('LAB_ADMIN_KEY') || ''
  return key ? { 'x-lab-key': key } : {}
}
