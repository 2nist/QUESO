<script>
  import { createEventDispatcher, onMount } from "svelte";
  // attach audio listener when audio prop is provided
  import { tick } from "svelte";
  let _attached = null;
  $: if (audio !== _attached) {
    if (_attached && _attached.removeEventListener)
      _attached.removeEventListener("timeupdate", _onTime);
    _attached = audio;
    if (_attached && _attached.addEventListener)
      _attached.addEventListener("timeupdate", _onTime);
  }
  function _onTime(e) {
    updateActiveByTime(e.target.currentTime);
  }

  let fileInput;
  let uploading = false;
  async function onFileChosen(e) {
    const f = (e.target && e.target.files && e.target.files[0]) || null;
    if (!f) return;
    const text = await f.text();
    uploading = true;
    try {
      const r = await fetch("/api/lab/lyrics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, filename: f.name, content: text }),
      });
      if (!r.ok) throw new Error("upload failed");
      await load();
      alert("Uploaded");
    } catch (err) {
      alert("Upload failed: " + String(err));
    } finally {
      uploading = false;
      fileInput.value = null;
    }
  }
</script>

<div
  style="border:1px solid #222;padding:.5rem;border-radius:8px;background:#060606;color:#eaeaea"
>
  <div style="display:flex;align-items:center;justify-content:space-between">
    <h4 style="margin:.25rem 0">Lyrics</h4>
    <div>
      <button class="btn" on:click={load} disabled={loading}
        >{loading ? "Loading…" : "Reload"}</button
      >
      <label style="margin-left:.5rem">
        <input
          bind:this={fileInput}
          type="file"
          accept=".lrc,.txt"
          style="display:none"
          on:change={onFileChosen}
        />
        <button
          class="btn"
          disabled={!slug || uploading}
          on:click={() => fileInput.click()}
          >{uploading ? "Uploading…" : "Upload"}</button
        >
      </label>
    </div>
  </div>
  {#if error}
    <div style="color:#fbb;margin-top:.5rem">{error}</div>
  {/if}
  {#if lines.length === 0}
    <div style="color:#999;margin-top:.5rem">
      No lyrics found for this session.
    </div>
  {:else}
    <ol style="margin-top:.5rem;padding-left:1.2rem">
      {#each lines as l, i}
        <li>
          <button
            class={`lyrics-line ${i === activeIndex ? "active" : ""}`}
            on:click={() => onLineClick(l)}
            style="display:flex;gap:.5rem;align-items:center;width:100%;text-align:left;padding:.25rem;border-radius:4px;background:transparent;border:0;color:inherit"
          >
            <span style="color:#8fa;width:3rem;flex:0 0 auto"
              >{l.time != null
                ? new Date(Math.round(l.time * 1000))
                    .toISOString()
                    .substr(14, 5)
                : "‑"}</span
            >
            <span style="flex:1">{l.text}</span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .btn {
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    background: #222;
    color: #fff;
    border: 1px solid #333;
  }

  .lyrics-line.active {
    background: rgba(120, 200, 120, 0.08);
  }
</style>
