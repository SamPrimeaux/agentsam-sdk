export class JobDispatcher {
  #handlers = new Map();

  register(kind, handler) {
    if (!kind || typeof handler !== 'function') {
      throw new TypeError('register(kind, handler) requires a kind and function');
    }
    this.#handlers.set(kind, handler);
    return this;
  }

  unregister(kind) {
    return this.#handlers.delete(kind);
  }

  resolve(kind) {
    if (this.#handlers.has(kind)) return this.#handlers.get(kind);

    let best = null;
    for (const [registered, handler] of this.#handlers.entries()) {
      if (!registered.endsWith('*')) continue;
      const prefix = registered.slice(0, -1);
      if (kind.startsWith(prefix) && (!best || prefix.length > best.prefix.length)) {
        best = { prefix, handler };
      }
    }
    return best?.handler ?? null;
  }

  async dispatch(job, context = {}) {
    const handler = this.resolve(job.kind);
    if (!handler) {
      const error = new Error(`job_handler_not_found:${job.kind}`);
      error.code = 'job_handler_not_found';
      throw error;
    }
    return handler(job, context);
  }

  kinds() {
    return [...this.#handlers.keys()];
  }
}
