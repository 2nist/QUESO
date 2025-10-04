<script lang="ts">
  import { onMount } from 'svelte'
  import { getLabAdminState, setLabAdminState, labAllowed } from '../lib/lab'

  let allowed = false
  let admin: { allowed: boolean, source: string } = { allowed: false, source: 'none' }
  let showAdmin = import.meta.env.DEV
  let adminKey = (typeof localStorage !== 'undefined' && localStorage.getItem('LAB_ADMIN_KEY')) || ''

  onMount(async () => {
    allowed = await labAllowed()
    if (showAdmin) {
      try { admin = await getLabAdminState() } catch {}
    }
  })

  async function toggle() {
    try {
      admin = await setLabAdminState(!admin.allowed)
      allowed = admin.allowed
    } catch (e) {
      alert('Admin toggle blocked. Set LAB_ADMIN_KEY or run dev locally.')
    }
  }

  function saveKey() {
    localStorage.setItem('LAB_ADMIN_KEY', adminKey || '')
  }
</script>

<div class="card">
  <div class="flex items-center justify-between gap-3">
    <div>
      <div class="font-semibold">Lab Mode</div>
      <div class="text-sm opacity-70">Status: {allowed ? 'Enabled' : 'Disabled'} {admin.source !== 'none' ? `(${admin.source})` : ''}</div>
    </div>
    {#if showAdmin}
      <button class="btn" on:click={toggle}>{admin.allowed ? 'Disable' : 'Enable'}</button>
    {/if}
  </div>

  {#if showAdmin}
    <div class="mt-3 grid gap-2">
      <label class="text-xs opacity-70">Admin key (optional; for remote/dev proxy):</label>
      <div class="flex gap-2">
        <input class="input flex-1" bind:value={adminKey} placeholder="LAB_ADMIN_KEY" />
        <button class="btn btn-secondary" on:click={saveKey}>Save</button>
      </div>
      <div class="text-xs opacity-70">Admin endpoints require local dev OR header <code>x-lab-key</code> = <code>LAB_ADMIN_KEY</code>.</div>
    </div>
  {/if}
</div>
