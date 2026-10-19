/**
 * Application account authority for portable single-tenant deployments.
 *
 * Request/auth surfaces should pass an explicit account id when they have one.
 * Background/integration code may resolve the sole active account. If a
 * deployment ever has multiple active accounts, implicit resolution fails
 * closed instead of guessing.
 */

export async function resolveApplicationAccountId(env, explicitAccountId = null) {
  const explicit = String(explicitAccountId || "").trim();
  if (!env?.DB) return explicit || null;

  if (explicit) {
    const row = await env.DB.prepare(
      "SELECT id FROM accounts WHERE id = ? AND status = 'active' LIMIT 1",
    )
      .bind(explicit)
      .first();
    return row?.id ? String(row.id) : null;
  }

  const { results } = await env.DB.prepare(
    "SELECT id FROM accounts WHERE status = 'active' ORDER BY created_at ASC, id ASC LIMIT 2",
  ).all();

  const rows = results || [];
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new Error("application_account_ambiguous");
  }
  return String(rows[0].id);
}

let resolvedAccountId = null;

/**
 * Resolve the sole active account once per isolate. Throws when there is none or more than one, so
 * account-scoped code can never silently run against the wrong tenant.
 */
export async function initApplicationAccount(env) {
  if (resolvedAccountId) return resolvedAccountId;
  const id = await resolveApplicationAccountId(env);
  if (!id) throw new Error("application_account_missing");
  resolvedAccountId = id;
  return id;
}

/** Entry-point wrapper: logs instead of throwing, so health and setup routes still answer on an uninstalled deployment. */
export async function ensureApplicationAccount(env) {
  try {
    return await initApplicationAccount(env);
  } catch (error) {
    console.error("application_account_unresolved:", String((error && error.message) || error));
    return null;
  }
}

/** Synchronous accessor. Throws if the entry point has not resolved the account, never returns a guess. */
export function requireApplicationAccountId() {
  if (!resolvedAccountId) throw new Error("application_account_not_initialized");
  return resolvedAccountId;
}

/** Test hook: set or clear the resolved account. */
export function __setApplicationAccountId(id) {
  resolvedAccountId = id ? String(id) : null;
}
