/**
 * Mint AgentSam account (aak_*) and service (brk_*) credentials.
 * Hash-only at rest in agentsam_api_credentials; plaintext returned once.
 * Local Studio Worker only — no IAM package imports.
 */

import appManifest from '../../agentsam.app.json';

const APP = Object.freeze(appManifest);
const STUDIO_VAULT_ACTOR = APP.id;

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

function parseScopes(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Scopes come from the agentsam_capabilities registry, never from a constant.
 *  - explicit `scopes`: registry keys, a domain subtree wildcard (design.*), or *; unknown values are rejected
 *  - permissions read-only: every active non-mutating capability
 *  - permissions all, or a personal key with no choice: the minting account's own authority (wildcard)
 *  - a service key must choose explicitly
 */
export async function resolveCredentialScopes(db, kind, input = {}) {
  const requested = Array.isArray(input.scopes) ? input.scopes.map(trim).filter(Boolean) : [];
  const preset = trim(input.permissions).toLowerCase();
  if (!requested.length && preset !== "read-only") {
    if (preset === "all" || kind === "account") return ["*"];
    throw new Error("scopes_required");
  }
  const { results } = await db
    .prepare("SELECT capability_key, domain, is_mutating FROM agentsam_capabilities WHERE is_active = 1")
    .all();
  const rows = results || [];
  if (!requested.length) {
    const readOnly = rows.filter((row) => !row.is_mutating).map((row) => row.capability_key).sort();
    if (!readOnly.length) throw new Error("no_read_only_capabilities");
    return readOnly;
  }
  const keys = new Set(rows.map((row) => row.capability_key));
  const domains = new Set();
  for (const row of rows) {
    const parts = String(row.domain).split(".");
    for (let i = 1; i <= parts.length; i++) domains.add(parts.slice(0, i).join("."));
  }
  const unknown = requested.filter(
    (scope) => scope !== "*" && !keys.has(scope) && !(scope.endsWith(".*") && domains.has(scope.slice(0, -2))),
  );
  if (unknown.length) throw new Error("unknown_scopes:" + unknown.join(","));
  return [...new Set(requested)];
}

/**
 * @param {object} env
 * @param {{
 *   accountId: string,
 *   kind: 'account' | 'service',
 *   name?: string,
 *   clientType?: string,
 *   expiresAtUnix?: number | null,
 *   mintedBy?: string,
 *   scopes?: string[],
 *   permissions?: 'all' | 'read-only',
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

  const scopes = await resolveCredentialScopes(db, kind, input);

  const secret = randomToken(tokenPrefix, 24);
  if (!secret.startsWith(`${tokenPrefix}_`)) throw new Error("token_prefix_mismatch");
  const credentialHash = await sha256Hex(secret);
  const prefix = `${secret.slice(0, 10)}…`;
  const id = idFor(idPrefix);
  const now = Math.floor(Date.now() / 1000);
  // null/undefined/0 = never expire — Number(null)===0 must not become expires_at_unix=0
  const rawExp = input.expiresAtUnix;
  const expiresAt =
    rawExp == null || rawExp === ""
      ? null
      : Number.isFinite(Number(rawExp)) && Number(rawExp) > 0
        ? Math.floor(Number(rawExp))
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
      JSON.stringify(scopes),
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
    scopes,
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
    const expiresNum = row.expires_at_unix == null ? null : Number(row.expires_at_unix);
    if (row.revoked_at_unix) status = "revoked";
    else if (expiresNum != null && expiresNum > 0 && expiresNum < now) status = "expired";
    const created = Number(row.created_at_unix);
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
      created_at_unix: Number.isFinite(created) && created > 0 ? created : null,
      expires_at_unix: expiresNum != null && Number.isFinite(expiresNum) && expiresNum > 0 ? expiresNum : null,
      last_used_at_unix:
        row.last_used_at_unix == null ? null : Number(row.last_used_at_unix) || null,
      secret_preview: row.prefix || "••••",
      scopes: parseScopes(row.scopes_json),
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
