<script lang="ts">

  import { onMount } from 'svelte'<script lang="ts">

  import { labAllowed } from './lib/lab'  import { onMount } from 'svelte'

  import LabToggle from './components/LabToggle.svelte'  let iso = false

  let allowed = false  onMount(() => { iso = (globalThis as any).crossOriginIsolated === true })

  onMount(async () => { allowed = await labAllowed() })

</script>  function toggleDark() {

    document.documentElement.classList.toggle('dark')

<main class="min-h-screen bg-background text-foreground font-sans">  }

  <div class="max-w-5xl mx-auto p-6"></script>

    <h1 class="text-2xl font-bold tracking-wide">QUESO</h1>

    <!-- existing content --><div class="min-h-dvh bg-background text-foreground">

  <div class="mx-auto max-w-4xl p-6">

    <div class="mt-6 flex items-center gap-3">    <header class="flex items-center gap-3 mb-6">

      {#if allowed}      <img src="/logo.svg" alt="Queso" width="40" height="40" />

        <a class="btn" href="/lab">Enter Lab</a>      <h1 class="text-2xl font-bold font-sans">Queso</h1>

      {:else}      <button

        <button class="btn btn-secondary" disabled>Lab Disabled</button>        class="ml-auto rounded-md border border-border px-3 py-1 hover:bg-accent hover:text-accent-foreground transition-colors"

      {/if}        on:click={toggleDark}

    </div>      >

        Toggle theme

    {#if import.meta.env.DEV}      </button>

      <div class="mt-4">    </header>

        <LabToggle />

      </div>    <div class="space-y-6">

    {/if}      <!-- Status card -->

  </div>      <div class="rounded-lg border border-border bg-card text-card-foreground shadow-sm p-6">

</main>        <h2 class="text-xl font-semibold mb-2">System Status</h2>

        <p class="text-sm text-muted-foreground mb-4">
          crossOriginIsolated: <span class="font-mono font-semibold text-foreground">{iso ? 'true' : 'false'}</span>
        </p>

        <button
          class="rounded-md bg-primary px-4 py-2 text-primary-foreground shadow hover:opacity-90 transition-opacity"
          on:click={async()=>{
            const r = await fetch('/api/hello').then(r=>r.text())
            alert(r)
          }}
        >
          GET /api/hello
        </button>
      </div>

      <!-- Design tokens demo -->
      <div class="rounded-lg border border-border bg-card text-card-foreground shadow-sm p-6">
        <h2 class="text-xl font-semibold mb-2">Queso UI tokens</h2>
        <p class="text-sm text-muted-foreground mb-4">Tailwind utilities mapped to your OKLCH vars.</p>

        <div class="flex flex-wrap gap-3 mb-4">
          <button class="rounded-md bg-primary px-4 py-2 text-primary-foreground shadow hover:opacity-90 transition-opacity">Primary</button>
          <button class="rounded-md bg-secondary px-4 py-2 text-secondary-foreground border border-border hover:bg-muted transition-colors">Secondary</button>
          <button class="rounded-md bg-destructive px-4 py-2 text-destructive-foreground shadow hover:opacity-90 transition-opacity">Danger</button>
          <button class="rounded-md bg-accent px-4 py-2 text-accent-foreground border border-border hover:opacity-90 transition-opacity">Accent</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div class="p-3 rounded border border-border bg-muted">
            <div class="font-mono text-xs text-muted-foreground mb-1">font-sans</div>
            <div class="font-sans">Antonio Typography</div>
          </div>
          <div class="p-3 rounded border border-border bg-muted">
            <div class="font-mono text-xs text-muted-foreground mb-1">font-serif</div>
            <div class="font-serif">Arvo Typography</div>
          </div>
          <div class="p-3 rounded border border-border bg-muted">
            <div class="font-mono text-xs text-muted-foreground mb-1">font-mono</div>
            <div class="font-mono">M PLUS 1 Code</div>
          </div>
        </div>
      </div>

      <!-- Scheduler section -->
      <div class="rounded-lg border border-border bg-card text-card-foreground shadow-sm p-6">
        <h2 class="text-xl font-semibold mb-2">Audio Scheduler</h2>
        <p class="text-sm text-muted-foreground">Replace <code class="px-2 py-1 rounded bg-muted font-mono text-xs">/public/worklets/scheduler.js</code> with your AudioWorklet.</p>
      </div>
    </div>
  </div>
</div>
