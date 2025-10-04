<script>
  export let chords = [];
  export let onPaint = () => {};
  let selected = null;

  function pick(ch) {
    selected = ch;
  }

  function paintAt(t) {
    if (!selected) return;
    // emit an object describing a new chord placement
    const ev = new CustomEvent('paint', { detail: { start: t, label: selected } });
    dispatchEvent(ev);
  }
</script>

<style>
  .palette { display:flex; gap:0.5rem; flex-wrap:wrap }
  .badge { padding:.25rem .5rem; border-radius:6px; background:#eee; cursor:pointer }
  .badge.selected { outline:2px solid #333 }
</style>

<div class="palette">
  {#each ['C','Dm','Em','F','G','Am','Bb','E'] as lab}
    <div class="badge {selected===lab? 'selected':''}" on:click={() => pick(lab)}>{lab}</div>
  {/each}
</div>
