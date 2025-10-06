<script lang="ts">
  import { onMount } from "svelte";
  import { labAllowed } from "../lib/lab";

  let allowed = false;
  const showDev = !!(import.meta as any).env?.DEV;

  onMount(async () => {
    allowed = await labAllowed();
  });
</script>

<div class="card">
  <div class="flex items-center justify-between gap-3">
    <div>
      <div class="font-semibold">Lab Mode</div>
      <div class="text-sm opacity-70">
        Status: {allowed ? "Enabled" : "Disabled"}
      </div>
    </div>
  </div>
  {#if showDev}
    <div class="mt-3 text-xs opacity-70">
      Admin endpoints disabled in this build.
    </div>
  {/if}
</div>
