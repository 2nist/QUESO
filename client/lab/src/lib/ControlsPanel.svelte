<script>
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();
  export let opts = {
    sections: true,
    chords: true,
    tempo: true,
    lyrics: true,
    drums: true,
  };
  let cpuMode = "auto";

  function toggle(k) {
    opts[k] = !opts[k];
    dispatch("change", { opts });
  }

  function changeCpu(m) {
    cpuMode = m;
    dispatch("cpumode", { cpuMode });
  }
</script>

<div style="display:flex;gap:1rem;flex-wrap:wrap">
  <div>
    <label
      ><input
        type="checkbox"
        checked={opts.sections}
        on:change={() => toggle("sections")}
      /> Sections</label
    >
    <label
      ><input
        type="checkbox"
        checked={opts.chords}
        on:change={() => toggle("chords")}
      /> Chords</label
    >
    <label
      ><input
        type="checkbox"
        checked={opts.tempo}
        on:change={() => toggle("tempo")}
      /> Tempo</label
    >
    <label
      ><input
        type="checkbox"
        checked={opts.lyrics}
        on:change={() => toggle("lyrics")}
      /> Lyrics</label
    >
    <label
      ><input
        type="checkbox"
        checked={opts.drums}
        on:change={() => toggle("drums")}
      /> Drums</label
    >
  </div>
  <div>
    <label
      >CPU Mode
      <select bind:value={cpuMode} on:change={(e) => changeCpu(e.target.value)}>
        <option value="auto">Auto</option>
        <option value="cpu">CPU</option>
        <option value="gpu">GPU</option>
      </select>
    </label>
  </div>
</div>
