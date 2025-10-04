<script>
  export let tempo = 120;
  export let pattern = 'x..x..x..x..';
  let playing = false;
  let ctx = null;
  let intervalId = null;

  function _ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  }

  function _tick() {
    _ensure()
    // simple beep for each step
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 120
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.001)
    gain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.08)
    osc.start()
    osc.stop(ctx.currentTime + 0.1)
  }

  function start() {
    if (playing) return
    playing = true
    const beatSec = 60.0 / tempo
    const stepSec = beatSec / 4.0
    let idx = 0
    intervalId = setInterval(() => {
      if (pattern[idx % pattern.length] === 'x') _tick()
      idx += 1
    }, stepSec * 1000)
  }

  function stop() {
    if (!playing) return
    playing = false
    clearInterval(intervalId)
    intervalId = null
  }
</script>

<div>
  <div>Pattern: <code>{pattern}</code></div>
  <div style="margin-block-start:.5rem">
    <button on:click={start} disabled={playing}>Play</button>
    <button on:click={stop} disabled={!playing}>Stop</button>
  </div>
</div>
