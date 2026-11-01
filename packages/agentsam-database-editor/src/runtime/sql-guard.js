function clean(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * Classify SQL for write/destructive confirmation gates.
 * @param {string} sql
 */
export function sqlKind(sql) {
  const normalized = clean(sql)
    .replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/g, '')
    .trim();
  const first = normalized.split(/\s+/, 1)[0]?.toLowerCase() || '';
  const mutationVerb =
    /\b(insert|update|delete|replace|merge|upsert|create|alter|drop|truncate|vacuum|reindex|attach|detach|grant|revoke)\b/i.test(
      normalized,
    );
  const destructive =
    /\b(drop|truncate|alter|vacuum|reindex|attach|detach|grant|revoke)\b/i.test(
      normalized,
    );
  const read =
    !mutationVerb &&
    ['select', 'pragma', 'with', 'explain', 'show'].includes(first);
  const mutating = !read;
  return { first, read, mutating, destructive };
}

/**
 * Enforce writable + studio approval gates for mutating / destructive SQL.
 * @param {{ writable?: boolean }} source
 * @param {string} sql
 * @param {{ studio_approved?: boolean, destructive_confirmed?: boolean }} [body]
 */
export function assertSqlAllowed(source, sql, body = {}) {
  const kind = sqlKind(sql);
  if (!kind.first) {
    const error = new Error('sql_required');
    error.status = 400;
    throw error;
  }
  if (kind.mutating && source?.writable === false) {
    const error = new Error('database_read_only');
    error.status = 403;
    throw error;
  }
  if (kind.mutating && body.studio_approved !== true) {
    const error = new Error('database_write_requires_approval');
    error.status = 409;
    error.requiresApproval = true;
    throw error;
  }
  if (kind.destructive && body.destructive_confirmed !== true) {
    const error = new Error('destructive_sql_requires_confirmation');
    error.status = 409;
    error.requiresDestructiveConfirmation = true;
    throw error;
  }
  return kind;
}
