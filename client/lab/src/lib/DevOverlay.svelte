<script>
  import { onDestroy, onMount } from "svelte";
  let apiInfo = { api_base: "" };
  let allowed = false;
  let lines = [];
  let es = null;
  async function fetchInfoOnce() {
    try {
      const r = await fetch("/api/lab/info");
      apiInfo = await r.json();
    } catch (e) {}
    try {
      const r2 = await fetch("/api/lab/allowed");
      const j = await r2.json();
      allowed = !!j.allowed;
    } catch (e) {}
  }
  onMount(() => {
    fetchInfoOnce();
    try {
      es = new EventSource("/api/logs/stream");
      es.onmessage = (ev) => {
        lines.push(ev.data);
        if (lines.length > 500) lines.shift();
      };
    } catch (e) {}
  });
  onDestroy(() => {
    try {
      es && es.close();
    } catch (e) {}
  });
</script>

<div
  style="position:fixed;inset-block-start:12px;inset-inline-end:12px;z-index:1100;pointer-events:auto"
>
  <div
    style="background:rgba(0,0,0,0.6);color:#fff;padding:.5rem;border-radius:8px;border:1px solid rgba(255,255,255,0.06);min-inline-size:220px"
  >
    <div
      style="display:flex;align-items:center;gap:.5rem;justify-content:space-between"
    >
      <div style="font-weight:700">Dev</div>
      <div style="font-size:.85rem;color:lightgrey">
        {allowed ? "Lab ON" : "Lab OFF"}
      </div>
    </div>
    <div style="font-size:.85rem;margin-block-start:.25rem">
      API: <code style="color:#fff">{apiInfo.api_base}</code>
    </div>
    <div
      style="display:flex;gap:.5rem;margin-block-start:.5rem;justify-content:flex-end"
    >
      <button
        class="btn"
        on:click={() =>
          navigator.clipboard?.writeText(
            `curl ${apiInfo.api_base}/api/lab/allowed`,
          )}>Copy curl</button
      >
    </div>
    <details
      style="margin-block-start:.5rem;color:#ddd;font-size:.8rem;max-block-size:160px;overflow:auto"
    >
      <summary style="cursor:pointer">Live logs</summary>
      <pre style="white-space:pre-wrap;margin:0;padding:.25rem">{lines.join(
          "\n",
        )}</pre>
    </details>
  </div>
</div>
