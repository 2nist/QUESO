<script>
  import { onMount, createEventDispatcher } from 'svelte'
  import { getMidiOutputs, sendNoteOn, sendNoteOff } from './webmidi.js'

  export let tempo = 120;
  export let steps = 16; // total steps per pattern (allows odd values)
  export let lanes = [
    { name: 'kick', pattern: 'x...x...x...x...' },
    { name: 'snare', pattern: '....x.......x..' },
    { name: 'hihat', pattern: 'x.x.x.x.x.x.x.x.' }
  ];
  const dispatch = createEventDispatcher()
  let playing = false
  let ctx = null
  let schedulerTimer = null
  let currentStep = 0
  let lookahead = 0.1
  let scheduleAheadTime = 0.2
  let nextNoteTime = 0
  let selectedMidi = null
  let midiOutputs = []
  let selectedMidiId = null
  let synthNode = null

  function _ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  }

  function _playNoteForLane(lane, time) {
    _ensure()
    const freq = lane === 'kick' ? 60 : lane === 'snare' ? 180 : 800
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = lane === 'hihat' ? 'triangle' : 'sine'
    osc.frequency.setValueAtTime(freq, time)
    gain.gain.setValueAtTime(0.0, time)
    gain.gain.linearRampToValueAtTime(0.2, time + 0.001)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08)
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  function start() {
    if (playing) return;
    playing = true;
    currentStep = 0;
    const beatSec = 60.0 / tempo
    const stepSec = (beatSec * 4.0) / steps
    _ensure()
    nextNoteTime = ctx.currentTime
    // scheduler loop
    playing = true
    schedulerLoop()

    async function schedulerLoop() {
      while (playing) {
        const now = ctx.currentTime
        while (nextNoteTime < now + scheduleAheadTime) {
          lanes.forEach((l, idx) => {
            const pat = l.pattern || ''
            const ch = pat.charAt(currentStep % (pat.length || steps))
            if (ch === 'x' || ch === 'X') {
                    // schedule via AudioWorklet when available
                    if (synthNode && synthNode.port) {
                      const freq = l.freq || (l.name === 'kick' ? 60 : l.name === 'snare' ? 180 : 800)
                      const rel = Math.max(0, nextNoteTime - ctx.currentTime)
                      try { synthNode.port.postMessage({ type: 'note', freq, start: rel, duration: 0.12, velocity: 1.0 }) } catch (e) {}
                    } else {
                      _playNoteForLane(l.name, nextNoteTime)
                    }
              // optional MIDI output
                    if (selectedMidi) {
                      try {
                        const midiNote = (l.midiNote != null) ? l.midiNote : (60 + idx * 12)
                        sendNoteOn(selectedMidi, midiNote, 100)
                        setTimeout(() => sendNoteOff(selectedMidi, midiNote), 100)
                      } catch (e) {
                        // ignore midi errors
                      }
                    }
              dispatch('step', { lane: l.name, step: currentStep, time: nextNoteTime })
            }
          })
          nextNoteTime += stepSec
          currentStep = (currentStep + 1) % steps
        }
        await new Promise((r) => setTimeout(r, lookahead * 1000))
      }
    }
  }

  function stop() {
    if (!playing) return
    playing = false
    currentStep = 0
  }

  function setLanePattern(idx, pat) {
    lanes[idx].pattern = pat;
    // persist lane config
    try { localStorage.setItem('lab.lanesConfig', JSON.stringify(lanes)) } catch (e) {}
  }

  onMount(async () => {
    midiOutputs = await getMidiOutputs()
    // load selected midi id from storage
    try { selectedMidiId = localStorage.getItem('lab.selectedMidiId') } catch (e) { selectedMidiId = null }
    if (selectedMidiId) {
      selectedMidi = midiOutputs.find(m => m.id === selectedMidiId) || null
    }
    if (!selectedMidi && midiOutputs.length) {
      selectedMidi = midiOutputs[0]
      selectedMidiId = selectedMidi.id
    }
    // load lanes config
    try {
      const raw = localStorage.getItem('lab.lanesConfig')
      if (raw) {
        const saved = JSON.parse(raw)
        lanes = lanes.map(l => {
          const s = saved.find(x => x.name === l.name)
          return s ? { ...l, ...s } : l
        })
      }
    } catch (e) {}

    // attempt to register AudioWorklet
    try {
      _ensure()
      await ctx.audioWorklet.addModule('/src/lib/audio/simple-synth-processor.js')
      synthNode = new AudioWorkletNode(ctx, 'simple-synth-processor')
      synthNode.connect(ctx.destination)
    } catch (e) {
      // fallback to oscillator scheduler if worklet unavailable
      synthNode = null
    }
  })
</script>

<div>
  <div>
    <div style="display:flex;gap:.5rem;align-items:center">
      <button on:click={start} disabled={playing}>Play</button>
      <button on:click={stop} disabled={!playing}>Stop</button>
      <label style="margin-inline-start:1rem">MIDI Output:
        <select bind:value={selectedMidiId} on:change={() => {
            selectedMidi = midiOutputs.find(m => m.id === selectedMidiId) || null
            try { localStorage.setItem('lab.selectedMidiId', selectedMidiId) } catch(e){}
          }}>
          <option value=''>(none)</option>
          {#each midiOutputs as m}
            <option value={m.id}>{m.name}</option>
          {/each}
        </select>
      </label>
    </div>
    <div style="margin-block-start:.5rem">
      {#each lanes as lane, idx}
        <div style="margin-block-end:.25rem">
          <strong>{lane.name}</strong>
          <input value={lane.pattern} on:input={(e)=> setLanePattern(idx, e.target.value)} style="inline-size:60%" />
          <label style="margin-inline-start:.5rem">MIDI note:
            <input type="number" value={lane.midiNote || ''} on:input={(e) => { lanes[idx].midiNote = parseInt(e.target.value); localStorage.setItem('lab.lanesConfig', JSON.stringify(lanes)) }} style="inline-size:4rem" />
          </label>
        </div>
      {/each}
    </div>
  </div>
</div>
