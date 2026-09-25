/**
 * Minimal repository/index freshness bridge.
 * Filesystem writes mark generation stale — do not re-index on every keystroke.
 */

/** @type {Map<string, { generation: number, stale_paths: Set<string>, updated_at: string }>} */
const roots = new Map();

/**
 * @param {string} root
 * @param {{ paths?: string[], reason?: string }} [opts]
 */
export function markRepositoryStale(root, opts = {}) {
  const key = String(root);
  const prev = roots.get(key) || {
    generation: 0,
    stale_paths: new Set(),
    updated_at: null,
  };
  const nextGen = prev.generation + 1;
  const stale_paths = new Set(prev.stale_paths);
  for (const p of opts.paths || []) stale_paths.add(String(p));
  const record = {
    generation: nextGen,
    stale_paths,
    updated_at: new Date().toISOString(),
    reason: opts.reason || 'filesystem_write',
  };
  roots.set(key, record);
  return {
    ok: true,
    schema: 'agentsam.repository-freshness.v1',
    root: key,
    generation: record.generation,
    stale_paths: [...stale_paths].slice(0, 200),
    updated_at: record.updated_at,
    reason: record.reason,
  };
}

/**
 * @param {string} root
 */
export function getRepositoryFreshness(root) {
  const key = String(root);
  const record = roots.get(key);
  if (!record) {
    return {
      ok: true,
      schema: 'agentsam.repository-freshness.v1',
      root: key,
      generation: 0,
      stale: false,
      stale_paths: [],
    };
  }
  return {
    ok: true,
    schema: 'agentsam.repository-freshness.v1',
    root: key,
    generation: record.generation,
    stale: record.stale_paths.size > 0 || record.generation > 0,
    stale_paths: [...record.stale_paths].slice(0, 200),
    updated_at: record.updated_at,
    reason: record.reason,
  };
}

/**
 * @param {string} root
 */
export function clearRepositoryFreshness(root) {
  roots.delete(String(root));
  return { ok: true };
}
