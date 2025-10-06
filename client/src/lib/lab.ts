export async function labAllowed(): Promise<boolean> {
  const r = await fetch('/api/lab/allowed')
  const j = await r.json().catch(() => ({}))
  return !!j.allowed
}
// Admin endpoints removed on server. These helper functions are retained as
