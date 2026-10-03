export class MemoryQueueAdapter {
  constructor() {
    this.queues = new Map();
  }

  #queue(name) {
    if (!this.queues.has(name)) this.queues.set(name, []);
    return this.queues.get(name);
  }

  async publish(queue, job) {
    this.#queue(queue).push(structuredClone(job));
    return { provider: 'memory', queue, accepted: 1 };
  }

  async publishBatch(queue, jobs) {
    this.#queue(queue).push(...jobs.map((job) => structuredClone(job)));
    return { provider: 'memory', queue, accepted: jobs.length };
  }

  async pull(queue, max = 1, { now = Math.floor(Date.now() / 1000) } = {}) {
    const items = this.#queue(queue);
    const limit = Math.max(0, Number(max) || 1);
    const ready = [];
    const pending = [];
    for (const item of items) {
      if (ready.length < limit && (item.available_at ?? 0) <= now) ready.push(item);
      else pending.push(item);
    }
    this.queues.set(queue, pending);
    return ready;
  }

  async ensureTopology(topology) {
    const names = new Set(Object.values(topology.routes || {}));
    for (const name of names) this.#queue(name);
    return {
      provider: 'memory',
      created: [...names],
      existing: [],
    };
  }

  depth(queue) {
    return this.#queue(queue).length;
  }
}
