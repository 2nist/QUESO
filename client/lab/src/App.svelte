<script>
  import { onMount } from 'svelte'
  let allowed = false
  let entered = false
  let examples = { youtube: [], local: [] }
  let input = ''
  let out = ''
  let runningJob = null
  let logs = ''

  async function checkAllowed() {
    try {
      const r = await fetch('/api/lab/allowed')
      const j = await r.json()
      allowed = !!j.allowed
    } catch (e) { allowed = false }
  }

  onMount(() => { checkAllowed() })

  function enterLab() {
    if (!allowed) return alert('Lab mode not enabled on the server')
    entered = true
  }

  async function loadExamples() {
    const r = await fetch('/api/lab/examples')
    examples = await r.json()
  }

  import ChordPalette from './lib/ChordPalette.svelte'
  import RhythmPads from './lib/RhythmPads.svelte'

  let scene = null

  async function runAnalyze() {
    const body = { input: input || examples.youtube[0] || examples.local[0], opts: { sections: true, chords: true, tempo: true, lyrics: true } }
    const r = await fetch('/api/analyze', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) })
    const j = await r.json()
    runningJob = j.jobId
    pollStatus()
  }

  async function pollStatus() {
    while (runningJob) {
      const r = await fetch(`/api/status/${runningJob}`)
      const s = await r.json()
      logs = JSON.stringify(s, null, 2)
      if (s.status === 'done' || s.status === 'failed') {
        runningJob = null
        break
      }
      await new Promise(res => setTimeout(res, 1000))
    }
  }
</script>

<style>
  .card { padding: 1rem; border: 1px solid #ddd; border-radius: 8px; margin: .5rem 0 }
</style>

{#if !entered}
  <div class="card">
    <h2>Creamery Lab</h2>
    <p>{allowed ? 'Lab is available on this server.' : 'Lab is not enabled on server (LAB_MODE=false).'}</p>
    <button on:click={enterLab} disabled={!allowed}>Enter Lab</button>
    <button on:click={loadExamples}>Load Examples</button>
  </div>
{:else}
  <div class="card">
    <h3>Input & Options</h3>
    <label>Input URL or local path</label>
  <input bind:value={input} placeholder={examples.youtube[0] || examples.local[0] || ''} style="inline-size:100%" />
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
      <ChordPalette {chords} on:paint={(e) => console.log('paint', e.detail)} />
      <RhythmPads tempo={scene.tempo || 120} pattern={(scene.drums && scene.drums.pattern) || 'x..x..x..x..'} />
      <div style="margin-block-start:.5rem">
        <button on:click={() => downloadScene()}>Export scene JSON</button>
      </div>
    {/if}
  </div>

  <script>
    async function downloadScene() {
      if (!scene) return
      const a = document.createElement('a')
      const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' })
      a.href = URL.createObjectURL(blob)
      a.download = (scene.title || 'scene') + '.json'
      a.click()
    }
    let chords = []
  </script>
{/if}
