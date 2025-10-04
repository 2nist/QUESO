export async function getMidiOutputs() {
  if (!navigator.requestMIDIAccess) return []
  try {
    const access = await navigator.requestMIDIAccess()
    const outs = []
    for (const out of access.outputs.values()) outs.push(out)
    return outs
  } catch (e) {
    return []
  }
}

export function sendNoteOn(output, note = 60, velocity = 100, channel = 0) {
  if (!output) return
  const status = 0x90 | (channel & 0x0f)
  output.send([status, note & 0x7f, velocity & 0x7f])
}

export function sendNoteOff(output, note = 60, channel = 0) {
  if (!output) return
  const status = 0x80 | (channel & 0x0f)
  output.send([status, note & 0x7f, 0x40])
}
