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

  async pull(queue, max = 1) {
    return this.#queue(queue).splice(0, Math.max(0, Number(max) || 1));
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
