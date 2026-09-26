/**
 * Studio vault credential resolution (server-only).
 *
 * Session → accounts.id (au_*) → user_secrets.account_id → unwrap.
 * Crypto SSOT: `@inneranimalmedia/agentsam-vault` (same module as the Worker).
 *   VAULT_MASTER_KEY = `v1.<base64 of exactly 32 bytes>`
 *   AAD              = `${accountId}:${serviceName}:${secretName}`
 *   packed           = base64(iv || ciphertext||tag)
 * UI never receives decrypted values except ephemeral reveal after re-auth.
 */

import {
  importVaultMasterKey,
  encryptVaultSecret as encryptWithVaultKey,
  decryptVaultSecret as decryptWithVaultKey,
} from "@inneranimalmedia/agentsam-vault/crypto";

export type StudioCredentialSource = "user_vault" | "platform";

export interface StudioCredential {
  value: string;
  source: StudioCredentialSource;
  /** Cloudflare account id (CLOUDFLARE_ACCOUNT_ID) when provider is cloudflare — not au_*. */
  cloudflare_account_id?: string | null;
}

export type StudioEnv = Record<string, string | undefined>;

/**
 * D1 user_secrets.service_name → Studio provider id.
 * Service-name aliases (xai→grok, google→gemini) are intentional D1 values, not env fallbacks.
 */
export const SERVICE_TO_PROVIDER: Readonly<Record<string, string>> = Object.freeze({
  openai: "openai",
  anthropic: "anthropic",
  gemini: "gemini",
  google: "gemini",
  xai: "grok",
  grok: "grok",
  cursor: "cursor",
  cloudflare: "cloudflare",
  meshy: "meshy",
  resend: "resend",
  tavily: "tavily",
});

export function serviceToProvider(serviceName: unknown): string | null {
  const id = SERVICE_TO_PROVIDER[String(serviceName ?? "").trim().toLowerCase()];
  return id ?? null;
}

/**
 * Session identity = accounts.id (au_*).
 * Header name X-User-Id is legacy; value is account_id.
 */
export function resolveStudioAccountId(request: Request): string {
  return (request.headers.get("x-user-id") || "").trim();
}

/** AAD binding ciphertext to its account owner. Must match the Worker exactly. */
export function vaultAad(accountId: string, serviceName: string, secretName: string): string {
  return `${accountId}:${serviceName}:${secretName}`;
}

export async function encryptVaultSecret(
  plaintext: string,
  aad: string,
  masterKeyMaterial: string,
): Promise<string> {
  const key = await importVaultMasterKey(masterKeyMaterial);
  return encryptWithVaultKey(key, plaintext, aad);
}

export async function decryptVaultSecret(
  packedB64: string,
  aad: string,
  masterKeyMaterial: string,
): Promise<string> {
  const key = await importVaultMasterKey(masterKeyMaterial);
  return decryptWithVaultKey(key, packedB64, aad);
}

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
     WHERE account_id = ? AND is_active = 1
     ORDER BY updated_at DESC
     LIMIT 100`;

function clean(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

/**
 * Load and unwrap vault credentials for one account (au_*).
 * First row wins per provider. Decrypt failures are skipped.
 */
export async function loadVaultCredentialMap(options: {
  db: VaultD1Binding;
  accountId: string;
  masterKey: string;
  /** CLOUDFLARE_ACCOUNT_ID only — never a generic ACCOUNT_ID, never au_*. */
  cloudflareAccountId?: string | null;
  rows?: VaultSecretRow[];
}): Promise<Map<string, StudioCredential>> {
  const accountId = clean(options.accountId);
  if (!accountId) return new Map();
  const { db, masterKey } = options;
  const cfAccountId = clean(options.cloudflareAccountId) || null;
  const rows =
    options.rows ??
    (
      (await db
        .prepare(VAULT_SECRETS_QUERY)
        .bind(accountId)
        .all<VaultSecretRow>()) as { results?: VaultSecretRow[] }
    ).results ??
    [];
  const byProvider = new Map<string, StudioCredential>();
  for (const row of rows) {
    const providerId = serviceToProvider(row.service_name);
    if (!providerId || byProvider.has(providerId)) continue;
    const ciphertext = clean(row.secret_value_encrypted);
    if (!ciphertext) continue;
    const aad = vaultAad(accountId, String(row.service_name), String(row.secret_name));
    try {
      const value = await decryptVaultSecret(ciphertext, aad, masterKey);
      if (!value.trim()) continue;
      const entry: StudioCredential = { value, source: "user_vault" };
      if (providerId === "cloudflare" && cfAccountId) {
        entry.cloudflare_account_id = cfAccountId;
      }
      byProvider.set(providerId, entry);
    } catch {
      continue;
    }
  }
  return byProvider;
}

/** Platform desk secrets from Worker env (not BYOK). One env name per provider — no dual keys. */
export function platformCredentialFor(
  provider: string,
  env: StudioEnv,
): StudioCredential | null {
  const id = clean(provider).toLowerCase();
  const pick = (value: string | undefined, extra: Partial<StudioCredential> = {}) => {
    if (!value || !clean(value)) return null;
    return { value: clean(value), source: "platform" as const, ...extra };
  };
  if (id === "openai") return pick(env.OPENAI_API_KEY);
  if (id === "anthropic") return pick(env.ANTHROPIC_API_KEY);
  if (id === "gemini") return pick(env.GEMINI_API_KEY);
  if (id === "grok") return pick(env.XAI_API_KEY);
  if (id === "cursor") return pick(env.CURSOR_API_KEY);
  if (id === "meshy") return pick(env.MESHYAI_API_KEY);
  if (id === "resend") return pick(env.RESEND_API_KEY);
  if (id === "tavily") return pick(env.TAVILY_API_KEY);
  if (id === "cloudflare") {
    return pick(env.CLOUDFLARE_API_TOKEN, {
      cloudflare_account_id: clean(env.CLOUDFLARE_ACCOUNT_ID) || null,
    });
  }
  return null;
}

/** Vault-first merge: account BYOK wins, platform fills gaps. */
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

export function shouldUseWorkersAI(provider: string, workersAIBinding: unknown): boolean {
  return clean(provider).toLowerCase() === "cloudflare" && Boolean(workersAIBinding);
}

export function assertInventoryResponseSafe(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (/"value"\s*:/.test(text) || /sk-[a-zA-Z0-9]{10,}/.test(text)) {
    throw new Error("inventory_sanitizer_rejected_secret_field");
  }
}

export interface StudioServerBindings {
  env: StudioEnv;
  db: VaultD1Binding | null;
  workersAI: unknown;
}

function readProcessEnv(): StudioEnv {
  try {
    if (typeof process !== "undefined" && process.env) return { ...process.env };
  } catch {
    /* non-node */
  }
  return {};
}

/**
 * Server bindings for Studio Nitro/TanStack routes.
 * Missing D1 / VAULT_MASTER_KEY simply means no vault lane.
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
    /* process.env only */
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
 * Vault credentials for one account (au_*).
 * Empty map when D1 or VAULT_MASTER_KEY is missing — never throws.
 */
export async function vaultCredentialsForAccount(
  bindings: StudioServerBindings,
  accountId: string,
): Promise<Map<string, StudioCredential>> {
  try {
    const masterKey = clean(bindings.env.VAULT_MASTER_KEY);
    const owner = clean(accountId);
    if (!bindings.db || !masterKey || !owner) return new Map();
    return await loadVaultCredentialMap({
      db: bindings.db,
      accountId: owner,
      masterKey,
      cloudflareAccountId: clean(bindings.env.CLOUDFLARE_ACCOUNT_ID) || null,
    });
  } catch {
    return new Map();
  }
}
