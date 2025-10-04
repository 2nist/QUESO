
class Scheduler extends AudioWorkletProcessor {
  constructor(){
    super();
    this.queue = [];
    this.port.onmessage = (e) => {
      if (e.data?.type === 'arrivals') this.queue.push(...e.data.events||[]);
    };
  }
  process() { return true; }
}
registerProcessor('scheduler', Scheduler);
