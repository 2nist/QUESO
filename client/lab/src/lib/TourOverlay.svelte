<script>
  import { onMount, tick } from "svelte";
  export let steps = [];
  export let step = 0;
  export let onClose = () => {};
  export let onChange = (i) => {};

  let rect = null;
  let target = null;

  async function updateRect() {
    await tick();
    if (!steps[step]) {
      rect = null;
      return;
    }
    const sel = steps[step].selector;
    target = document.querySelector(sel);
    if (!target) {
      rect = null;
      return;
    }
    rect = target.getBoundingClientRect();
  }

  onMount(() => {
    updateRect();
    const ro = new ResizeObserver(updateRect);
    try {
      if (target) ro.observe(target);
    } catch (e) {}
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("resize", updateRect);
      ro.disconnect();
    };
  });

  $: if (steps && steps.length) updateRect();
</script>

{#if steps && steps[step]}
  <div style="position:fixed;inset:0;pointer-events:none;z-index:1200">
    {#if rect}
      <!-- highlight box -->
      <div
        style="position:absolute;inset-inline-start:{rect.x -
          8}px;inset-block-start:{rect.y - 8}px;inline-size:{rect.width +
          16}px;block-size:{rect.height +
          16}px;border-radius:8px;box-shadow:0 0 0 2px rgba(255,255,0,0.14),0 6px 24px rgba(0,0,0,0.6);pointer-events:none;border:2px solid rgba(255,215,0,0.9)"
      ></div>
      <!-- tooltip -->
      <div
        style="position:absolute;inset-inline-start:{Math.min(
          rect.x,
          window.innerWidth - 360,
        )}px;inset-block-start:{rect.y +
          rect.height +
          12}px;max-inline-size:340px;background:var(--card,#111);color:var(--text,#fff);padding:12px;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.6);pointer-events:auto"
      >
        <div style="font-weight:700;margin-block-end:.25rem">
          {steps[step].title}
        </div>
        <div style="font-size:.9rem;opacity:.9;margin-block-end:.5rem">
          {steps[step].body}
        </div>
        <div style="display:flex;gap:.5rem;justify-content:flex-end">
          <button
            class="btn"
            on:click={() => {
              if (step > 0) {
                step -= 1;
                onChange(step);
              }
            }}>Back</button
          >
          {#if step < steps.length - 1}
            <button
              class="btn"
              on:click={() => {
                step += 1;
                onChange(step);
              }}>Next</button
            >
          {:else}
            <button class="btn" on:click={() => onClose(false)}>Done</button>
          {/if}
        </div>
      </div>
    {:else}
      <!-- fallback centered panel if target missing -->
      <div
        style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:auto"
      >
        <div
          style="background:var(--card,#111);color:var(--text,#fff);padding:16px;border-radius:8px;max-inline-size:640px"
        >
          <div style="font-weight:700;margin-block-end:.25rem">
            {steps[step].title}
          </div>
          <div style="opacity:.9;margin-block-end:.5rem">
            {steps[step].body}
          </div>
          <div style="display:flex;gap:.5rem;justify-content:flex-end">
            <button
              class="btn"
              on:click={() => {
                if (step > 0) {
                  step -= 1;
                  onChange(step);
                }
              }}>Back</button
            >
            {#if step < steps.length - 1}
              <button
                class="btn"
                on:click={() => {
                  step += 1;
                  onChange(step);
                }}>Next</button
              >
            {:else}
              <button class="btn" on:click={() => onClose(false)}>Done</button>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
