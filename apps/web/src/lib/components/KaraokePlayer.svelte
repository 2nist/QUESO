<script lang="ts">
  export let src: string; // URL to arrangement JSON
  let data: any = null;
  let audioEl: HTMLAudioElement | null = null;
  let t = 0; // current time
  let rafId: number;

  async function load() {
    const res = await fetch(src);
    data = await res.json();
    if (audioEl && data?.song?.audio?.url) {
      audioEl.src = data.song.audio.url;
    }
    tick();
  }

  function tick(){
    if (audioEl) { t = audioEl.currentTime; }
    rafId = requestAnimationFrame(tick);
  }

  function current<T extends {start:number,end:number}>(arr: T[], time:number): T | null {
    if (!arr) return null;
    // naive linear scan (fine for small arrays); swap for binary search later
    for (const item of arr){ if (time >= item.start && time < item.end) return item; }
    return null;
  }

  function fmt(s:number){ const m=Math.floor(s/60); const ss=Math.floor(s%60).toString().padStart(2,'0'); return `${m}:${ss}`; }

  $: currentSection = current(data?.sections || [], t);
  $: currentChord = current(data?.chords?.events || [], t);
  $: currentLyric = current(data?.lyrics?.lines || [], t);

  load();
</script>

<style>
  .player { max-width: 900px; margin: 0 auto; padding: 1rem; }
  .rails { display: grid; grid-template-columns: 1fr; gap: 0.75rem; }
  .rail { padding: 0.5rem 0.75rem; border-radius: 12px; box-shadow: 0 1px 6px rgba(0,0,0,.08); }
  .label { font-size: 0.75rem; opacity: 0.7; }
  .value { font-size: 1.1rem; font-weight: 700; }
  .lyrics { font-size: 1.6rem; text-align: center; padding: 1rem; }
  .timeline { height: 8px; background: #eee; border-radius: 999px; overflow: hidden; }
  .progress { height: 100%; background: #999; width: 0%; }
  audio { width: 100%; margin-top: 0.5rem; }
</style>

<div class="player" data-testid="karaoke-player">
  <h2>{data?.song?.title || '—'} <small>by {data?.song?.artist || '—'}</small></h2>
  <div class="timeline">
    <div class="progress" style="width: { data ? (t / data.song.duration * 100) : 0 }%"></div>
  </div>
  <audio bind:this={audioEl} controls preload="metadata"></audio>

  <div class="rails">
    <div class="rail">
      <div class="label">Section</div>
      <div class="value">{currentSection ? `${currentSection.label} (${fmt(currentSection.start)}–${fmt(currentSection.end)})` : '—'}</div>
    </div>

    <div class="rail">
      <div class="label">Chord</div>
      <div class="value">{currentChord ? currentChord.label : '—'}</div>
    </div>

    <div class="rail lyrics">
      <div class="label">Lyrics</div>
      <div class="value">{currentLyric ? currentLyric.text : '—'}</div>
    </div>
  </div>
</div>
