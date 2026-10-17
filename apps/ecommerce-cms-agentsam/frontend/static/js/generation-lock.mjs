export function createGenerationLock() {
  const inflight = new Set();
  return {
    start(id) {
      inflight.add(String(id));
      return inflight.size;
    },
    finish(id) {
      inflight.delete(String(id));
      return inflight.size;
    },
    locked() {
      return inflight.size > 0;
    },
    ids() {
      return Array.from(inflight);
    },
    async run(id, fn) {
      this.start(id);
      try {
        return await fn();
      } finally {
        this.finish(id);
      }
    },
  };
}
