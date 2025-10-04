<script>
  import { createEventDispatcher } from 'svelte'
  export let sections = []
  export let duration = 60
  export let chords = []
  const dispatch = createEventDispatcher()

  function clickToTime(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const frac = Math.max(0, Math.min(1, x / rect.width))
    const t = frac * duration
    dispatch('place', { time: t })
  }
</script>

<style>
  .map { display:flex; gap:4px; border:1px solid #ddd; padding:8px }
  .section { background:#f8fafc; padding:8px; border-radius:6px; flex:0 0 auto }
  .chord-badge { display:inline-block; padding:.2rem .4rem; background:#eef2ff; margin:.1rem; border-radius:4px }
</style>

<div class="map" on:click={clickToTime} role="region" aria-label="Section map">
  {#each sections as s}
  <div class="section" style="inline-size: {Math.max(40, (s.end - s.start) / Math.max(1,duration) * 800)}px">
      <div><strong>{s.label}</strong></div>
      <div>
        {#each chords.filter(c => c.start >= s.start && c.start < s.end) as c}
          <span class="chord-badge">{c.label}</span>
        {/each}
      </div>
    </div>
  {/each}
</div>
