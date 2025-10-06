<script>
  import { createEventDispatcher } from "svelte";
  export let sections = [];
  export let selectedIndex = null;
  export let selectedRange = null;
  export let slug = null;
  const dispatch = createEventDispatcher();
  let saving = false;
  let error = null;

  function splitSection(idx) {
    const s = sections[idx];
    if (!s) return;
    const mid = (s.start + s.end) / 2;
    sections = [
      ...sections.slice(0, idx),
      { start: s.start, end: mid, label: s.label },
      { start: mid, end: s.end, label: s.label },
      ...sections.slice(idx + 1),
    ];
    dispatch("update", { sections });
  }
  function mergeSection(idx) {
    const a = sections[idx];
    const b = sections[idx + 1];
    if (!a || !b) return;
    sections = [
      ...sections.slice(0, idx),
      { start: a.start, end: b.end, label: a.label + " / " + b.label },
      ...sections.slice(idx + 2),
    ];
    dispatch("update", { sections });
  }
  function mergeRange(startIdx, endIdx) {
    if (startIdx == null || endIdx == null) return;
    if (startIdx < 0 || endIdx >= sections.length || startIdx >= endIdx) return;
    const before = sections.slice(0, startIdx);
    const a = sections[startIdx];
    const b = sections[endIdx];
    const merged = {
      start: a.start,
      end: b.end,
      label: (a.label || "") + " … " + (b.label || ""),
    };
    const after = sections.slice(endIdx + 1);
    sections = [...before, merged, ...after];
    dispatch("update", { sections });
  }
  function moveUp(idx) {
    if (idx <= 0) return;
    const copy = sections.slice();
    const [item] = copy.splice(idx, 1);
    copy.splice(idx - 1, 0, item);
    sections = copy;
    dispatch("update", { sections });
  }
  function moveDown(idx) {
    if (idx >= sections.length - 1) return;
    const copy = sections.slice();
    const [item] = copy.splice(idx, 1);
    copy.splice(idx + 1, 0, item);
    sections = copy;
    dispatch("update", { sections });
  }
  function rename(idx) {
    const s = sections[idx];
    const n = prompt("Rename section", s?.label || "");
    if (n != null) {
      sections = sections.map((x, i) => (i === idx ? { ...x, label: n } : x));
      dispatch("update", { sections });
    }
  }

  async function save() {
    if (!slug) return alert("no session slug");
    saving = true;
    error = null;
    try {
      const r = await fetch("/api/lab/sections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, sections }),
      });
      if (!r.ok) throw new Error("save failed");
      alert("Sections saved");
    } catch (e) {
      error = String(e);
    } finally {
      saving = false;
    }
  }
</script>

<div
  style="border:1px solid #222;padding:.5rem;border-radius:8px;background:#070707;color:#ddd"
>
  <div style="display:flex;align-items:center;justify-content:space-between">
    <h4 style="margin:.25rem 0">Sections</h4>
    <div>
      <button class="btn" on:click={save} disabled={saving}
        >{saving ? "Saving…" : "Save"}</button
      >
    </div>
  </div>
  {#if selectedIndex != null}
    <div style="color:#9f9;margin-top:.25rem">
      Selected: {selectedIndex + 1}
    </div>
  {/if}
  {#if selectedRange}
    <div style="color:#9f9;margin-top:.25rem">
      Range: {selectedRange.startIndex + 1} → {selectedRange.endIndex + 1}
    </div>
    <div style="margin-top:.5rem">
      <button
        class="btn"
        on:click={() =>
          mergeRange(selectedRange.startIndex, selectedRange.endIndex)}
        >Merge Range</button
      >
    </div>
  {/if}
  {#if error}
    <div style="color:#fbb;margin-top:.5rem">{error}</div>
  {/if}
  {#if !sections || sections.length === 0}
    <div style="color:#999;margin-top:.5rem">No sections yet</div>
  {/if}
  <ol style="margin-top:.5rem;padding-left:1.1rem">
    {#each sections as s, i}
      <li
        style="margin-bottom:.25rem;display:flex;gap:.5rem;align-items:center"
      >
        <div style="flex:1">
          <strong class={i === selectedIndex ? "selected" : ""}
            >{s.label || "Section " + (i + 1)}</strong
          >
          <div style="color:#aaa;font-size:.9rem">{s.start} → {s.end}</div>
        </div>
        <div style="display:flex;gap:.25rem">
          <button class="btn" on:click={() => splitSection(i)}>Split</button>
          <button class="btn" on:click={() => mergeSection(i)}>Merge</button>
          <button class="btn" on:click={() => moveUp(i)}>Up</button>
          <button class="btn" on:click={() => moveDown(i)}>Down</button>
          <button class="btn" on:click={() => rename(i)}>Rename</button>
        </div>
      </li>
    {/each}
  </ol>
</div>

<style>
  .btn {
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    background: #222;
    color: #fff;
    border: 1px solid #333;
  }
</style>
