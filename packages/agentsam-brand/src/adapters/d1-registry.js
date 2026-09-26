/** Optional D1 registry adapter — not required for plan/derive. */
export class D1BrandRegistryAdapter {
  constructor({ execute } = {}) {
    this.kind = 'd1';
    this.execute = execute; // async (sql) => ...
  }

  async register(row = {}) {
    if (!this.execute) return { ok: false, skipped: true, reason: 'no_execute' };
    // Caller supplies SQL dialect / schema — keep generic metadata insert hook
    return this.execute({
      op: 'register',
      ...row,
    });
  }

  async find(query = {}) {
    if (!this.execute) return null;
    return this.execute({ op: 'find', ...query });
  }

  async list(query = {}) {
    if (!this.execute) return [];
    return this.execute({ op: 'list', ...query });
  }
}
