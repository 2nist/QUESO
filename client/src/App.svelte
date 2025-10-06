<script lang="ts">
  import { onMount } from "svelte";
  import { labAllowed } from "./lib/lab";
  let labUrl = "";

  let iso = false;
  let allowed = false;

  onMount(async () => {
    iso = (globalThis as any).crossOriginIsolated === true;
    try {
      allowed = await labAllowed();
    } catch {}
    // In dev we may be running the Lab client on a separate Vite server.
    // Try to discover its base URL so the "Enter Lab" link opens the right place.
    if ((import.meta as any).env?.DEV) {
      // 1) Prefer the API-provided hint, if present
      try {
        const info = await fetch("/api/lab/info")
          .then((r) => r.json())
          .catch(() => null);
        if (info && info.api_base) {
          labUrl = info.api_base.replace(/\/+$/, "");
          return;
        }
      } catch (e) {}

      // 2) Probe common Vite ports so users can just run `npm run dev` and visit
      //    the app without the launcher. We'll attempt 5174, 5173, then 5175.
      const ports = [5174, 5173, 5175];
      async function probe(url: string, timeout = 300): Promise<boolean> {
        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), timeout);
          await fetch(url, {
            cache: "no-store",
            mode: "no-cors",
            signal: controller.signal,
          });
          clearTimeout(id);
          return true;
        } catch (e) {
          return false;
        }
      }
      for (const p of ports) {
        const u = `http://localhost:${p}/`;
        if (await probe(u)) {
          labUrl = u.replace(/\/+$/, "");
          break;
        }
      }
    }
  });

  function toggleDark() {
    document.documentElement.classList.toggle("dark");
  }
</script>

<main class="min-h-screen bg-background text-foreground font-sans">
  <div class="max-w-5xl mx-auto p-6">
    <header class="flex items-center gap-3 mb-6">
      <img src="/logo.svg" alt="Queso" width="40" height="40" />
      <h1 class="text-2xl font-bold tracking-wide">QUESO</h1>
      <div class="ml-auto flex items-center gap-3">
        {#if allowed}
          <a class="btn" href={labUrl || "/lab"} target="_blank" rel="noopener"
            >Enter Lab</a
          >
        {:else}
          <button class="btn btn-secondary" disabled>Lab Disabled</button>
        {/if}
        <button class="rounded-md border px-3 py-1" on:click={toggleDark}
          >Toggle theme</button
        >
      </div>
    </header>

    <!-- dev-only admin toggle removed; Lab is resolved via /api/lab/allowed -->

    <section
      class="rounded-lg border border-border bg-card text-card-foreground shadow-sm p-6"
    >
      <h2 class="text-xl font-semibold mb-2">System Status</h2>
      <p class="text-sm text-muted-foreground mb-4">
        crossOriginIsolated: <span class="font-mono font-semibold"
          >{iso ? "true" : "false"}</span
        >
      </p>
      <button
        class="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        on:click={async () => {
          const r = await fetch("/api/hello").then((r) => r.text());
          alert(r);
        }}>GET /api/hello</button
      >
    </section>
  </div>
</main>
