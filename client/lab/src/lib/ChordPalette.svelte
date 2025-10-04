<script>
  import { createEventDispatcher } from "svelte";
  export let chords = [];
  const dispatch = createEventDispatcher();
  let selected = "";
  let filter = "";

  // expanded chord palette including extended and altered chords
  const PALETTE = [
    "C",
    "Cm",
    "C7",
    "Cmaj7",
    "C9",
    "C11",
    "C13",
    "Caug",
    "Cdim",
    "Csus2",
    "Csus4",
    "Cadd9",
    "D",
    "Dm",
    "D7",
    "Dm7",
    "D9",
    "Daug",
    "Ddim",
    "E",
    "Em",
    "E7",
    "Emaj7",
    "Eaug",
    "F",
    "Fm",
    "F7",
    "Fmaj7",
    "Fadd9",
    "G",
    "Gm",
    "G7",
    "Gmaj7",
    "G6",
    "A",
    "Am",
    "A7",
    "Am7",
    "A9",
    "B",
    "Bm",
    "B7",
    "Bdim",
  ];

  function pick(l) {
    selected = l;
    dispatch("select", { chord: l });
  }

  function applyAt(time) {
    if (!selected) return;
    dispatch("paint", { start: time, label: selected });
  }
</script>

<div class="search">
  <input placeholder="Filter chords" bind:value={filter} />
  <button
    on:click={() => {
      selected = "";
      dispatch("clear");
    }}>Clear</button
  >
</div>

<div class="palette" role="list">
  {#each PALETTE.filter((p) => !filter || p
        .toLowerCase()
        .includes(filter.toLowerCase())) as lab}
    <div
      role="listitem"
      class="badge {selected === lab ? 'selected' : ''}"
      on:click={() => pick(lab)}
      aria-pressed={selected === lab}
    >
      {lab}
    </div>
  {/each}
</div>

<!-- helper call site can invoke applyAt(time) programmatically -->

<style>
  .palette {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .badge {
    padding: 0.35rem 0.6rem;
    border-radius: 6px;
    background: #f3f4f6;
    cursor: pointer;
    border: 1px solid #e5e7eb;
  }
  .badge.selected {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
  .search {
    margin-block-end: 0.5rem;
  }
</style>
