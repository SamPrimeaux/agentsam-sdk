import { createPostgresAdapter } from './postgres.js';

/**
 * Supabase is Postgres. The host provides a query function backed by a
 * Supabase database connection, pool, or Hyperdrive. Auth stays host-owned.
 */
export function createSupabaseAdapter(options = {}) {
  return createPostgresAdapter({
    ...options,
    provider: 'supabase-postgres',
    label: options.label || 'Supabase Postgres',
  });
}
