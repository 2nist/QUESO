<script>
  let input = "";
  let jobId = "";
  let status = "";
  let progress = 0;
  let slug = "";
  let polling = null;

  async function analyze() {
    if (!input) return alert("Provide a file path or URL");
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input, opts: {} }),
    });
    if (!r.ok) {
      alert(await r.text());
      return;
    }
    const j = await r.json();
    jobId = j.jobId;
    slug = j.slug;
    status = "running";
    progress = 0;
    startPolling();
  }

  async function poll() {
    if (!jobId) return;
    const r = await fetch(`/api/status/${jobId}`);
    if (!r.ok) {
      status = "unknown";
      return;
    }
    const j = await r.json();
    status = j.status;
    progress = j.progress ?? 0;
    if (status === "done" || status === "failed") stopPolling();
  }

  function startPolling() {
    stopPolling();
    polling = setInterval(poll, 1000);
  }
  function stopPolling() {
    if (polling) {
      clearInterval(polling);
      polling = null;
    }
  }
</script>

<main>
  <h1>QUESO</h1>
  <p>Quick Utility for Extraction of Song Objects</p>

  <label>
    Input (file path or URL):
    <input
      bind:value={input}
      placeholder="C:\\music\\song.wav or https://..."
    />
  </label>
  <button on:click={analyze}>Analyze</button>

  {#if jobId}
    <section>
      <div><strong>Job:</strong> {jobId}</div>
      <div><strong>Status:</strong> {status}</div>
      <div><strong>Progress:</strong> {progress}%</div>
      <div><strong>Slug:</strong> {slug}</div>
      {#if status === "done"}
        <div class="artifact-link">
          <a href={"/artifacts/" + slug + "/"} target="_blank" rel="noreferrer"
            >Open Artifacts</a
          >
        </div>
      {/if}
    </section>
  {/if}
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    padding: 1rem;
    max-inline-size: 720px;
    margin-inline: auto;
  }

  label {
    display: block;
  }

  input {
    inline-size: 100%;
    padding: 0.5rem;
    margin-block-start: 0.5rem;
  }

  button {
    margin-block-start: 0.75rem;
    padding: 0.5rem 1rem;
  }

  section {
    margin-block-start: 1rem;
  }

  .artifact-link {
    margin-block-start: 0.5rem;
  }
</style>
