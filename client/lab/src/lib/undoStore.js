export function createUndoStore(initial = null) {
  let past = []
  let present = initial
  let future = []

  return {
    get() { return present },
    push(state) {
      if (present !== null) past.push(JSON.parse(JSON.stringify(present)))
      present = JSON.parse(JSON.stringify(state))
      future = []
    },
    undo() {
      if (!past.length) return null
      future.unshift(JSON.parse(JSON.stringify(present)))
      present = past.pop()
      return present
    },
    redo() {
      if (!future.length) return null
      past.push(JSON.parse(JSON.stringify(present)))
      present = future.shift()
      return present
    },
    clear() { past = []; future = []; present = initial }
  }
}
