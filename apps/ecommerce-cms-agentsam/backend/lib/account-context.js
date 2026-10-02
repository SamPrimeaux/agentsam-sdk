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
