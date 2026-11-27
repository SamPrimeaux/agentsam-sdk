import { createLocalSqliteDatabase } from '../local/sqlite.js';
import { applyRuntimeMigrations } from '../local/migrations.js';
import { runtimeDatabasePath } from '../local/runtime-store.js';
import { DatabaseAgentControlClient } from './database-client.js';
export { DatabaseAgentControlClient } from './database-client.js';

function clean(value) { return value == null ? '' : String(value).trim(); }

async function withLocalDb(cwd, fn) {
  const db = await createLocalSqliteDatabase(runtimeDatabasePath(cwd));
  try { await applyRuntimeMigrations(db); return await fn(db); } finally { db.close(); }
}

export class LocalAgentControlClient {
  constructor({ cwd = process.cwd() } = {}) {
    this.cwd = cwd;
    this.kind = 'local';
  }

  async #withClient(fn) {
    return withLocalDb(this.cwd, (database) =>
      fn(new DatabaseAgentControlClient({ database, kind: this.kind })));
  }

  getRun(id) { return this.#withClient((client) => client.getRun(id)); }
  start(input = {}) { return this.#withClient((client) => client.start(input)); }
  events(id, options = {}) { return this.#withClient((client) => client.events(id, options)); }
  timeout(id, input = {}) { return this.#withClient((client) => client.timeout(id, input)); }
  tree(id) { return this.#withClient((client) => client.tree(id)); }
  spawn(id, input = {}) { return this.#withClient((client) => client.spawn(id, input)); }
  cancel(id) { return this.#withClient((client) => client.cancel(id)); }
  receipt(id) { return this.#withClient((client) => client.receipt(id)); }
}

export class HttpAgentControlClient {
  constructor({ baseUrl, token = '', fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = clean(baseUrl).replace(/\/+$/, '');
    if (!this.baseUrl) throw new TypeError('Agent Control Plane base URL is required');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    this.token = clean(token); this.fetchImpl = fetchImpl; this.kind = 'http';
  }
  async request(path, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('accept', 'application/json');
    if (init.body != null) headers.set('content-type', 'application/json');
    if (this.token) headers.set('authorization', `Bearer ${this.token}`);
    const response = await this.fetchImpl(this.baseUrl + path, { ...init, headers });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(body?.error?.message || body?.message || `acp_http_${response.status}`);
      error.code = body?.error?.code || `acp_http_${response.status}`; error.status = response.status; throw error;
    }
    return body;
  }
  start(input = {}) {
    return this.request('/v1/runs', { method: 'POST', body: JSON.stringify(input) });
  }
  getRun(id) { return this.request(`/v1/runs/${encodeURIComponent(id)}`); }
  events(id, { after = -1, limit = 200 } = {}) {
    return this.request(`/v1/runs/${encodeURIComponent(id)}/events?after=${encodeURIComponent(after)}&limit=${encodeURIComponent(limit)}`);
  }
  tree(id) { return this.request(`/v1/runs/${encodeURIComponent(id)}/tree`); }
  spawn(id, input = {}) {
    return this.request(`/v1/runs/${encodeURIComponent(id)}/spawn`, { method: 'POST', body: JSON.stringify(input) });
  }
  cancel(id) { return this.request(`/v1/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }); }
  timeout(id, input = {}) {
    return this.request(`/v1/runs/${encodeURIComponent(id)}/timeout`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  receipt(id) { return this.request(`/v1/runs/${encodeURIComponent(id)}/receipt`); }
}

export function createAgentControlClient({
  cwd = process.cwd(),
  url = process.env.AGENTSAM_CONTROL_PLANE_URL || '',
  token = process.env.AGENTSAM_CONTROL_PLANE_TOKEN || process.env.AGENTSAM_API_KEY || '',
  local = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (local) return new LocalAgentControlClient({ cwd });
  if (clean(url)) return new HttpAgentControlClient({ baseUrl: url, token, fetchImpl });
  const error = new Error(
    'agentsam_control_plane_url_required: set AGENTSAM_CONTROL_PLANE_URL or pass --local for an explicit development database',
  );
  error.code = 'agentsam_control_plane_url_required';
  throw error;
}
