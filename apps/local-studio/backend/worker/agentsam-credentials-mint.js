/**
 * Mint AgentSam account (aak_*) and service (brk_*) credentials.
 * Hash-only at rest in agentsam_api_credentials; plaintext returned once.
 * Local Studio Worker only — no IAM package imports.
 */

const STUDIO_VAULT_ACTOR = "agentsam-local-studio";

function trim(value) {
  return value == null ? "" : String(value).trim();
}

function requireDb(env) {
  return env?.DB && typeof env.DB.prepare === "function" ? env.DB : null;
}

function idFor(prefix = "aakcred") {
  const arr = new Uint8Array(10);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function randomToken(prefix, bytes = 24) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

async function sha256Hex(value) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const DEFAULT_SCOPES = Object.freeze([
  "account:read",
  "repository:read",
  "database:read",
  "vectors:read",
  "models:invoke",
  "agentsam:context",
]);

/**
 * @param {object} env
 * @param {{
 *   accountId: string,
 *   kind: 'account' | 'service',
 *   name?: string,
 *   clientType?: string,
 *   expiresAtUnix?: number | null,
 *   mintedBy?: string,
 * }} input
 */
export async function mintStudioCredential(env, input = {}) {
  const db = requireDb(env);
  if (!db) throw new Error("database_unavailable");

  const accountId = trim(input.accountId);
  if (!accountId) throw new Error("account_id_required");

  const kind = trim(input.kind).toLowerCase() === "service" ? "service" : "account";
  const authorityType = kind === "service" ? "service" : "delegated";
  const tokenPrefix = kind === "service" ? "brk" : "aak";
  const envName = kind === "service" ? "AGENTSAM_BRIDGE_KEY" : "AGENTSAM_API_KEY";
  const idPrefix = kind === "service" ? "brkcred" : "aakcred";

  const label =
    trim(input.name) ||
    (kind === "service" ? "AgentSam bridge key" : "AgentSam API key");
  const clientType = ["cli", "ci", "agent", "integration"].includes(trim(input.clientType))
    ? trim(input.clientType)
    : kind === "service"
      ? "integration"
      : "cli";

  const secret = randomToken(tokenPrefix, 24);
  if (!secret.startsWith(`${tokenPrefix}_`)) throw new Error("token_prefix_mismatch");
  const credentialHash = await sha256Hex(secret);
  const prefix = `${secret.slice(0, 10)}…`;
  const id = idFor(idPrefix);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number.isFinite(Number(input.expiresAtUnix))
    ? Number(input.expiresAtUnix)
    : null;

  await db
    .prepare(
      `INSERT INTO agentsam_api_credentials (
        id, account_id, credential_hash, prefix, label,
        authority_type, client_type, subject_type, subject_id,
        scopes_json, created_at_unix, expires_at_unix, minted_by, rotated_from
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'account', ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      id,
      accountId,
      credentialHash,
      prefix,
      label,
      authorityType,
      clientType,
      accountId,
      JSON.stringify([...DEFAULT_SCOPES]),
      now,
      expiresAt,
      trim(input.mintedBy) || STUDIO_VAULT_ACTOR,
    )
    .run();

  return {
    id,
    account_id: accountId,
    name: label,
    kind,
    authority_type: authorityType,
    env: envName,
    prefix,
    client_type: clientType,
    created_at_unix: now,
    expires_at_unix: expiresAt,
    secret_once: secret,
  };
}

export async function listStudioCredentials(env, accountId) {
  const db = requireDb(env);
  if (!db) throw new Error("database_unavailable");
  const id = trim(accountId);
  if (!id) throw new Error("account_id_required");
  const now = Math.floor(Date.now() / 1000);
  const { results } = await db
    .prepare(
      `SELECT id, account_id, prefix, label, authority_type, client_type, scopes_json,
              created_at_unix, expires_at_unix, revoked_at_unix, last_used_at_unix
         FROM agentsam_api_credentials
        WHERE account_id = ?
        ORDER BY created_at_unix DESC
        LIMIT 100`,
    )
    .bind(id)
    .all();

  return (results || []).map((row) => {
    const kind = row.authority_type === "service" ? "service" : "account";
    let status = "active";
    if (row.revoked_at_unix) status = "revoked";
    else if (row.expires_at_unix && row.expires_at_unix < now) status = "expired";
    return {
      id: row.id,
      account_id: row.account_id,
      name: row.label,
      kind,
      authority_type: row.authority_type,
      env: kind === "service" ? "AGENTSAM_BRIDGE_KEY" : "AGENTSAM_API_KEY",
      prefix: row.prefix,
      client_type: row.client_type,
      status,
      created_at_unix: row.created_at_unix,
      expires_at_unix: row.expires_at_unix,
      last_used_at_unix: row.last_used_at_unix,
      secret_preview: row.prefix || "••••",
    };
  });
}

export async function revokeStudioCredential(env, { accountId, credentialId }) {
  const db = requireDb(env);
  if (!db) throw new Error("database_unavailable");
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `UPDATE agentsam_api_credentials
          SET revoked_at_unix = ?
        WHERE id = ? AND account_id = ? AND revoked_at_unix IS NULL`,
    )
    .bind(now, trim(credentialId), trim(accountId))
    .run();
  return { ok: (result?.meta?.changes || 0) > 0, revoked_at_unix: now };
}
