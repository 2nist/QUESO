<script>
  import { onMount } from "svelte";

  // Minimal, dev-first Lab landing page so you can open the Lab with one click.
  const showDev =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.DEV;
  let entered = false;
  let labUrl = "";

  onMount(async () => {
    if (showDev) entered = true;
    const ports = [5174, 5173, 5175];
    for (const p of ports) {
      try {
        await fetch(`http://localhost:${p}/`, {
          mode: "no-cors",
          cache: "no-store",
        });
        labUrl = `http://localhost:${p}`;
        break;
      } catch (e) {}
    }
    // load helpful lab data
    loadExamples();
    loadDownloadJobs();
    loadWorkerStatus();
    try {
      warmupOnStart = JSON.parse(
        localStorage.getItem("lab.warmupOnStart") || "true",
      );
    } catch (e) {
      warmupOnStart = true;
    }
    loadWorkerJobs();
  });

  function enterLab() {
    // Only enter if at least one module selected; persist selection to localStorage
    const any = selectedModules.size > 0;
    if (!any) return alert("Choose at least one Lab module to load");
    try {
      localStorage.setItem(
        "lab.selectedModules",
        JSON.stringify(Array.from(selectedModules)),
      );
    } catch (e) {}
    entered = true;
    // Auto-start analysis worker for smoother dev iteration
    try {
      startWorker();
    } catch (e) {
      /* ignore */
    }
  }
  function openLabInNewTab() {
    window.open(labUrl || "http://localhost:5174", "_blank");
  }
  let ytUrl = "";
  let downloading = false;
  let downloadResult = null;
  let audioFormat = "mp3";
  let audioQuality = "";
  let lastError = null;

  import ChordPalette from "./lib/ChordPalette.svelte";
  import ControlsPanel from "./lib/ControlsPanel.svelte";
  import LyricsPanel from "./lib/LyricsPanel.svelte";
  import RhythmPads from "./lib/RhythmPads.svelte";
  import SectionControls from "./lib/SectionControls.svelte";
  import SectionMap from "./lib/SectionMap.svelte";

  let jobId = null;
  let progress = 0;
  let logLines = [];
  let downloadJobs = [];
  let jobLogs = {};
  let statusPoll = null;
  // Scene state
  let scene = null;
  let sections = [];
  let chords = [];
  let duration = 0;
  let selectedChord = null;
  let optsLocal = {
    sections: true,
    chords: true,
    tempo: true,
    lyrics: true,
    drums: true,
  };
  let examples = { youtube: [], local: [] };
  let runningJob = null;
  let audioEl = null;
  let selectedSectionIndex = null;
  let selectedSectionRange = null;
  let health = null;
  let healthLoading = false;
  let workerStatus = null;
  let workerLoading = false;
  let benchmarkResult = null;
  let benchmarkLoading = false;
  let warmupOnStart = true;

  async function loadHealth() {
    healthLoading = true;
    try {
      const r = await fetch("/api/lab/health");
      health = await r.json();
    } catch (e) {
      health = { error: String(e) };
    } finally {
      healthLoading = false;
    }
  }

  async function loadWorkerStatus() {
    try {
      const r = await fetch("/api/lab/analysis/worker/status");
      if (!r.ok) {
        workerStatus = null;
        return;
      }
      workerStatus = await r.json();
    } catch (e) {
      workerStatus = { error: String(e) };
    }
  }

  async function startWorker() {
    workerLoading = true;
    try {
      const r = await fetch("/api/lab/analysis/worker/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ warmup: warmupOnStart }),
      });
      const j = await r.json();
      await loadWorkerStatus();
      return j;
    } catch (e) {
      return { error: String(e) };
    } finally {
      workerLoading = false;
    }
  }

  async function stopWorker() {
    workerLoading = true;
    try {
      const r = await fetch("/api/lab/analysis/worker/stop", {
        method: "POST",
      });
      const j = await r.json();
      await loadWorkerStatus();
      return j;
    } catch (e) {
      return { error: String(e) };
    } finally {
      workerLoading = false;
    }
  }

  async function runBenchmark() {
    benchmarkLoading = true;
    try {
      const r = await fetch("/api/lab/benchmark");
      const j = await r.json();
      benchmarkResult = j;
      return j;
    } catch (e) {
      benchmarkResult = { error: String(e) };
      return benchmarkResult;
    } finally {
      benchmarkLoading = false;
    }
  }

  async function warmupWorker() {
    try {
      const r = await fetch("/api/lab/analysis/worker/warmup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opts: { preset: "low_cpu" } }),
      });
      const j = await r.json();
      benchmarkResult = j;
      return j;
    } catch (e) {
      return { error: String(e) };
    }
  }

  let workerLogStream = null;
  let workerLogLines = [];
  let currentViewingJobId = null;
  let selectedJobLogs = [];
  function startWorkerLogs() {
    if (workerLogStream) return;
    const es = new EventSource("/api/lab/analysis/worker/logs/stream");
    es.onmessage = (ev) => {
      try {
        const item = JSON.parse(ev.data);
        workerLogLines.push(item);
        if (workerLogLines.length > 500) workerLogLines.shift();
        // trigger Svelte update
        workerLogLines = workerLogLines.slice(-500);
        // If a job is being viewed, append matching lines to the live job logs
        if (
          currentViewingJobId &&
          item.line &&
          item.line.indexOf(`[JOB ${currentViewingJobId}]`) === 0
        ) {
          selectedJobLogs.push(item);
          if (selectedJobLogs.length > 1000) selectedJobLogs.shift();
          selectedJobLogs = selectedJobLogs.slice(-1000);
        }
      } catch (e) {}
    };
    es.onerror = () => {
      try {
        es.close();
      } catch (e) {}
      workerLogStream = null;
    };
    workerLogStream = es;
  }
  function stopWorkerLogs() {
    if (workerLogStream) {
      workerLogStream.close();
      workerLogStream = null;
    }
  }

  async function analyzeWithWorker() {
    const input =
      downloadResult?.url ||
      examples.youtube[0] ||
      examples.local[0] ||
      prompt("Input URL or artifact path");
    if (!input) return;
    const slug = sessionSlug || (makeSessionSlug() && sessionSlug) || "manual";
    const out = `artifacts/${slug}`;
    try {
      const r = await fetch("/api/lab/analysis/worker/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input,
          out,
          opts: { ...optsLocal, preset: "low_cpu", slug },
        }),
      });
      const j = await r.json();
      if (!r.ok) return alert("Analysis failed: " + JSON.stringify(j));
      // worker returns results synchronously — refresh artifacts
      await loadArtifacts(slug);
      alert("Analysis completed via worker");
    } catch (e) {
      alert("Analyze-with-worker failed: " + String(e));
    }
  }

  async function warmupAndRunTest() {
    try {
      // ensure worker running and warm it
      await startWorker();
      await fetch("/api/lab/analysis/worker/warmup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opts: { preset: "low_cpu" } }),
      });
      // now kick off a test job using the 'test_input' alias
      const slug = sessionSlug || (makeSessionSlug() && sessionSlug) || "test";
      const out = `artifacts/${slug}`;
      const r = await fetch("/api/lab/analysis/worker/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input: "test_input",
          out,
          opts: { preset: "low_cpu", slug },
        }),
      });
      const j = await r.json();
      if (!r.ok) return alert("Test analyze failed: " + JSON.stringify(j));
      alert("Test job queued: " + j.jobId);
      await loadWorkerJobs();
      return j;
    } catch (e) {
      alert("Warmup & test failed: " + String(e));
    }
  }

  let workerJobs = [];
  async function loadWorkerJobs() {
    try {
      const r = await fetch("/api/lab/analysis/worker/jobs");
      if (!r.ok) {
        workerJobs = [];
        return;
      }
      const j = await r.json();
      workerJobs = j.jobs || [];
    } catch (e) {
      workerJobs = [];
    }
  }

  async function viewJobLogs(id) {
    try {
      const r = await fetch(`/api/lab/analysis/worker/jobs/${id}/logs`);
      const j = await r.json();
      benchmarkResult = j;
      currentViewingJobId = id;
      selectedJobLogs = j.logs || [];
      // ensure we have latest job list
      await loadWorkerJobs();
    } catch (e) {
      benchmarkResult = { error: String(e) };
    }
  }

  let jobLogStream = null;
  async function startJobLogs(id) {
    // close previous
    stopJobLogs();
    currentViewingJobId = id;
    selectedJobLogs = [];
    // fetch historical logs first
    try {
      const r = await fetch(`/api/lab/analysis/worker/jobs/${id}/logs`);
      if (r.ok) {
        const j = await r.json();
        selectedJobLogs = j.logs || [];
      }
    } catch (e) {}
    // open proxied SSE
    const es = new EventSource(
      `/api/lab/analysis/worker/jobs/${id}/logs/stream`,
    );
    es.onmessage = (ev) => {
      try {
        const it = JSON.parse(ev.data);
        selectedJobLogs.push(it);
        if (selectedJobLogs.length > 2000) selectedJobLogs.shift();
      } catch (e) {}
    };
    es.onerror = () => {
      try {
        es.close();
      } catch (e) {}
      jobLogStream = null;
    };
    jobLogStream = es;
  }
  function stopJobLogs() {
    if (jobLogStream) {
      jobLogStream.close();
      jobLogStream = null;
    }
    currentViewingJobId = null;
  }

  // Module selection landing state
  const MODULES = [
    {
      id: "section",
      name: "Section Map",
      desc: "Preview sections and drop chords",
    },
    {
      id: "chords",
      name: "Chord Palette",
      desc: "Pick and paint chords on the timeline",
    },
    {
      id: "rhythm",
      name: "Rhythm Pads",
      desc: "Design rhythmic patterns and route MIDI",
    },
    {
      id: "downloader",
      name: "Downloader",
      desc: "Download MP3s from YouTube",
    },
    {
      id: "lyrics",
      name: "Lyrics",
      desc: "Karaoke-style lyrics viewer and import",
    },
  ];
  let selectedModules = new Set();
  // restore selection when possible
  try {
    const s = JSON.parse(localStorage.getItem("lab.selectedModules") || "[]");
    s.forEach((i) => selectedModules.add(i));
  } catch (e) {}

  // session slug to group artifacts for this lab session
  let sessionSlug = null;
  try {
    sessionSlug = localStorage.getItem("lab.sessionSlug");
  } catch (e) {}

  function toggleModule(id) {
    if (selectedModules.has(id)) selectedModules.delete(id);
    else selectedModules.add(id);
    // force update: replace with new Set reference
    selectedModules = new Set(Array.from(selectedModules));
  }

  // create a short slug for the session
  function makeSessionSlug() {
    const s =
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    sessionSlug = s;
    try {
      localStorage.setItem("lab.sessionSlug", s);
    } catch (e) {}
  }

  async function loadDemoForModule(id) {
    try {
      const r = await fetch("/src/presets/demo-scene.json");
      const j = await r.json();
      // demo format: { scene, sections, chords }
      if (j.scene) scene = j.scene;
      if (j.sections) sections = j.sections;
      if (j.chords) chords = j.chords;
      duration = j.scene?.duration || 0;
      // ensure module selected so it appears when entering
      selectedModules.add(id);
      selectedModules = new Set(Array.from(selectedModules));
    } catch (e) {
      alert("failed to load demo: " + String(e));
    }
  }

  async function pollJobStatus(id) {
    try {
      const r = await fetch(`/api/lab/download/status/${id}`);
      if (!r.ok) throw new Error("no status");
      const j = await r.json();
      progress = j.progress || 0;
      if (j.artifact) {
        downloadResult = { url: j.artifact, slug: j.slug };
        clearInterval(statusPoll);
        statusPoll = null;
        downloading = false;
        return;
      }
      if (j.status === "failed") {
        lastError = { error: "failed" };
        clearInterval(statusPoll);
        statusPoll = null;
        downloading = false;
      }
    } catch (e) {
      // ignore temporary errors
    }
  }

  async function loadExamples() {
    try {
      const r = await fetch("/api/lab/examples");
      if (r.ok) examples = await r.json();
    } catch (e) {}
  }

  async function loadDownloadJobs() {
    try {
      const r = await fetch("/api/lab/download/jobs");
      if (!r.ok) return;
      const j = await r.json();
      downloadJobs = j.jobs || [];
    } catch (e) {
      console.warn("failed to load download jobs", e);
    }
  }

  async function fetchLogsForJob(id) {
    try {
      const r = await fetch(`/api/lab/download/logs/latest/${id}`);
      if (!r.ok) return;
      const j = await r.json();
      jobLogs[id] = j.lines || [];
      jobLogs = Object.assign({}, jobLogs);
    } catch (e) {
      console.warn("failed to fetch logs", e);
    }
  }

  async function runAnalyze() {
    const input =
      downloadResult?.url ||
      examples.youtube[0] ||
      examples.local[0] ||
      prompt("Input URL or artifact path");
    if (!input) return;
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input,
          opts: {
            sections: true,
            chords: true,
            tempo: true,
            lyrics: true,
            slug: sessionSlug,
          },
        }),
      });
      const j = await r.json();
      runningJob = j.jobId;
      pollAnalysisStatus();
    } catch (e) {
      alert("failed to start analysis: " + String(e));
    }
  }

  async function pollAnalysisStatus() {
    while (runningJob) {
      try {
        const r = await fetch(`/api/status/${runningJob}`);
        const s = await r.json();
        if (s.status === "done" || s.status === "failed") {
          const slug = s.slug;
          runningJob = null;
          await loadArtifacts(slug);
          break;
        }
      } catch (e) {}
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  async function loadArtifacts(slug) {
    const base = `/artifacts/${slug}`;
    try {
      const tempo = await (await fetch(base + "/tempo.json"))
        .json()
        .catch(() => ({ bpm: 120, beat_times: [] }));
      const sectionsLab = await (await fetch(base + "/sections.lab"))
        .text()
        .catch(() => "");
      const chordsLab = await (await fetch(base + "/chords.lab"))
        .text()
        .catch(() => "");
      scene = {
        title: slug,
        tempo: tempo.bpm || 120,
        chords: [],
        sections: [],
      };
      sections = sectionsLab
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => {
          const p = l.split(/\s+/);
          return {
            start: parseFloat(p[0]) || 0,
            end: parseFloat(p[1]) || 0,
            label: p.slice(2).join(" "),
          };
        });
      chords = chordsLab
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => {
          const p = l.split(/\s+/);
          return {
            start: parseFloat(p[0]) || 0,
            end: parseFloat(p[1]) || 0,
            label: p.slice(2).join(" "),
          };
        });
      scene.chords = chords;
      scene.sections = sections;
      const lastSectionEnd = sections.length
        ? Math.max(...sections.map((s) => s.end || 0))
        : 0;
      const lastChordEnd = chords.length
        ? Math.max(...chords.map((c) => c.end || 0))
        : 0;
      duration = tempo.duration || lastSectionEnd || lastChordEnd || 0;
    } catch (e) {
      console.warn("failed to load artifacts", e);
    }
  }

  function downloadScene() {
    if (!scene) return;
    const a = document.createElement("a");
    const blob = new Blob([JSON.stringify(scene, null, 2)], {
      type: "application/json",
    });
    a.href = URL.createObjectURL(blob);
    a.download = (scene.title || "scene") + ".json";
    a.click();
  }

  async function downloadMp3() {
    if (!ytUrl) return;
    downloading = true;
    downloadResult = null;
    lastError = null;
    try {
      const r = await fetch("/api/lab/download-mp3-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: ytUrl,
          slug: sessionSlug,
          opts: { audio_format: audioFormat, audio_quality: audioQuality },
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        lastError = j;
        downloading = false;
        return;
      }
      jobId = j.jobId;
      // start polling status & logs
      progress = 0;
      statusPoll = setInterval(() => {
        pollJobStatus(jobId);
        pollJobLogs(jobId);
      }, 1000);
    } catch (e) {
      lastError = { error: String(e) };
      downloading = false;
    }
  }
</script>

{#if !entered}
  <div class="lab-card">
    <div style="display:flex;align-items:center;gap:1rem">
      <h1 style="margin:0">Creamery Lab</h1>
      <div style="font-size:.9rem;color:#888">
        Session: {sessionSlug || "none"}
      </div>
      <div style="margin-inline-start:auto;display:flex;gap:.5rem">
        <button
          class="btn"
          on:click={() => {
            makeSessionSlug();
            alert("New session: " + sessionSlug);
          }}>New Session</button
        >
        <button class="btn" on:click={loadHealth}
          >{healthLoading ? "Checking…" : "Health"}</button
        >
        <button class="btn" on:click={loadWorkerStatus}
          >{workerLoading
            ? "…"
            : workerStatus && workerStatus.running
              ? "Worker: ON"
              : "Worker: Status"}</button
        >
        <label style="display:flex;align-items:center;gap:.5rem">
          <input
            type="checkbox"
            bind:checked={warmupOnStart}
            on:change={() => {
              try {
                localStorage.setItem(
                  "lab.warmupOnStart",
                  JSON.stringify(warmupOnStart),
                );
              } catch (e) {}
            }}
          />
          <span style="font-size:.85rem">Warmup on Start</span>
        </label>
        <button class="btn" on:click={startWorker} disabled={workerLoading}
          >{workerLoading ? "Starting…" : "Start Worker"}</button
        >
        <button class="btn" on:click={stopWorker} disabled={workerLoading}
          >{workerLoading ? "Stopping…" : "Stop Worker"}</button
        >
        <button class="btn" on:click={warmupWorker}>Warmup</button>
        <button class="btn" on:click={warmupAndRunTest}>Warmup & Test</button>
        <button class="btn" on:click={loadWorkerJobs}>Refresh Jobs</button>
        <button class="btn" on:click={runBenchmark} disabled={benchmarkLoading}
          >{benchmarkLoading ? "Benchmarking…" : "Run Benchmark"}</button
        >
        <button class="btn" on:click={startWorkerLogs}>Stream Logs</button>
        <button class="btn" on:click={stopWorkerLogs}>Stop Logs</button>
      </div>
    </div>
    <p>Choose which Lab modules you want to load for this session.</p>
    <div style="display:flex;gap:1rem;margin-block-start:.75rem;flex-wrap:wrap">
      {#each MODULES as m}
        <div
          class="lab-panel"
          style="inline-size:220px;display:flex;flex-direction:column;gap:.5rem"
        >
          <div
            style="display:flex;align-items:center;justify-content:space-between"
          >
            <div style="font-weight:600">{m.name}</div>
            <input
              type="checkbox"
              aria-label={m.name}
              checked={selectedModules.has(m.id)}
              on:change={() => toggleModule(m.id)}
            />
          </div>
          <div style="font-size:.85rem;opacity:.85">{m.desc}</div>
          <div style="display:flex;gap:.5rem;margin-block-start:.5rem">
            <button class="btn" on:click={() => loadDemoForModule(m.id)}
              >Load Demo</button
            >
            <button
              class="btn btn-secondary"
              on:click={() => {
                selectedModules.add(m.id);
                selectedModules = new Set(Array.from(selectedModules));
              }}>Select</button
            >
          </div>
        </div>
      {/each}
    </div>
    {#if workerStatus}
      <div style="margin-block-start:.5rem;font-size:.85rem;color:#666">
        Worker: {workerStatus.running
          ? `running (pid ${workerStatus.pid})`
          : "stopped"} — port: {workerStatus.port}
      </div>
    {/if}
    {#if workerLogLines.length}
      <div
        style="margin-block-start:.5rem;background:#0b0b0b;padding:.5rem;border-radius:4px;color:#dcdcdc"
      >
        <div style="font-weight:600">Worker Logs (live)</div>
        <pre
          style="max-block-size:240px;overflow:auto;white-space:pre-wrap">{workerLogLines
            .map((l) => `[${new Date(l.ts).toLocaleTimeString()}] ${l.line}`)
            .join("\n")}</pre>
      </div>
    {/if}
    {#if benchmarkResult}
      <div
        style="margin-block-start:.5rem;background:#f6f6f6;padding:.5rem;border-radius:4px"
      >
        <div style="font-weight:600">Benchmark result</div>
        <pre style="max-block-size:160px;overflow:auto">{JSON.stringify(
            benchmarkResult,
            null,
            2,
          )}</pre>
      </div>
    {/if}
    <div
      style="display:flex;gap:.5rem;margin-block-start:1rem;align-items:center"
    >
      <button
        class="btn"
        on:click={() => {
          MODULES.forEach((m) => selectedModules.add(m.id));
          selectedModules = new Set(Array.from(selectedModules));
        }}
      >
        Select All
      </button>
      <button
        class="btn btn-secondary"
        on:click={() => {
          selectedModules = new Set();
          try {
            localStorage.removeItem("lab.selectedModules");
          } catch (e) {}
        }}
      >
        Clear
      </button>
      <div style="margin-inline-start:auto;display:flex;gap:.5rem">
        <button
          class="btn"
          on:click={enterLab}
          disabled={selectedModules.size === 0}>Enter Lab</button
        >
        <button class="btn" on:click={openLabInNewTab}
          >Open Lab in new tab</button
        >
      </div>
    </div>
    <div style="margin-block-start:.75rem;color:#777;font-size:.9rem">
      Saved selection: {Array.from(selectedModules).join(", ") || "none"}
    </div>
    {#if health}
      <div
        style="margin-top:.75rem;padding:.5rem;border:1px dashed #444;border-radius:6px;color:#ddd;background:#060606"
      >
        <h4 style="margin:.25rem 0">Health</h4>
        <pre style="max-height:200px;overflow:auto">{JSON.stringify(
            health,
            null,
            2,
          )}</pre>
      </div>
    {/if}
  </div>
{:else}
  <div class="lab-card">
    <h2>Creamery Lab — Developer Preview</h2>
    <p>
      Minimal preview to confirm the UI loads. Open the full client in another
      tab for the complete experience.
    </p>
    <div style="display:flex;gap:1rem;margin-block-start:.75rem">
      {#if selectedModules.has("section")}
        <div style="flex:1;min-inline-size:60%">
          <div
            style="display:flex;align-items:center;justify-content:space-between"
          >
            <h3 style="margin:0">Scene Preview</h3>
            <div>
              <button
                class="btn"
                on:click={() => {
                  entered = false;
                }}>Exit</button
              >
            </div>
          </div>
          <div
            style="margin-block-start:.5rem;border:1px solid #222;padding:.75rem;border-radius:8px;background:#0f0f10"
          >
            <SectionMap
              {duration}
              {sections}
              bind:chords
              on:select={(e) => {
                selectedSectionIndex = e.detail.index;
              }}
              on:selectRange={(e) => {
                selectedSectionRange = {
                  start: e.detail.startIndex,
                  end: e.detail.endIndex,
                };
                selectedSectionIndex = e.detail.startIndex;
              }}
            />
            <SectionMap
              {duration}
              {sections}
              bind:chords
              selectedIndex={selectedSectionIndex}
              on:select={(e) => {
                selectedSectionIndex = e.detail.index;
              }}
              on:selectRange={(e) => {
                selectedSectionRange = {
                  start: e.detail.startIndex,
                  end: e.detail.endIndex,
                };
                selectedSectionIndex = e.detail.startIndex;
              }}
            />
          </div>
          <div
            style="margin-block-start:.75rem;display:flex;gap:.5rem;align-items:center"
          >
            <button class="btn" on:click={downloadScene} disabled={!scene}
              >Export Scene</button
            >
            <button class="btn" on:click={runAnalyze}>Run Analysis</button>
            <button class="btn" on:click={loadExamples}>Load Examples</button>
          </div>
        </div>
      {:else}
        <div style="flex:1;min-inline-size:60%">
          <div
            style="display:flex;align-items:center;justify-content:space-between"
          >
            <h3 style="margin:0">Scene Preview</h3>
            <div>
              <button
                class="btn"
                on:click={() => {
                  entered = false;
                }}>Exit</button
              >
            </div>
          </div>
          <div
            style="margin-block-start:.5rem;border:1px dashed #333;padding:.75rem;border-radius:8px;background:transparent;color:#999"
          >
            <p style="margin:0">
              Section Map not selected. Choose the "Section Map" module to
              preview the timeline.
            </p>
          </div>
        </div>
      {/if}

      {#if selectedModules.has("chords") || selectedModules.has("rhythm") || selectedModules.has("section")}
        <aside
          style="inline-size:320px;display:flex;flex-direction:column;gap:1rem"
        >
          {#if selectedModules.has("chords")}
            <div
              style="border:1px solid #222;padding:.5rem;border-radius:8px;background:#0b0b0c"
            >
              <h4 style="margin:.25rem 0">Chords</h4>
              <ChordPalette
                on:select={(e) => (selectedChord = e.detail.chord)}
                on:paint={(e) => {
                  chords.push({
                    start: e.detail.start,
                    end: (e.detail.end || e.detail.start) + 4,
                    label: e.detail.label,
                  });
                }}
              />
            </div>
          {/if}

          {#if selectedModules.has("rhythm")}
            <div
              style="border:1px solid #222;padding:.5rem;border-radius:8px;background:#0b0b0c"
            >
              <h4 style="margin:.25rem 0">Rhythm</h4>
              <RhythmPads tempo={scene?.tempo || 120} />
            </div>
          {/if}

          {#if selectedModules.has("chords") || selectedModules.has("rhythm") || selectedModules.has("section")}
            <div
              style="border:1px solid #222;padding:.5rem;border-radius:8px;background:#0b0b0c"
            >
              <ControlsPanel bind:opts={optsLocal} />
            </div>
          {/if}
          {#if selectedModules.has("lyrics")}
            <div
              style="border:1px solid #222;padding:.5rem;border-radius:8px;background:#0b0b0c"
            >
              <LyricsPanel
                {sessionSlug}
                audio={audioEl}
                on:seek={(e) => {
                  if (audioEl) {
                    audioEl.currentTime = Number(e.detail.time || 0);
                    audioEl.play().catch(() => {});
                  } else alert("Load an audio artifact to use seek");
                }}
              />
            </div>
          {/if}
          {#if selectedModules.has("section")}
            <div
              style="border:1px solid #222;padding:.5rem;border-radius:8px;background:#0b0b0c"
            >
              <SectionControls
                {sections}
                slug={sessionSlug}
                selectedIndex={selectedSectionIndex}
                on:update={(e) => {
                  sections = e.detail.sections;
                }}
              />
              <SectionControls
                {sections}
                slug={sessionSlug}
                selectedIndex={selectedSectionIndex}
                selectedRange={selectedSectionRange}
                on:update={(e) => {
                  sections = e.detail.sections;
                }}
              />
            </div>
          {/if}
        </aside>
      {/if}
    </div>
    <section
      style="margin-block-start:1rem;border-block-start:1px solid #222;padding-block-start:1rem"
    >
      <h3>Download MP3 from YouTube</h3>
      <div
        style="display:flex;gap:.5rem;align-items:center;margin-block-start:.5rem"
      >
        <input
          placeholder="https://youtube.com/watch?v=..."
          bind:value={ytUrl}
          style="flex:1;padding:.5rem;border-radius:6px;border:1px solid #333;background:transparent;color:inherit"
        />
        <select
          bind:value={audioFormat}
          style="border-radius:6px;padding:.4rem;border:1px solid #333;background:transparent;color:inherit"
        >
          <option value="mp3">mp3</option>
          <option value="m4a">m4a</option>
        </select>
        <input
          placeholder="audio quality (e.g. 192)"
          bind:value={audioQuality}
          style="inline-size:8rem;padding:.4rem;border-radius:6px;border:1px solid #333;background:transparent;color:inherit"
        />
        <button
          class="btn"
          on:click={downloadMp3}
          disabled={!ytUrl || downloading}
          >{downloading ? "Downloading…" : "Download"}</button
        >
      </div>
      {#if lastError}
        <div style="margin-block-start:.5rem;color:#fbb">
          <strong>Error:</strong>
          {lastError.error || "download failed"}
          {#if lastError.help}
            <div>
              <a href={lastError.help} target="_blank" rel="noopener"
                >{lastError.help}</a
              >
            </div>
          {/if}
        </div>
      {/if}
      {#if downloadResult}
        <div style="margin-block-start:.5rem">
          <div>
            Download complete: <a
              href={downloadResult.url}
              target="_blank"
              rel="noopener">{downloadResult.url}</a
            >
          </div>
          <div style="margin-top:.5rem">
            <audio
              controls
              bind:this={audioEl}
              src={downloadResult.url}
              style="width:100%"
            ></audio>
          </div>
        </div>
      {/if}
      {#if jobId}
        <div style="margin-block-start:.5rem">
          <div>Job: {jobId} — progress: {Math.round(progress)}%</div>
          <div
            style="background:#222;border:1px solid #333;block-size:10px;border-radius:6px;margin-block-start:.25rem"
          >
            <div
              style={`background:#4caf50;block-size:100%;inline-size:${Math.min(100, Math.round(progress))}%;border-radius:6px`}
            />
          </div>
          <details style="margin-block-start:.5rem;color:#ccc">
            <summary>View logs ({logLines.length} lines)</summary>
            <pre
              style="max-block-size:200px;overflow:auto;background:#000;padding:.5rem;border-radius:6px">{logLines.join(
                "\n",
              )}</pre>
          </details>
        </div>
      {/if}

      <section style="margin-top:1rem;">
        <h4>Previous Download Jobs</h4>
        <div style="display:flex;gap:.5rem;align-items:center">
          <button class="btn" on:click={loadDownloadJobs}>Refresh Jobs</button>
        </div>
        {#if downloadJobs.length === 0}
          <div style="margin-top:.5rem;color:#888">No jobs</div>
        {/if}
        {#each downloadJobs as j}
          <details
            style="margin-top:.5rem;padding:.5rem;border:1px solid #222;border-radius:6px;background:#070707;color:#ddd"
          >
            <summary
              >{j.slug} — {j.jobId} — {j.status} — {Math.round(
                j.progress || 0,
              )}%</summary
            >
            <div style="margin-top:.5rem">
              <div>
                Started: {j.started
                  ? new Date(j.started).toLocaleString()
                  : "-"} Ended: {j.ended
                  ? new Date(j.ended).toLocaleString()
                  : "-"}
              </div>
              {#if j.artifact}
                <div
                  style="margin-top:.25rem;display:flex;gap:.5rem;align-items:center"
                >
                  <a href={j.artifact} target="_blank" rel="noopener"
                    >{j.artifact}</a
                  >
                  <button
                    class="btn"
                    on:click={(ev) => {
                      ev.preventDefault();
                      if (audioEl) {
                        audioEl.src = j.artifact;
                        audioEl.play().catch(() => {});
                      } else alert("Audio player not available");
                    }}>Play</button
                  >
                </div>
              {/if}
              <div style="margin-top:.5rem">
                <button
                  class="btn btn-secondary"
                  on:click={() => fetchLogsForJob(j.jobId)}>Fetch logs</button
                >
              </div>
              {#if jobLogs[j.jobId]}
                <pre
                  style="max-height:200px;overflow:auto;margin-top:.5rem;background:#000;padding:.5rem;border-radius:6px;color:#ccc">{jobLogs[
                    j.jobId
                  ].join("\n")}</pre>
              {/if}
            </div>
          </details>
        {/each}
      </section>
      <section style="margin-block-start:1rem;">
        <h4>Analysis Worker Jobs</h4>
        <div style="display:flex;gap:.5rem;align-items:center">
          <button class="btn" on:click={loadWorkerJobs}>Refresh Jobs</button>
        </div>
        {#if workerJobs.length === 0}
          <div style="margin-block-start:.5rem;color:#888">No jobs</div>
        {/if}
        {#each workerJobs as j}
          <details
            style="margin-block-start:.5rem;padding:.5rem;border:1px solid #222;border-radius:6px;background:#070707;color:#ddd"
          >
            <summary
              >{j.id} — {j.status} — {j.started
                ? new Date(j.started).toLocaleString()
                : "-"}
            </summary>
            <div style="margin-block-start:.5rem">
              <div style="display:flex;gap:.5rem;align-items:center">
                <button class="btn" on:click={() => viewJobLogs(j.id)}
                  >View Logs</button
                >
              </div>
              {#if benchmarkResult && benchmarkResult.logs}
                <pre
                  style="max-block-size:200px;overflow:auto;margin-block-start:.5rem;background:#000;padding:.5rem;border-radius:6px;color:#ccc">{benchmarkResult.logs
                    .map(
                      (l) =>
                        `[${new Date(l.ts).toLocaleTimeString()}] ${l.line}`,
                    )
                    .join("\n")}</pre>
              {/if}
            </div>
          </details>
        {/each}
      </section>
    </section>
  </div>
{/if}

<style>
  .lab-card {
    padding: 1rem;
    border-radius: 8px;
    background: var(--card, #111);
    color: var(--text, #fff);
    max-inline-size: 900px;
    margin-block: 2rem;
    margin-inline: auto;
  }
  .btn {
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: #222;
    color: #fff;
    border: 1px solid #333;
    cursor: pointer;
  }
</style>
