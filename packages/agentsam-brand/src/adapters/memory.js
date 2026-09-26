export class MemoryStorageAdapter {
  constructor(store = new Map()) {
    this.store = store;
    this.kind = 'memory';
  }

  async put(key, buffer, meta = {}) {
    this.store.set(key, { buffer: Buffer.from(buffer), meta, updated_at: Date.now() });
    return { ok: true, key };
  }

  async get(key) {
    const row = this.store.get(key);
    if (!row) return null;
    return { key, buffer: row.buffer, meta: row.meta };
  }

  async head(key) {
    const row = this.store.get(key);
    if (!row) return { exists: false };
    return { exists: true, bytes: row.buffer.length, buffer: row.buffer, meta: row.meta };
  }

  async exists(key) {
    return this.store.has(key);
  }

  async list(prefix = '') {
    return [...this.store.keys()].filter((k) => k.startsWith(prefix));
  }
}
