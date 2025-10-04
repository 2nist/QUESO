<script>
  import { onMount } from "svelte";
  let allowed = false;
  let entered = false;
  let examples = { youtube: [], local: [] };
  let input = "";
  let out = "";
  let runningJob = null;
  let logs = "";

  async function checkAllowed() {
    try {
      const r = await fetch("/api/lab/allowed");
      const j = await r.json();
      allowed = !!j.allowed;
    } catch (e) {
      allowed = false;
    }
  }

  onMount(() => {
    checkAllowed();
  });

  function enterLab() {
    if (!allowed) return alert("Lab mode not enabled on the server");
    entered = true;
  }

  async function loadExamples() {
    const r = await fetch("/api/lab/examples");
    examples = await r.json();
  }

  import ChordPalette from "./lib/ChordPalette.svelte";
  import ControlsPanel from "./lib/ControlsPanel.svelte";
  import RhythmPads from "./lib/RhythmPads.svelte";
  import SectionMap from "./lib/SectionMap.svelte";
  import { createUndoStore } from "./lib/undoStore.js";

  let scene = null;
  let sections = [];
  let chords = [];
  let optsLocal = {
    sections: true,
    chords: true,
    tempo: true,
    lyrics: true,
    drums: true,
  };
  // Undo/redo for scene edits
  const undo = createUndoStore({ scene: null });
  let canUndo = false;
  let canRedo = false;
  let selectedChord = null;

  async function runAnalyze() {
    const body = {
      input: input || examples.youtube[0] || examples.local[0],
      opts: { sections: true, chords: true, tempo: true, lyrics: true },
    };
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    runningJob = j.jobId;
    pollStatus();
  }

  async function pollStatus() {
    while (runningJob) {
      const r = await fetch(`/api/status/${runningJob}`);
      const s = await r.json();
      logs = JSON.stringify(s, null, 2);
      if (s.status === "done" || s.status === "failed") {
        runningJob = null;
        // load artifacts into scene preview
        await loadArtifacts(s.slug);
        break;
      }
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  async function loadArtifacts(slug) {
    const base = `/artifacts/${slug}`;
    try {
      const tempo = await (await fetch(base + "/tempo.json")).json();
      const sectionsLab = await (await fetch(base + "/sections.lab"))
        .text()
        .catch((_) => "");
      const chordsLab = await (await fetch(base + "/chords.lab"))
        .text()
        .catch((_) => "");
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
            start: parseFloat(p[0]),
            end: parseFloat(p[1]),
            label: p.slice(2).join(" "),
          };
        });
      chords = chordsLab
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => {
          const p = l.split(/\s+/);
          return {
            start: parseFloat(p[0]),
            end: parseFloat(p[1]),
            label: p.slice(2).join(" "),
          };
        });
      scene.chords = chords;
      scene.sections = sections;
      // seed undo history with the initial scene state
      undo.push({ scene: JSON.parse(JSON.stringify(scene)) });
      canUndo = true;
    } catch (e) {
      console.warn("failed to load artifacts", e);
    }
  }

  function pushSceneState() {
    if (!scene) return;
    undo.push({ scene: JSON.parse(JSON.stringify(scene)) });
    canUndo = true;
    canRedo = false;
  }

  function doUndo() {
    const st = undo.undo();
    if (st && st.scene) {
      scene = st.scene;
      chords = scene.chords || [];
      sections = scene.sections || [];
    }
    canRedo = true;
    canUndo = !!undo && !!undo.get();
  }

  function doRedo() {
    const st = undo.redo();
    if (st && st.scene) {
      scene = st.scene;
      chords = scene.chords || [];
      sections = scene.sections || [];
    }
    canUndo = !!undo && !!undo.get();
  }

  import { onMount, onDestroy } from 'svelte'
  onMount(() => {
    const keyHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); doUndo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); doRedo() }
    }
    window.addEventListener('keydown', keyHandler)
    onDestroy(() => window.removeEventListener('keydown', keyHandler))
  })
</script>

{#if !entered}
  <div class="card">
    <h2>Creamery Lab</h2>
    <p>
      {allowed
        ? "Lab is available on this server."
        : "Lab is not enabled on server (LAB_MODE=false)."}
    </p>
    <button on:click={enterLab} disabled={!allowed}>Enter Lab</button>
    <button on:click={loadExamples}>Load Examples</button>
  </div>
{:else}
  <div class="card">
    <h3>Input & Options</h3>
    <label>Input URL or local path</label>
    <input
      bind:value={input}
      placeholder={examples.youtube[0] || examples.local[0] || ""}
      style="inline-size:100%"
    />
    <div style="margin-block-start:.5rem">
      <button on:click={runAnalyze}>Run Analysis</button>
    </div>
  </div>

  <div class="card">
    <h3>Status & Logs</h3>
    <pre style="max-block-size:240px;overflow:auto">{logs}</pre>
  </div>

  <div class="card">
    <h3>Section Map (preview)</h3>
    <p>Sections & chord badges will be visible here once analysis completes.</p>
    {#if scene}
      <div><strong>Scene:</strong> {scene.title} — {scene.tempo} BPM</div>
      <ControlsPanel
        bind:opts={optsLocal}
        on:change={(e) => (optsLocal = e.detail.opts)}
      />
      <SectionMap
        {sections}
        {duration}
        bind:chords
        on:place={(e) => {
          const t = e.detail.time; // place default chord if selected
          if (selectedChord) {
            chords.push({ start: t, end: t + 4, label: selectedChord });
            scene.chords = chords;
            pushSceneState();
          }
        }}
      />
      <ChordPalette
        on:select={(e) => (selectedChord = e.detail.chord)}
        on:paint={(e) => {
          chords.push({ start: e.detail.start, end: e.detail.start + 4, label: e.detail.label });
          scene.chords = chords;
          pushSceneState();
        }}
      />
      <RhythmPads
        tempo={scene.tempo || 120}
        lanes={[
          { name: "kick", pattern: "x..." },
          { name: "snare", pattern: "....x" },
          { name: "hihat", pattern: "x.x." },
        ]}
      />
      <div style="margin-block-start:.5rem">
        <button on:click={() => downloadScene()}>Export scene JSON</button>
        <button on:click={doUndo} disabled={!canUndo} style="margin-inline-start:.5rem">Undo</button>
        <button on:click={doRedo} disabled={!canRedo} style="margin-inline-start:.25rem">Redo</button>
      </div>
      <div style="margin-block-start:.5rem">
        <h4>Placed chords</h4>
        <ul>
          {#each chords as c, i}
            <li>
              {i + 1}. {c.label} @ {c.start.toFixed(2)}s
              <button
                on:click={() => {
                  chords.splice(i, 1);
                  scene.chords = chords;
                  pushSceneState();
                }}
              >Remove</button>
              >
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>

  <script>
    async function downloadScene() {
      if (!scene) return;
      const a = document.createElement("a");
      const blob = new Blob([JSON.stringify(scene, null, 2)], {
        type: "application/json",
      });
      a.href = URL.createObjectURL(blob);
      a.download = (scene.title || "scene") + ".json";
      a.click();
    }
    
  </script>
{/if}

<style>
  .card {
    padding: 1rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    margin: 0.5rem 0;
  }
</style>
