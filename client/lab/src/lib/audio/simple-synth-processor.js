class SimpleSynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.voices = []
    this.sampleRate = sampleRate
    this.port.onmessage = (e) => {
      const d = e.data
      if (d && d.type === 'note') {
        // schedule voice with frequency, duration, velocity, startSamples
        const startSample = Math.round(d.start * this.sampleRate)
        const durSamples = Math.round((d.duration || 0.1) * this.sampleRate)
        const nowSample = this._globalSample || 0
        this.voices.push({ freq: d.freq, amp: (d.velocity || 1.0) * 0.2, start: nowSample + startSample, dur: durSamples, phase: 0 })
      }
    }
    this._globalSample = 0
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0]
    if (!out) return true
    const channel = out[0]
    const len = channel.length
    for (let i = 0; i < len; i++) {
      let sample = 0.0
      const t = this._globalSample + i
      // mix active voices
      for (let vi = this.voices.length - 1; vi >= 0; vi--) {
        const v = this.voices[vi]
        const rel = t - v.start
        if (rel < 0) continue
        if (rel >= v.dur) {
          this.voices.splice(vi, 1)
          continue
        }
        const phaseInc = 2 * Math.PI * v.freq / this.sampleRate
        v.phase += phaseInc
        // simple ADSR-ish envelope: quick attack, exponential decay
        const env = Math.exp(-3 * (rel / Math.max(1, v.dur)))
        sample += Math.sin(v.phase) * v.amp * env
      }
      for (let ch = 0; ch < out.length; ch++) out[ch][i] = sample
    }
    this._globalSample += len
    // cap voices array length
    if (this.voices.length > 128) this.voices.splice(0, this.voices.length - 128)
    return true
  }
}

registerProcessor('simple-synth-processor', SimpleSynthProcessor)
