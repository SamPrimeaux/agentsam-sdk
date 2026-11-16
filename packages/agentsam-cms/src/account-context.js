import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Scoped to the current authenticated request, never an isolate-global mutable
 * current tenant. Standalone installs validate accounts here; hosted Local
 * Studio supplies an already-authenticated account/site context.
 */
const requestAccountScope = new AsyncLocalStorage();

/**
 * Enter an authenticated tenant scope after verifying that the selected account
 * is active. Call only after resolving the session server-side.
 */
export async function withApplicationAccount(env, accountId, work) {
  if (typeof work !== "function") throw new TypeError("application_account_work_required");
  const current = requestAccountScope.getStore() || {};
  if (current.authority === 'local-studio') {
    const requested = String(accountId || current.accountId || '').trim();
    if (!current.accountId || requested !== String(current.accountId)) {
      throw new Error('application_account_scope_mismatch');
    }
    // Local Studio already authenticated the actor and authorized this site.
    // Do not revalidate tenant ownership against a second CMS accounts table.
    return requestAccountScope.run({ ...current, accountId: String(current.accountId) }, work);
  }
  const id = await resolveApplicationAccountId(env, accountId);
  if (!id) throw new Error("application_account_not_configured");
  return requestAccountScope.run({ ...current, accountId: id }, work);
}

/**
 * Enter a request context whose account and site were already authorized by
 * Local Studio. This is a context carrier, not an authentication mechanism.
 * Only the trusted Local Studio Worker should call it.
 */
export function withLocalStudioCmsContext(accountId, site, work, actorUserId = accountId) {
  const account = String(accountId || '').trim();
  if (!account) throw new Error('local_studio_cms_account_required');
  if (typeof work !== 'function') throw new TypeError('application_account_work_required');
  if (site && (!site.id || String(site.account_id || '') !== account)) {
    throw new Error('local_studio_cms_site_account_mismatch');
  }
  return requestAccountScope.run({
    accountId: account,
    authority: 'local-studio',
    actorUserId: String(actorUserId || account),
    site: site ? { ...site } : null,
  }, work);
}

export function getApplicationAccountContext() {
  return requestAccountScope.getStore() || null;
}

/**
 * Application account authority for portable single-tenant deployments.
 *
 * Request/auth surfaces should pass an explicit account id when they have one.
 * Background/integration code may resolve the sole active account. If a
 * deployment ever has multiple active accounts, implicit resolution fails
 * closed instead of guessing.
 */

export async function resolveApplicationAccountId(env, explicitAccountId = null) {
  const scoped = requestAccountScope.getStore()?.accountId || null;
  const supplied = String(explicitAccountId || "").trim();
  // A downstream helper may not switch tenants inside an authenticated request.
  if (scoped && supplied && supplied !== scoped) {
    throw new Error("application_account_scope_mismatch");
  }
  // The request's account was already checked against the active accounts table
  // when the request scope was established. Never re-run sole-account discovery.
  if (scoped) return scoped;
  const explicit = supplied;
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
  const scoped = requestAccountScope.getStore()?.accountId;
  if (scoped) return scoped;
  // Compatibility for standalone single-account bootstraps and existing CLI
  // callers. Hosted requests must use withApplicationAccount instead.
  if (!resolvedAccountId) throw new Error("application_account_not_initialized");
  return resolvedAccountId;
}

/** Test hook: set or clear the resolved account. */
export function __setApplicationAccountId(id) {
  resolvedAccountId = id ? String(id) : null;
}
