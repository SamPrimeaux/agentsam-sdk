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
  openVaultRow,
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
 * Service-name aliases (grok→xai, google→gemini) are intentional D1 values, not env fallbacks.
 */
export const SERVICE_TO_PROVIDER: Readonly<Record<string, string>> = Object.freeze({
  openai: "openai",
  meta: "meta",
  anthropic: "anthropic",
  gemini: "gemini",
  google: "gemini",
  xai: "xai",
  grok: "xai",
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
  /** Row metadata_json; omitted means canonical (AAD-bound), the strict default. */
  metadataJson?: unknown,
  /** Legacy IAM fallback key (VAULT_KEY); only consulted for verified legacy rows. */
  legacyKeyMaterial?: string,
): Promise<string> {
  const env = { VAULT_MASTER_KEY: masterKeyMaterial, VAULT_KEY: legacyKeyMaterial };
  const row = {
    secret_value_encrypted: packedB64,
    metadata_json: metadataJson === undefined ? { aad_bound: 1 } : metadataJson,
  };
  return (await openVaultRow(env, row, aad)).value;
}

export interface VaultD1Binding {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
    all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run(): Promise<unknown>;
  };
}

export interface StudioCredentialRecord extends StudioCredential {
  id: string;
  provider: string;
  serviceName: string;
  name: string;
  last4: string | null;
}

export type StudioModelProviderDefinition = {
  id: string;
  label: string;
  service: string;
  adapter: string;
};

export interface VaultSecretRow {
  id?: unknown;
  secret_name?: unknown;
  service_name?: unknown;
  secret_value_encrypted?: unknown;
  metadata_json?: unknown;
  service_kind?: unknown;
  service_metadata_json?: unknown;
}

export const VAULT_SECRETS_QUERY = [
  "SELECT us.id, us.secret_name, us.service_name, us.secret_value_encrypted, us.metadata_json,",
  "sr.kind AS service_kind, sr.metadata_json AS service_metadata_json",
  "FROM user_secrets us LEFT JOIN agentsam_service_registry sr ON sr.service_name = us.service_name",
  "WHERE us.account_id = ? AND us.is_active = 1 AND us.kind = 'provider_key'",
  "AND (sr.kind = 'ai_provider' OR sr.kind IS NULL)",
  "ORDER BY us.updated_at DESC LIMIT 100",
].join(" ");

function clean(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

/**
 * Load every usable provider credential for one account (au_*).
 *
 * A provider can have multiple independent keys. Preserve each credential's
 * identity so discovery and preferences can be scoped to the exact key.
 */
export async function loadVaultCredentialRecords(options: {
  db: VaultD1Binding;
  accountId: string;
  masterKey: string;
  /** VAULT_KEY: legacy IAM fallback, used only for verified legacy rows. */
  legacyKey?: string;
  /** CLOUDFLARE_ACCOUNT_ID only — never a generic ACCOUNT_ID, never au_*. */
  cloudflareAccountId?: string | null;
  rows?: VaultSecretRow[];
}): Promise<StudioCredentialRecord[]> {
  const accountId = clean(options.accountId);
  if (!accountId) return [];
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
  const records: StudioCredentialRecord[] = [];
  for (const row of rows) {
    let serviceMetadata: Record<string, unknown> = {};
    try {
      const parsed = typeof row.service_metadata_json === "string"
        ? JSON.parse(row.service_metadata_json)
        : row.service_metadata_json;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) serviceMetadata = parsed as Record<string, unknown>;
    } catch {
      serviceMetadata = {};
    }
    const modelDiscovery = serviceMetadata.model_discovery && typeof serviceMetadata.model_discovery === "object"
      ? serviceMetadata.model_discovery as Record<string, unknown>
      : null;
    const providerId = clean(serviceMetadata.provider_id) || serviceToProvider(row.service_name);
    const serviceKind = clean(row.service_kind);
    const ciphertext = clean(row.secret_value_encrypted);
    const serviceName = clean(row.service_name).toLowerCase();
    const secretName = clean(row.secret_name);
    if (!providerId || !ciphertext || !secretName) continue;
    if (serviceKind && serviceKind !== "ai_provider") continue;
    if (modelDiscovery && modelDiscovery.enabled === false) continue;
    const aad = vaultAad(accountId, serviceName, secretName);
    try {
      const value = await decryptVaultSecret(ciphertext, aad, masterKey, row.metadata_json ?? null, options.legacyKey);
      if (!value.trim()) continue;
      let metadata: Record<string, unknown> = {};
      try {
        const parsed = typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : row.metadata_json;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
      } catch {
        /* Crypto provenance is validated by decryptVaultSecret; display metadata is optional. */
      }
      records.push({
        id: clean(row.id) || serviceName + ":" + secretName,
        provider: providerId,
        serviceName,
        name: secretName,
        last4: clean(metadata.last4) || null,
        value,
        source: "user_vault",
        ...(providerId === "cloudflare" && cfAccountId ? { cloudflare_account_id: cfAccountId } : {}),
      });
    } catch {
      continue;
    }
  }
  return records;
}

/**
 * The account service registry owns provider identities and discovery adapter
 * selection. Adapter implementations remain code-owned; model IDs never do.
 */
export async function loadModelProviderDefinitions(
  db: VaultD1Binding | null,
): Promise<StudioModelProviderDefinition[]> {
  if (!db) return [];
  const { results } = await db.prepare(
    "SELECT service_name, label, kind, metadata_json FROM agentsam_service_registry "
      + "WHERE kind = 'ai_provider' ORDER BY label",
  ).all<{
    service_name?: unknown;
    label?: unknown;
    kind?: unknown;
    metadata_json?: unknown;
  }>();
  const definitions = new Map<string, StudioModelProviderDefinition>();
  for (const row of results || []) {
    let metadata: Record<string, unknown> = {};
    try {
      const parsed = typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : row.metadata_json;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
    } catch {
      metadata = {};
    }
    const discovery = metadata.model_discovery && typeof metadata.model_discovery === "object"
      ? metadata.model_discovery as Record<string, unknown>
      : {};
    if (discovery.enabled !== true) continue;
    const service = clean(row.service_name).toLowerCase();
    const id = clean(metadata.provider_id) || serviceToProvider(service) || service;
    const adapter = clean(discovery.adapter) || id;
    if (!id || !adapter) continue;
    const previous = definitions.get(id);
    const next = {
      id,
      label: clean(row.label) || previous?.label || id,
      service,
      adapter,
    };
    // Prefer the canonical service row over an alias such as google -> gemini.
    if (!previous || service === id) definitions.set(id, next);
  }
  return [...definitions.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Compatibility resolver for single-credential callers.
 * Inventory and model discovery must use loadVaultCredentialRecords instead.
 */
export async function loadVaultCredentialMap(options: {
  db: VaultD1Binding;
  accountId: string;
  masterKey: string;
  legacyKey?: string;
  cloudflareAccountId?: string | null;
  rows?: VaultSecretRow[];
}): Promise<Map<string, StudioCredential>> {
  const records = await loadVaultCredentialRecords(options);
  const byProvider = new Map<string, StudioCredential>();
  for (const record of records) {
    if (!byProvider.has(record.provider)) {
      byProvider.set(record.provider, {
        value: record.value,
        source: record.source,
        ...(record.cloudflare_account_id ? { cloudflare_account_id: record.cloudflare_account_id } : {}),
      });
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
  if (id === "xai") return pick(env.XAI_API_KEY);
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
/**
 * All account-owned provider keys, retaining credential identity.
 * Empty array when D1 or VAULT_MASTER_KEY is missing — never throws.
 */
export async function vaultCredentialRecordsForAccount(
  bindings: StudioServerBindings,
  accountId: string,
): Promise<StudioCredentialRecord[]> {
  try {
    const masterKey = clean(bindings.env.VAULT_MASTER_KEY);
    const owner = clean(accountId);
    if (!bindings.db || !masterKey || !owner) return [];
    return await loadVaultCredentialRecords({
      db: bindings.db,
      accountId: owner,
      masterKey,
      legacyKey: clean(bindings.env.VAULT_KEY) || undefined,
      cloudflareAccountId: clean(bindings.env.CLOUDFLARE_ACCOUNT_ID) || null,
    });
  } catch {
    return [];
  }
}

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
      legacyKey: clean(bindings.env.VAULT_KEY) || undefined,
      cloudflareAccountId: clean(bindings.env.CLOUDFLARE_ACCOUNT_ID) || null,
    });
  } catch {
    return new Map();
  }
}
