<script>
  export let tempo = 120;
  export let steps = 16; // total steps per pattern (allows odd values)
  export let lanes = [ { name: 'kick', pattern: 'x...x...x...x...' }, { name: 'snare', pattern: '....x.......x..' }, { name: 'hihat', pattern: 'x.x.x.x.x.x.x.x.' } ];
  let playing = false;
  let ctx = null;
  let intervalId = null;
  let currentStep = 0;

  function _ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  }

  function _tick(lane) {
    _ensure()
    // simple tone mapping per lane name
    const freq = lane === 'kick' ? 60 : lane === 'snare' ? 180 : 800
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = lane === 'hihat' ? 'triangle' : 'sine'
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
    osc.start()
    osc.stop(ctx.currentTime + 0.1)
  }

  function start() {
    if (playing) return
    playing = true
    currentStep = 0
    const beatSec = 60.0 / tempo
    const stepSec = (beatSec * 4.0) / steps
    intervalId = setInterval(() => {
      lanes.forEach(l => {
        const ch = l.pattern[currentStep % (l.pattern.length || steps)]
        if (ch === 'x' || ch === 'X') _tick(l.name)
      })
      currentStep = (currentStep + 1) % steps
    }, stepSec * 1000)
  }

  function stop() {
    if (!playing) return
    playing = false
    clearInterval(intervalId)
    intervalId = null
    currentStep = 0
  }

  function setLanePattern(idx, pat) {
    lanes[idx].pattern = pat
  }
</script>

<div>
  <div>Pattern: <code>{pattern}</code></div>
  <div style="margin-block-start:.5rem">
    <button on:click={start} disabled={playing}>Play</button>
    <button on:click={stop} disabled={!playing}>Stop</button>
  </div>
</div>
