/**
 * Account-owned Browser trust for Settings → Browser & Network.
 * Identity is auth_users.id (au_*) = agentsam_browser_trusted_origin.account_id.
 * Embedding rules (agentsam_browser_embed_policy) are platform-wide and read-only here.
 */
const SCOPES = new Set(["persistent", "session", "debug"]);
const need = (db, accountId) => {
  if (!db?.prepare || !accountId) throw new Error("browser_trust_context_missing");
};

/** Trust is granted to a web origin, never to a path, credential or non-web scheme. */
export function normalizeTrustOrigin(input) {
  const raw = String(input ?? "").trim();
  let parsed;
  try { parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`); }
  catch { throw new Error("trust_origin_invalid"); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname.includes("."))
    throw new Error("trust_origin_invalid");
  return parsed.origin;
}

export async function listTrustedOrigins(db, accountId) {
  need(db, accountId);
  const { results } = await db.prepare(
    "SELECT origin, trust_scope, created_at FROM agentsam_browser_trusted_origin WHERE account_id = ? ORDER BY origin"
  ).bind(accountId).all();
  return (results || []).map(row => ({ origin: row.origin, trust_scope: row.trust_scope, created_at: row.created_at }));
}

export async function listEmbedPolicy(db) {
  if (!db?.prepare) throw new Error("browser_trust_context_missing");
  const { results } = await db.prepare(
    "SELECT host_suffix, embed_mode FROM agentsam_browser_embed_policy ORDER BY host_suffix"
  ).bind().all();
  return (results || []).map(row => ({ host_suffix: row.host_suffix, embed_mode: row.embed_mode }));
}

export async function trustOrigin(db, accountId, { origin, trust_scope = "persistent" } = {}) {
  need(db, accountId);
  if (!SCOPES.has(trust_scope)) throw new Error("trust_scope_invalid");
  const normalized = normalizeTrustOrigin(origin);
  await db.prepare(
    "INSERT INTO agentsam_browser_trusted_origin (account_id, origin, trust_scope) VALUES (?, ?, ?) " +
    "ON CONFLICT(account_id, origin) DO UPDATE SET trust_scope = excluded.trust_scope, updated_at = datetime('now')"
  ).bind(accountId, normalized, trust_scope).run();
  return { origin: normalized, trust_scope };
}

export async function untrustOrigin(db, accountId, origin) {
  need(db, accountId);
  const normalized = normalizeTrustOrigin(origin);
  const res = await db.prepare(
    "DELETE FROM agentsam_browser_trusted_origin WHERE account_id = ? AND origin = ?"
  ).bind(accountId, normalized).run();
  return { origin: normalized, removed: (res?.meta?.changes || 0) > 0 };
}
