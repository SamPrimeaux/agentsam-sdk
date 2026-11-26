/**
 * Column capability probe shared by identity adapters.
 *
 * Hosted and older scaffolded databases do not all carry the same optional
 * audit columns. Adapters ask the database instead of assuming, so a writer
 * can record richer evidence where the column exists and still work where it
 * does not. Only positive answers are cached: a migration applied later in
 * the same process is picked up on the next call.
 */
const present = new WeakMap();

export async function hasColumn(db, table, column) {
  let known = present.get(db);
  if (!known) {
    known = new Set();
    present.set(db, known);
  }
  const key = `${table}.${column}`;
  if (known.has(key)) return true;
  try {
    const row = await db
      .prepare('SELECT 1 AS present FROM pragma_table_info(?) WHERE name = ? LIMIT 1')
      .bind(table, column)
      .first();
    if (row) {
      known.add(key);
      return true;
    }
  } catch {
    /* probe is advisory; absence just means the writer skips the optional column */
  }
  return false;
}

/** Bounded, single-line audit reason so callers cannot write arbitrary blobs. */
export function normalizeRevokeReason(reason) {
  const text = String(reason ?? '').trim().replace(/\s+/g, '_').toLowerCase();
  return (text || 'logout').slice(0, 64);
}
