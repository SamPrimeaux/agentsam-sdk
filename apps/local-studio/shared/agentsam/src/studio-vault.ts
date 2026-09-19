/**
 * Studio vault credential resolution (server-only).
 *
 * Session -> user_id -> vault BYOK -> platform fallback for Local Studio.
 *
 * The canonical encrypt/decrypt implementation lives in
 * `apps/local-studio/backend/worker/index.js` (AES-256-GCM, Web Crypto,
 * AAD `${userId}:${serviceName}:${secretName}`, stored `base64(iv||ciphertext)`).
 * This module mirrors that contract so Nitro/TanStack Studio routes can unwrap
 * a caller's `user_secrets` rows from D1 `inneranimalmedia-business` without
 * importing the Worker entry or root `src/`.
 *
 * Safety invariants (enforced by construction, not prose):
 * - No filesystem reads (never `~/.agentsam`), no Durable Objects, no second database.
 * - Helpers return credential *values* only to server callers; pair with
 *   `assertInventoryResponseSafe` before serializing anything for the browser.
 * - Per-row decrypt failures are skipped, never thrown to the client, and never
 *   logged with secret material.
 */

export type StudioCredentialSource = "user_vault" | "platform";

export interface StudioCredential {
  value: string;
  source: StudioCredentialSource;
  account_id?: string | null;
  /** True when chat should run through the Workers AI binding instead of a token. */
  viaWorkersAI?: boolean;
}

export type StudioEnv = Record<string, string | undefined>;

/** D1 `user_secrets.service_name` -> Studio provider id. Mirrors the Worker map. */
export const SERVICE_TO_PROVIDER: Readonly<Record<string, string>> = Object.freeze({
  openai: "openai",
  anthropic: "anthropic",
  gemini: "gemini",
  xai: "grok",
  grok: "grok",
  cursor: "cursor",
  cloudflare: "cloudflare",
});

export function serviceToProvider(serviceName: unknown): string | null {
  const id = SERVICE_TO_PROVIDER[String(serviceName ?? "").trim().toLowerCase()];
  return id ?? null;
}

/**
 * Identity asserted for a Studio API request.
 *
 * The Worker edge (`backend/worker/index.js`) validates the session cookie via
 * the identity package and binds it to this header before Nitro runs, so by the
 * time a Studio route reads it the value is session-backed in production. In
 * local dev (no Worker in front) it carries the Studio client's user id.
 */
export function resolveStudioUserId(request: Request): string {
  return (request.headers.get("x-user-id") || "").trim();
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function importVaultKey(masterKeyMaterial: string): Promise<CryptoKey> {
  const raw = String(masterKeyMaterial ?? "");
  if (!raw) throw new Error("vault_master_key_missing");
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = b64ToBytes(raw);
  } catch {
    keyBytes = textEncoder.encode(raw);
  }
  if (keyBytes.byteLength > 32) {
    keyBytes = keyBytes.slice(0, 32);
  } else if (keyBytes.byteLength < 32) {
    keyBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", keyBytes));
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** AAD binding a ciphertext row to its owner. Must match the Worker exactly. */
export function vaultAad(userId: string, serviceName: string, secretName: string): string {
  return `${userId}:${serviceName}:${secretName}`;
}

/** Server-side encryption (parity with the Worker; used by tests and writers). */
export async function encryptVaultSecret(
  plaintext: string,
  aad: string,
  masterKeyMaterial: string,
): Promise<string> {
  const key = await importVaultKey(masterKeyMaterial);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: textEncoder.encode(aad) },
    key,
    textEncoder.encode(plaintext),
  );
  const packed = new Uint8Array(iv.byteLength + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.byteLength);
  return bytesToB64(packed);
}

/** Unwrap one vault row. Throws on wrong key/AAD/tamper — callers skip the row. */
export async function decryptVaultSecret(
  packedB64: string,
  aad: string,
  masterKeyMaterial: string,
): Promise<string> {
  const key = await importVaultKey(masterKeyMaterial);
  const packed = b64ToBytes(packedB64);
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: textEncoder.encode(aad) },
    key,
    data,
  );
  return textDecoder.decode(plain);
}

/** Minimal structural D1 surface — no wrangler import, no second database. */
export interface VaultD1Binding {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
    };
  };
}

export interface VaultSecretRow {
  id?: unknown;
  secret_name?: unknown;
  service_name?: unknown;
  secret_value_encrypted?: unknown;
}

export const VAULT_SECRETS_QUERY = `SELECT id, secret_name, service_name, secret_value_encrypted
     FROM user_secrets
     WHERE user_id = ? AND is_active = 1
     ORDER BY updated_at DESC
     LIMIT 100`;

function clean(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

/**
 * Load and unwrap every vault credential for a user. First row wins per
 * provider. Rows that fail to decrypt are skipped (stale key version, tamper).
 * Never throws for row-level failures; throws only when the query itself fails.
 */
export async function loadVaultCredentialMap(options: {
  db: VaultD1Binding;
  userId: string;
  masterKey: string;
  accountId?: string | null;
  rows?: VaultSecretRow[];
}): Promise<Map<string, StudioCredential>> {
  const { db, userId, masterKey, accountId } = options;
  const rows =
    options.rows ??
    (
      (await db
        .prepare(VAULT_SECRETS_QUERY)
        .bind(userId)
        .all<VaultSecretRow>()) as { results?: VaultSecretRow[] }
    ).results ??
    [];
  const byProvider = new Map<string, StudioCredential>();
  for (const row of rows) {
    const providerId = serviceToProvider(row.service_name);
    if (!providerId || byProvider.has(providerId)) continue;
    const ciphertext = clean(row.secret_value_encrypted);
    if (!ciphertext) continue;
    const aad = vaultAad(userId, String(row.service_name), String(row.secret_name));
    try {
      const value = await decryptVaultSecret(ciphertext, aad, masterKey);
      if (!value.trim()) continue;
      const entry: StudioCredential = { value, source: "user_vault" };
      if (providerId === "cloudflare") entry.account_id = accountId ?? null;
      byProvider.set(providerId, entry);
    } catch {
      continue;
    }
  }
  return byProvider;
}

/** Single-provider platform (desk secret) lookup. Mirrors the Worker lane. */
export function platformCredentialFor(
  provider: string,
  env: StudioEnv,
  accountId?: string | null,
): StudioCredential | null {
  const id = clean(provider).toLowerCase();
  const pick = (value: string | undefined, extra: Partial<StudioCredential> = {}) => {
    if (!value || !clean(value)) return null;
    return { value: clean(value), source: "platform" as const, ...extra };
  };
  if (id === "openai") return pick(env.OPENAI_API_KEY);
  if (id === "anthropic") return pick(env.ANTHROPIC_API_KEY);
  if (id === "gemini") return pick(env.GEMINI_API_KEY);
  if (id === "grok" || id === "xai") return pick(env.XAI_API_KEY);
  if (id === "cursor") return pick(env.CURSOR_API_KEY);
  if (id === "cloudflare") {
    return pick(env.CLOUDFLARE_API_TOKEN, {
      account_id: accountId ?? env.CLOUDFLARE_ACCOUNT_ID ?? env.ACCOUNT_ID ?? null,
    });
  }
  return null;
}

/** Vault-first merge: user BYOK wins, platform fills the gaps. */
export function mergeStudioCredentials(
  vault: Map<string, StudioCredential>,
  platform: Map<string, StudioCredential>,
): Map<string, StudioCredential> {
  const merged = new Map<string, StudioCredential>();
  for (const [id, cred] of vault.entries()) merged.set(id, cred);
  for (const [id, cred] of platform.entries()) {
    if (!merged.has(id)) merged.set(id, cred);
  }
  return merged;
}

/** Credential plane label from provenance. Mirrors the Worker computation. */
export function credentialPlaneFor(credentials: Map<string, { source?: string }>): string {
  let vault = 0;
  let platform = 0;
  for (const cred of credentials.values()) {
    if (cred.source === "user_vault") vault += 1;
    else if (cred.source === "platform") platform += 1;
  }
  if (vault > 0) return platform > 0 ? "mixed" : "studio_vault";
  return "platform";
}

/**
 * Cloudflare chat must run through the Workers AI binding (`env.AGENTSAM_WAI`)
 * when it is present — never through a pasted token when the binding exists.
 */
export function shouldUseWorkersAI(provider: string, workersAIBinding: unknown): boolean {
  return clean(provider).toLowerCase() === "cloudflare" && Boolean(workersAIBinding);
}

/**
 * Boundary guard: refuse to serialize inventory payloads that embed credential
 * material. Throws when a `value` field or an `sk-…` secret pattern is present.
 */
export function assertInventoryResponseSafe(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (/"value"\s*:/.test(text) || /sk-[a-zA-Z0-9]{10,}/.test(text)) {
    throw new Error("inventory_sanitizer_rejected_secret_field");
  }
}

export interface StudioServerBindings {
  /** String vars/secrets: `process.env` plus any runtime env the host exposes. */
  env: StudioEnv;
  /** D1 `inneranimalmedia-business` when the server runtime exposes it. */
  db: VaultD1Binding | null;
  /** Workers AI binding (`env.AGENTSAM_WAI`) when the runtime exposes it. */
  workersAI: unknown;
}

function readProcessEnv(): StudioEnv {
  try {
    if (typeof process !== "undefined" && process.env) return { ...process.env };
  } catch {
    /* non-node runtimes */
  }
  return {};
}

/**
 * Best-effort server bindings for Studio Nitro/TanStack routes.
 *
 * Local dev resolves string vars from `process.env`. In the production Worker
 * the same route runs behind `backend/worker/index.js`, which owns session
 * validation and credential provenance; object bindings (D1, Workers AI) are
 * picked up here when the server runtime surfaces them on the handler context.
 * Missing bindings simply deactivate the vault lane — platform fallback always
 * applies. Never throws.
 */
export function studioServerBindings(handlerArg: unknown): StudioServerBindings {
  const env = readProcessEnv();
  let runtimeEnv: Record<string, unknown> | null = null;
  try {
    const arg = handlerArg as {
      context?: { cloudflare?: { env?: unknown }; env?: unknown };
      env?: unknown;
    } | null;
    const candidates = [arg?.context?.cloudflare?.env, arg?.context?.env, arg?.env];
    for (const candidate of candidates) {
      if (candidate && typeof candidate === "object") {
        runtimeEnv = candidate as Record<string, unknown>;
        break;
      }
    }
    if (runtimeEnv) {
      for (const [key, value] of Object.entries(runtimeEnv)) {
        if (typeof value === "string" && value) env[key] = value;
      }
    }
  } catch {
    /* probe-only: fall back to process.env */
  }
  let db: VaultD1Binding | null = null;
  let workersAI: unknown = null;
  try {
    const maybeDb = runtimeEnv?.DB as VaultD1Binding | undefined;
    if (maybeDb && typeof maybeDb.prepare === "function") db = maybeDb;
    if (runtimeEnv && "AGENTSAM_WAI" in runtimeEnv) workersAI = runtimeEnv.AGENTSAM_WAI ?? null;
  } catch {
    db = null;
    workersAI = null;
  }
  return { env, db, workersAI };
}

/**
 * Vault-first credentials for one Studio user. Returns an empty map (platform
 * fallback downstream) when D1 or the vault master key is unreachable — e.g.
 * local dev with no Worker bindings. Never throws, never logs secret material.
 */
export async function vaultCredentialsForUser(
  bindings: StudioServerBindings,
  userId: string,
): Promise<Map<string, StudioCredential>> {
  try {
    const masterKey = bindings.env.VAULT_MASTER_KEY || bindings.env.VAULT_KEY || "";
    if (!bindings.db || !masterKey || !userId) return new Map();
    const accountId =
      bindings.env.CLOUDFLARE_ACCOUNT_ID || bindings.env.ACCOUNT_ID || null;
    return await loadVaultCredentialMap({ db: bindings.db, userId, masterKey, accountId });
  } catch {
    return new Map();
  }
}
