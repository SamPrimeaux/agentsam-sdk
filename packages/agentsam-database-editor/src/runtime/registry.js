/**
 * Provider registry — compose a DatabaseAdapter from a connection descriptor
 * or factory options. Hosts inject credentials / query functions; this package
 * never stores secrets.
 */

import { withHonestCapabilities } from './capabilities.js';

/**
 * @typedef {'sqlite'|'d1'|'d1-binding'|'postgres'|'supabase'|'hyperdrive'} AdapterKind
 */

/** @type {Map<string, Function>} */
const factories = new Map();

/**
 * Register or replace an adapter factory.
 * @param {string} kind
 * @param {(options: object) => import('../contracts/adapter.js').DatabaseAdapter} factory
 */
export function registerAdapterFactory(kind, factory) {
  const key = String(kind || '').trim().toLowerCase();
  if (!key) throw new Error('adapter_kind_required');
  if (typeof factory !== 'function') throw new Error('adapter_factory_required');
  factories.set(key, factory);
  return key;
}

export function listRegisteredAdapterKinds() {
  return [...factories.keys()].sort();
}

/**
 * Lazy-load built-in factories so Worker graphs can import registry without
 * pulling Node-only sqlite, and Node can still resolve everything.
 */
async function ensureBuiltins() {
  if (factories.size > 0) return;
  const [{ createD1Adapter, createD1BindingAdapter }, { createPostgresAdapter, createHyperdriveAdapter }, { createSupabaseAdapter }] =
    await Promise.all([
      import('../adapters/d1.js'),
      import('../adapters/postgres.js'),
      import('../adapters/supabase.js'),
    ]);
  registerAdapterFactory('d1', createD1Adapter);
  registerAdapterFactory('cloudflare-d1', createD1Adapter);
  registerAdapterFactory('d1-binding', createD1BindingAdapter);
  registerAdapterFactory('cloudflare-d1-binding', createD1BindingAdapter);
  registerAdapterFactory('postgres', createPostgresAdapter);
  registerAdapterFactory('supabase', createSupabaseAdapter);
  registerAdapterFactory('supabase-postgres', createSupabaseAdapter);
  registerAdapterFactory('hyperdrive', createHyperdriveAdapter);
  registerAdapterFactory('hyperdrive-postgres', createHyperdriveAdapter);
}

/**
 * Optionally register Node SQLite (call from Node hosts / backend/sqlite).
 * @param {(options: object) => import('../contracts/adapter.js').DatabaseAdapter} createSqliteAdapter
 */
export function registerSqliteAdapterFactory(createSqliteAdapter) {
  registerAdapterFactory('sqlite', createSqliteAdapter);
  registerAdapterFactory('local', createSqliteAdapter);
  registerAdapterFactory('local-sqlite', createSqliteAdapter);
}

/**
 * Create an adapter from a kind + options, always with honest capabilities.
 *
 * @param {string} kind
 * @param {object} [options]
 */
export async function createAdapter(kind, options = {}) {
  await ensureBuiltins();
  const key = String(kind || '').trim().toLowerCase();
  const factory = factories.get(key);
  if (!factory) {
    const error = new Error(`adapter_kind_unknown:${key}`);
    error.code = 'adapter_kind_unknown';
    throw error;
  }
  return withHonestCapabilities(factory(options));
}

/**
 * Resolve adapter from a DatabaseConnection-style record.
 * Host must supply runtime deps (token, query fn, db binding, path) in `runtime`.
 *
 * @param {import('../contracts/connection.js').DatabaseConnection | object} connection
 * @param {{
 *   token?: string,
 *   query?: Function,
 *   db?: object,
 *   path?: string,
 *   writable?: boolean,
 *   fetchImpl?: typeof fetch,
 * }} [runtime]
 */
export async function createAdapterFromConnection(connection, runtime = {}) {
  if (!connection || typeof connection !== 'object') {
    throw new Error('connection_required');
  }
  const provider = String(connection.provider || '').toLowerCase();
  const engine = String(connection.engine || '').toLowerCase();
  const id = connection.id;
  const label = connection.label;
  const writable = runtime.writable !== false;

  if (provider === 'local' || engine === 'sqlite' && (provider === 'local' || !provider)) {
    const path = runtime.path || connection.connection?.path;
    return createAdapter('sqlite', {
      path,
      id,
      readOnly: !writable,
      managedWal: Boolean(runtime.managedWal),
    });
  }

  if (provider === 'cloudflare-d1' || provider === 'cloudflare-d1-remote') {
    return createAdapter('d1', {
      id,
      label,
      token: runtime.token,
      accountId: runtime.accountId || connection.connection?.accountRef || connection.account_id,
      databaseId: connection.connection?.databaseId || connection.database_id,
      writable,
      fetchImpl: runtime.fetchImpl,
    });
  }

  if (provider === 'cloudflare-d1-binding' || connection.connection?.binding) {
    return createAdapter('d1-binding', {
      id,
      label,
      db: runtime.db,
      writable,
    });
  }

  if (provider === 'supabase' || provider === 'supabase-postgres') {
    return createAdapter('supabase', {
      id,
      label,
      query: runtime.query,
      writable,
      defaultSchema: runtime.defaultSchema,
    });
  }

  if (
    provider === 'hyperdrive-postgres' ||
    connection.accelerator?.driver === 'hyperdrive'
  ) {
    return createAdapter('hyperdrive', {
      id,
      label,
      query: runtime.query,
      writable,
      defaultSchema: runtime.defaultSchema,
    });
  }

  if (provider === 'postgres' || engine === 'postgres') {
    return createAdapter('postgres', {
      id,
      label,
      query: runtime.query,
      writable,
      defaultSchema: runtime.defaultSchema,
    });
  }

  const error = new Error(`connection_provider_unsupported:${provider || engine}`);
  error.code = 'connection_provider_unsupported';
  throw error;
}
