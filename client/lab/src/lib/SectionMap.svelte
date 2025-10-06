<script>
  import { createEventDispatcher } from "svelte";
  export let sections = [];
  export let selectedIndex = null;
  export let duration = 60;
  export let chords = [];
  const dispatch = createEventDispatcher();

  function clickToTime(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = Math.max(0, Math.min(1, x / rect.width));
    const t = frac * duration;
    dispatch("place", { time: t });
  }

  // selection helpers
  let isDragging = false;
  let dragStartTime = null;
  let dragEndTime = null;
  function timeToIndex(t) {
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (t >= s.start && t < s.end) return i;
    }
    return -1;
  }
  function onPointerDown(e) {
    isDragging = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = Math.max(0, Math.min(1, x / rect.width)) * duration;
    dragStartTime = t;
    dragEndTime = t;
  }
  function onPointerMove(e) {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = Math.max(0, Math.min(1, x / rect.width)) * duration;
    dragEndTime = t;
  }
  function onPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;
    const a = Math.min(dragStartTime, dragEndTime);
    const b = Math.max(dragStartTime, dragEndTime);
    const si = timeToIndex(a);
    const ei = timeToIndex(b);
    if (si >= 0 && ei >= 0)
      dispatch("selectRange", {
        startIndex: Math.min(si, ei),
        endIndex: Math.max(si, ei),
      });
    dragStartTime = dragEndTime = null;
  }
</script>

<div
  class="map"
  on:click={clickToTime}
  on:pointerdown={onPointerDown}
  on:pointermove={onPointerMove}
  on:pointerup={onPointerUp}
  role="region"
  aria-label="Section map"
>
  {#each sections as s, idx}
    <div
      class="section {idx === selectedIndex ? 'selected' : ''}"
      role="button"
      tabindex="0"
      on:click={() => dispatch("select", { index: idx })}
      on:keydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          dispatch("select", { index: idx });
          e.preventDefault();
        }
      }}
      style="inline-size: {Math.max(
        40,
        ((s.end - s.start) / Math.max(1, duration)) * 800,
      )}px"
    >
      <div><strong>{s.label}</strong></div>
      <div>
        {#each chords.filter((c) => c.start >= s.start && c.start < s.end) as c}
          <span class="chord-badge">{c.label}</span>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .map {
    display: flex;
    gap: 4px;
    border: 1px solid #ddd;
    padding: 8px;
  }
  .section {
    background: #f8fafc;
    padding: 8px;
    border-radius: 6px;
    flex: 0 0 auto;
  }
  .section.selected {
    outline: 2px solid #7fd07f;
  }
  .chord-badge {
    display: inline-block;
    padding: 0.2rem 0.4rem;
    background: #eef2ff;
    margin: 0.1rem;
    border-radius: 4px;
  }
</style>
