import { openVaultRow, last4 as getLast4 } from "../crypto/aes-gcm.js";

function metadataOf(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "{}") : value || {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Resolve one active, account-owned provider credential from the canonical
 * user_secrets vault. Provider adapters do not query or decrypt vault rows
 * themselves; this package owns AAD, usage accounting and audit semantics.
 */
export async function resolveAccountCredential({
  env,
  db = env?.DB,
  accountId,
  provider,
  kind = "provider_key",
  secretName = null,
  actor = "agentsam:provider",
} = {}) {
  const owner = String(accountId || "").trim();
  const service = String(provider || "").trim().toLowerCase();
  const credentialKind = String(kind || "provider_key").trim();
  if (!owner || !service || !db?.prepare || !env) return null;

  const params = [owner, service, credentialKind];
  let nameClause = "";
  if (secretName != null && String(secretName).trim()) {
    nameClause = " AND secret_name = ?";
    params.push(String(secretName).trim());
  }
  const row = await db.prepare(
    `SELECT id, account_id, secret_name, service_name, secret_value_encrypted, metadata_json
     FROM user_secrets
     WHERE account_id = ? AND service_name = ? AND kind = ? AND is_active = 1${nameClause}
     ORDER BY updated_at DESC LIMIT 1`,
  ).bind(...params).first();
  if (!row?.id || row.account_id !== owner || row.service_name !== service) return null;

  const aad = `${row.account_id}:${row.service_name}:${row.secret_name}`;
  const opened = await openVaultRow(env, row, aad);
  const value = String(opened?.value || "").trim();
  if (!value) return null;

  const metadata = metadataOf(row.metadata_json);
  const hint = typeof metadata.last4 === "string" && metadata.last4
    ? metadata.last4 : getLast4(value);

  // A credential use is account-scoped and audited without recording plaintext.
  try {
    await db.prepare(
      `UPDATE user_secrets SET last_used_at = unixepoch(),
         usage_count = COALESCE(usage_count, 0) + 1
       WHERE id = ? AND account_id = ?`,
    ).bind(row.id, owner).run();
  } catch { /* Usage columns may be absent in older standalone schemas. */ }
  try {
    const auditActor = String(actor || "agentsam:provider").slice(0, 120);
    await db.prepare(
      `INSERT INTO secret_audit_log (
         id, secret_id, secret_source, tenant_id, account_id, user_id,
         event_type, triggered_by, previous_last4, new_last4, notes, created_at
       ) VALUES (?, ?, 'user_secrets', ?, ?, ?, 'decrypted_for_use', ?, NULL, ?, ?, unixepoch())`,
    ).bind(
      `saudit_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      row.id, owner, owner, owner, auditActor, hint, `provider:${service}`,
    ).run();
  } catch { /* Audit failures do not expose the key or block a valid provider call. */ }

  return Object.freeze({
    source: "vault",
    value,
    last4: hint,
    ref: String(row.id),
    provider: service,
    accountId: owner,
  });
}
