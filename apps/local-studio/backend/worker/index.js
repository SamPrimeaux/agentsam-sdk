import nitroWorker from "../../.output/server/index.mjs";
import installScript from "../../../../scripts/install.sh";
import { handleCloudflareConnectionRequest, isCloudflareConnectionPath } from "../../../../packages/connectors/cloudflare/src/routes.js";
import { resolveCloudflareOAuthClient } from "../../../../packages/connectors/cloudflare/src/index.js";
import {
  handleIdentityWorkerRequest,
  createIdentityService,
  createCloudflareD1Adapter,
} from "../../../../packages/identity/src/server/worker-router.js";
import {
  IDENTITY_ROUTE_IDS,
  projectionFromAppManifest,
  createRouteRegistry,
} from "../../../../packages/identity/src/contracts/routes.js";
import { mountRequiresAuth } from "../../../../packages/identity/src/server/mount-policy.js";
import { resolveIamIssuer } from "../../../../packages/identity/src/contracts/auth-config.js";
import {
  importVaultMasterKey,
  encryptVaultSecret,
  decryptVaultSecret,
  last4 as vaultLast4,
  createProviderRegistry,
} from "../../../../packages/agentsam-vault/src/index.js";
import { handleCmsWorkerRequest } from "./cms-service.js";
import { serveCanonicalHomepage } from "./canonical-homepage.js";
import { isPublicSitePath, servePublicSitePage } from "./public-site.js";
import { loadConnectionsRegistry } from "./connections-registry.js";
import { createLocalStudioPluginRuntime } from "./plugin-registry.js";
import {
  mintStudioCredential,
  listStudioCredentials,
  revokeStudioCredential,
} from "./agentsam-credentials-mint.js";
import localStudioApp from "../../agentsam.app.json";
import cadCreatorApp from "../../../cad-creator/agentsam.app.json";
import clientCmsApp from "../../../client-cms-editor/agentsam.app.json";
import ecommerceApp from "../../../ecommerce-cms-agentsam/agentsam.app.json";

const APP = localStudioApp;
const ROUTE_PROJECTION = projectionFromAppManifest(APP);
const ROUTE_REGISTRY = createRouteRegistry([ROUTE_PROJECTION]);
const PROVIDER_REGISTRY = createProviderRegistry();

/** Host-owned CF connect defaults — not inside packages/connectors. */
const LOCAL_STUDIO_CLOUDFLARE_CAPABILITIES = Object.freeze([
  "cloudflare.workers",
  "cloudflare.d1",
  "cloudflare.r2",
  "cloudflare.pages",
  "cloudflare.images",
  "cloudflare.stream",
  "cloudflare.vectorize",
  "cloudflare.hyperdrive",
  "cloudflare.mcp_portals",
  "cloudflare.agents",
  "cloudflare.workflows",
]);

const LOGIN_PATH = ROUTE_REGISTRY.resolve(APP.id, IDENTITY_ROUTE_IDS.LOGIN);
const SIGNUP_PATH = ROUTE_REGISTRY.resolve(APP.id, IDENTITY_ROUTE_IDS.SIGNUP);
const RESET_PATH = ROUTE_REGISTRY.resolve(APP.id, IDENTITY_ROUTE_IDS.RESET);

// Paths owned by the identity package (auth pages, auth API, OAuth, company branding).
const IDENTITY_EXACT_PATHS = new Set([
  LOGIN_PATH,
  SIGNUP_PATH,
  RESET_PATH,
  "/api/company",
].filter(Boolean));
function isIdentityPath(pathname) {
  return (
    IDENTITY_EXACT_PATHS.has(pathname) ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/oauth/")
  );
}

function isProtectedAppPath(pathname) {
  return mountRequiresAuth(pathname, APP);
}

/** Install paths derived from app manifests (not a hardcoded mini-registry). */
function buildInstallTargets(manifests) {
  const map = { "/install": "" };
  for (const m of manifests) {
    if (!m?.id) continue;
    const selector = m.install?.selector || m.id;
    const paths = Array.isArray(m.install?.paths) && m.install.paths.length
      ? m.install.paths
      : [`/install/${m.id}`];
    for (const p of paths) map[p] = selector;
  }
  return Object.freeze(map);
}

const INSTALL_APP_TARGETS = buildInstallTargets([
  localStudioApp,
  cadCreatorApp,
  clientCmsApp,
  ecommerceApp,
]);

/**
 * One generic installer script. App selection is explicit via --app-id on the client.
 * Path aliases (/install/studio, …) still serve the same script — no ambient default-app mutation.
 */
function serveInstallScript(_pathname) {
  return new Response(installScript, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Local Studio Worker — vault + credential mint (agentsam-sdk Worker `agentsam-sdk`).
 *
 * Crypto SSOT: `@inneranimalmedia/agentsam-vault` AES-256-GCM
 *   VAULT_MASTER_KEY = `v1.<base64 of exactly 32 bytes>` (no truncate/hash fallbacks)
 *   AAD              = `${accountId}:${serviceName}:${secretName}` (accountId = accounts.id au_*)
 *   packed           = base64(iv || ciphertext||tag)
 *
 * Stores:
 *   user_secrets              — account BYOK ciphertext
 *   agentsam_api_credentials  — minted aak_* / brk_* (hash only; secret_once once)
 *
 * Routes:
 *   GET/POST/DELETE /api/vault/secrets
 *   GET/POST/DELETE /api/vault/credentials
 *   GET /api/llm/inventory
 *   GET /health
 *
 * Auth: session cookie (accounts.id) OR AGENTSAM_BRIDGE_KEY (+ X-User-Id for the account).
 * Session always wins over a client-asserted X-User-Id.
 */
const STUDIO_VAULT_ACTOR = "agentsam-local-studio";

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

function last4(value) {
  return vaultLast4(value);
}

async function encryptSecret(env, plaintext, aad) {
  const key = await importVaultMasterKey(env.VAULT_MASTER_KEY);
  return encryptVaultSecret(key, plaintext, aad);
}

async function decryptSecret(env, packedB64, aad) {
  const key = await importVaultMasterKey(env.VAULT_MASTER_KEY);
  return decryptVaultSecret(key, packedB64, aad);
}

async function constantTimeSecretEqual(left, right) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(left || ""))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(right || ""))),
  ]);
  return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

async function requireBridgeKey(request, env) {
  const expected = String(env.AGENTSAM_BRIDGE_KEY || "").trim();
  if (!expected) return { ok: false, error: "AGENTSAM_BRIDGE_KEY not configured", status: 503 };
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const token = (request.headers.get("x-bridge-key") || "").trim() || bearer;
  if (!token || !(await constantTimeSecretEqual(token, expected))) {
    return { ok: false, error: "unauthorized", status: 401 };
  }
  return { ok: true };
}

async function probeInnerAnimalMediaOAuth(env) {
  const issuer = resolveIamIssuer(env);
  const configured = Boolean(issuer && env.IAM_CLIENT_ID && env.IAM_CLIENT_SECRET);
  const checkedAt = Math.floor(Date.now() / 1000);
  if (!configured) return { configured: false, healthy: false, status: "unconfigured", checked_at: checkedAt };
  const started = Date.now();
  try {
    const response = await fetch(`${issuer}/.well-known/oauth-authorization-server`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    const metadata = await response.json().catch(() => null);
    const healthy = response.ok
      && metadata?.issuer === issuer
      && typeof metadata?.authorization_endpoint === "string"
      && typeof metadata?.token_endpoint === "string"
      && metadata?.code_challenge_methods_supported?.includes?.("S256");
    return {
      configured: true,
      healthy,
      status: healthy ? "healthy" : "unhealthy",
      issuer,
      http_status: response.status,
      latency_ms: Date.now() - started,
      checked_at: checkedAt,
    };
  } catch (error) {
    return {
      configured: true,
      healthy: false,
      status: "unreachable",
      issuer,
      latency_ms: Date.now() - started,
      error: String(error?.name || "oauth_probe_failed"),
      checked_at: checkedAt,
    };
  }
}

/**
 * Resolve the validated session user via the identity package (D1
 * auth_sessions). Returns null when there is no session cookie, no DB
 * binding, or the session is missing/expired/revoked. Skips the D1 lookup
 * entirely when the request carries no Cookie header (service callers).
 */
async function resolveSessionUserId(request, env) {
  if (!env.DB) return null;
  if (!request.headers.get("cookie")) return null;
  try {
    const adapter = createCloudflareD1Adapter(env.DB);
    const identity = createIdentityService({
      adapter,
      app: APP,
      routeRegistry: ROUTE_REGISTRY,
    });
    const ctx = await identity.sessionFromRequest(request);
    return ctx?.user?.id || null;
  } catch (err) {
    console.error("session_resolve_error", String(err));
    return null;
  }
}

/**
 * Bind a Nitro-bound Studio request to the validated session user by
 * rewriting X-User-Id. Returns the (possibly cloned) request. Only the
 * session value is ever written — the client header can narrow nothing.
 */
function bindSessionUser(request, sessionUserId) {
  try {
    const headers = new Headers(request.headers);
    headers.set("x-user-id", sessionUserId);
    return new Request(request, { headers });
  } catch (err) {
    console.error("session_bind_error", String(err));
    return null;
  }
}

/**
 * Vault authority: session identity is accounts.id (au_*).
 * user_secrets.account_id owns rows — never tenant/workspace.
 * VAULT_MASTER_KEY is Worker AES-GCM material (`v1.<base64-32>`), not a personal key.
 */
function resolveVaultAccountId(sessionUserId) {
  const accountId = String(sessionUserId || "").trim();
  if (!accountId) throw new Error("vault_owner_required");
  return accountId;
}

/** Same-origin only for vault/credential surfaces (no reflective CORS). */
function vaultCors(request) {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  const self = new URL(request.url).origin;
  if (origin !== self) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "authorization, content-type, x-user-id, x-bridge-key",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    vary: "Origin",
  };
}

async function audit(env, row) {
  const accountId = String(row.account_id || "").trim();
  if (!accountId || !row.secret_id) return;
  try {
    // tenant_id column is NOT NULL legacy — mirror account_id (au_*), never a fake tenant.
    await env.DB.prepare(
      `INSERT INTO secret_audit_log (
         id, secret_id, secret_source, tenant_id, account_id, user_id, event_type,
         triggered_by, previous_last4, new_last4, notes, created_at
       ) VALUES (?, ?, 'user_secrets', ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
    )
      .bind(
        `saudit_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        row.secret_id,
        accountId,
        accountId,
        accountId,
        row.event_type,
        row.triggered_by || STUDIO_VAULT_ACTOR,
        row.previous_last4 || null,
        row.new_last4 || null,
        row.notes || null,
      )
      .run();
  } catch (err) {
    console.error("audit_failed", String(err));
  }
}

async function handleList(env, accountId) {
  const { results } = await env.DB.prepare(
    `SELECT id, secret_name, secret_type, kind, service_name, description, is_active,
            expires_at, last_used_at, usage_count, created_at, updated_at,
            metadata_json
     FROM user_secrets
     WHERE account_id = ? AND is_active = 1
     ORDER BY updated_at DESC
     LIMIT 100`,
  )
    .bind(accountId)
    .all();

  return json({
    ok: true,
    count: results?.length ?? 0,
    secrets: (results || []).map((r) => {
      let metadata = {};
      try {
        metadata = JSON.parse(String(r.metadata_json || "{}"));
      } catch {
        metadata = {};
      }
      return {
        id: r.id,
        name: r.secret_name,
        type: r.secret_type,
        kind: r.kind || "provider_key",
        service: r.service_name,
        description: r.description,
        expires_at: r.expires_at,
        last_used_at: r.last_used_at,
        usage_count: r.usage_count,
        created_at: r.created_at,
        updated_at: r.updated_at,
        last4: typeof metadata.last4 === "string" ? metadata.last4 : null,
      };
    }),
  });
}

async function handleCreate(env, accountId, body) {
  const rawService = String(body.service_name || body.service || "").trim().toLowerCase();
  // Canonical service_name for AAD — aliases only, no silent remaps to unrelated ids.
  const service =
    rawService === "cloudflare_r2" || rawService === "cf"
      ? "cloudflare"
      : rawService === "google_ai" || rawService === "google"
        ? "gemini"
        : rawService === "grok"
          ? "xai"
          : rawService;
  const name = String(body.secret_name || body.name || service || "default").trim();
  const value = String(body.value || body.secret || "").trim();
  const secretType = String(body.secret_type || "api_key").trim();
  const description = body.description ? String(body.description).slice(0, 500) : null;
  const kind =
    String(body.kind || "").trim() === "credential_bundle" || secretType === "credential"
      ? "credential_bundle"
      : "provider_key";

  if (!service) return json({ ok: false, error: "service_name required" }, 400);
  if (!value || value.length < 8) return json({ ok: false, error: "value too short" }, 400);

  // AAD must match decrypt sites exactly: `${accountId}:${service_name}:${secret_name}`.
  const aad = `${accountId}:${service}:${name}`;
  const ciphertext = await encryptSecret(env, value, aad);
  const id = `usec_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO user_secrets (
       id, account_id, secret_name, secret_value_encrypted, secret_type, kind,
       description, service_name, is_active, created_at, updated_at, metadata_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(account_id, secret_name, service_name) DO UPDATE SET
       secret_value_encrypted = excluded.secret_value_encrypted,
       secret_type = excluded.secret_type,
       kind = excluded.kind,
       description = excluded.description,
       is_active = 1,
       updated_at = excluded.updated_at,
       metadata_json = excluded.metadata_json`,
  )
    .bind(
      id,
      accountId,
      name,
      ciphertext,
      secretType === "credential" ? "credential" : secretType,
      kind,
      description,
      service,
      now,
      now,
      JSON.stringify({
        key_version: 1,
        aad_bound: true,
        source: STUDIO_VAULT_ACTOR,
        kind,
        last4: last4(value),
      }),
    )
    .run();

  const row = await env.DB.prepare(
    `SELECT id FROM user_secrets WHERE account_id = ? AND secret_name = ? AND service_name = ?`,
  )
    .bind(accountId, name, service)
    .first();

  await audit(env, {
    secret_id: row?.id || id,
    account_id: accountId,
    event_type: "created",
    new_last4: last4(value),
    notes: `service=${service}`,
  });

  return json({
    ok: true,
    id: row?.id || id,
    service,
    name,
    last4: last4(value),
  });
}

async function handleDelete(env, accountId, secretId) {
  const existing = await env.DB.prepare(
    `SELECT id FROM user_secrets WHERE id = ? AND account_id = ?`,
  )
    .bind(secretId, accountId)
    .first();
  if (!existing) return json({ ok: false, error: "not found" }, 404);

  await env.DB.prepare(
    `UPDATE user_secrets SET is_active = 0, updated_at = unixepoch() WHERE id = ? AND account_id = ?`,
  )
    .bind(secretId, accountId)
    .run();

  await audit(env, {
    secret_id: secretId,
    account_id: accountId,
    event_type: "revoked",
    notes: "soft-revoke",
  });

  return json({ ok: true, id: secretId, revoked: true });
}

/** Internal decrypt-for-use — never expose via public docs as a browser API. */
async function handleUnwrap(env, accountId, body) {
  const secretId = String(body.id || body.secret_id || "").trim();
  if (!secretId) return json({ ok: false, error: "id required" }, 400);

  const row = await env.DB.prepare(
    `SELECT id, secret_name, service_name, secret_value_encrypted, is_active
     FROM user_secrets WHERE id = ? AND account_id = ?`,
  )
    .bind(secretId, accountId)
    .first();

  if (!row || !row.is_active) return json({ ok: false, error: "not found" }, 404);

  const aad = `${accountId}:${row.service_name}:${row.secret_name}`;
  let plaintext;
  try {
    plaintext = await decryptSecret(env, row.secret_value_encrypted, aad);
  } catch (err) {
    await audit(env, {
      secret_id: secretId,
      account_id: accountId,
      event_type: "failed_decrypt",
      notes: String(err).slice(0, 200),
    });
    return json({ ok: false, error: "decrypt_failed" }, 500);
  }

  await env.DB.prepare(
    `UPDATE user_secrets SET last_used_at = unixepoch(), usage_count = COALESCE(usage_count,0) + 1
     WHERE id = ? AND account_id = ?`,
  )
    .bind(secretId, accountId)
    .run();

  await audit(env, {
    secret_id: secretId,
    account_id: accountId,
    event_type: "decrypted_for_use",
    new_last4: last4(plaintext),
    notes: "unwrap",
  });

  // Returned only to authorized server callers (API key). UI must never call this.
  return json({
    ok: true,
    id: secretId,
    service: row.service_name,
    name: row.secret_name,
    value: plaintext,
    last4: last4(plaintext),
  });
}

const SERVICE_TO_PROVIDER = Object.freeze(
  Object.fromEntries(
    PROVIDER_REGISTRY.list()
      .filter((p) => p.credential?.kind === "provider_api_key" || p.id === "cloudflare")
      .flatMap((p) => {
        const aliases = [p.id];
        if (p.id === "xai") aliases.push("grok");
        if (p.id === "gemini") aliases.push("google");
        return aliases.map((alias) => [alias, p.id === "xai" ? "grok" : p.id]);
      }),
  ),
);

const INVENTORY_PROVIDER_IDS = Object.freeze([
  ...new Set(
    PROVIDER_REGISTRY.list()
      .filter((p) => p.credential?.kind === "provider_api_key" || p.id === "cloudflare")
      .map((p) => (p.id === "xai" ? "grok" : p.id)),
  ),
]);

async function loadVaultCredentialsForAccount(env, accountId) {
  const { results } = await env.DB.prepare(
    `SELECT id, secret_name, service_name, secret_value_encrypted
     FROM user_secrets
     WHERE account_id = ? AND is_active = 1
     ORDER BY updated_at DESC
     LIMIT 100`,
  )
    .bind(accountId)
    .all();

  const byProvider = new Map();
  for (const row of results || []) {
    const providerId = SERVICE_TO_PROVIDER[String(row.service_name || '').toLowerCase()];
    if (!providerId || byProvider.has(providerId)) continue;
    const aad = `${accountId}:${row.service_name}:${row.secret_name}`;
    try {
      const value = await decryptSecret(env, row.secret_value_encrypted, aad);
      const entry = { value, source: 'user_vault' };
      if (providerId === 'cloudflare') {
        entry.cloudflare_account_id = env.CLOUDFLARE_ACCOUNT_ID || null;
      }
      byProvider.set(providerId, entry);
    } catch (err) {
      console.error('vault_inventory_decrypt_failed', providerId, String(err));
    }
  }
  return byProvider;
}

function platformCredentials(env) {
  const map = new Map();
  const put = (providerId, value, extra = {}) => {
    if (!value || !String(value).trim()) return;
    if (map.has(providerId)) return;
    map.set(providerId, { value: String(value).trim(), source: 'platform', ...extra });
  };
  put('openai', env.OPENAI_API_KEY);
  put('anthropic', env.ANTHROPIC_API_KEY);
  put('gemini', env.GEMINI_API_KEY);
  put('grok', env.XAI_API_KEY);
  put('cursor', env.CURSOR_API_KEY);
  put('cloudflare', env.CLOUDFLARE_API_TOKEN, {
    cloudflare_account_id: env.CLOUDFLARE_ACCOUNT_ID || null,
  });
  return map;
}

async function handleLlmInventory(env, userId, request) {
  const includePlatform = new URL(request.url).searchParams.get('include_platform') !== '0';
  const vault = await loadVaultCredentialsForAccount(env, userId);
  const platform = includePlatform ? platformCredentials(env) : new Map();
  const merged = new Map();
  for (const [id, row] of vault.entries()) merged.set(id, row);
  for (const [id, row] of platform.entries()) {
    if (!merged.has(id)) merged.set(id, row);
  }

  // Worker stays boundary-safe: return credential provenance only (no root src import).
  // Live model discovery for Studio UI uses the Nitro/TanStack inventory route.
  // Cloudflare counts as configured when the Workers AI binding is present,
  // even with no API token — chat routes through env.AGENTSAM_WAI (platform).
  const providers = INVENTORY_PROVIDER_IDS.map((id) => {
    const row = merged.get(id);
    const viaWorkersAI = id === 'cloudflare' && Boolean(env.AGENTSAM_WAI);
    return {
      id,
      configured: Boolean(row?.value) || viaWorkersAI,
      source: row?.source || (viaWorkersAI ? 'platform' : null),
    };
  });

  return json({
    ok: true,
    user_id: userId,
    schemaVersion: 'agentsam-model-inventory-v3',
    authority: 'per_credential_provider_discovery',
    credential_plane: vault.size ? (platform.size ? 'mixed' : 'studio_vault') : 'platform',
    providers,
    availableModels: [],
    discovery: Object.fromEntries(providers.map((p) => [p.id, {
      attempted: false,
      ok: false,
      error: p.configured ? 'discover_via_studio_inventory_route' : null,
      returnedModelCount: 0,
    }])),
    note: 'Worker inventory returns vault/platform credential provenance. Call Studio /api/llm/inventory for live model discovery.',
  });
}

export default {
  ...nitroWorker,
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const isVault = url.pathname.startsWith("/api/vault/");
    const isLlmInventory = url.pathname === "/api/llm/inventory";
    const isCfConnection = isCloudflareConnectionPath(url.pathname);
    const isConnectionsRegistry = url.pathname === "/api/connections";
    const isPluginToolExecute = url.pathname === "/api/plugins/tools/execute";

    // Public marketing/docs: WEBSITE_ASSETS R2 SSOT (Worker ASSETS = bootstrap only)
    if (request.method === "GET" && isPublicSitePath(url.pathname)) {
      const page = await servePublicSitePage(request, env, url.pathname, {
        siteSlug: "agentsam-sdk",
      });
      if (page) return page;
      // `/` keeps the edge-partial homepage fallback if R2 + static assets are missing
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return serveCanonicalHomepage(request, env);
      }
    }

    if (request.method === "GET" && Object.hasOwn(INSTALL_APP_TARGETS, url.pathname)) {
      return serveInstallScript(url.pathname);
    }

    // Legacy canonical homepage path (assets missing for public-site router)
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return serveCanonicalHomepage(request, env);
    }

    // The checked-in Worker owns vault + health + llm inventory. Everything else belongs
    // to the generated Nitro application handler.
    if (isCfConnection) {
      return handleCloudflareConnectionRequest(request, env, {
        defaultCapabilities: LOCAL_STUDIO_CLOUDFLARE_CAPABILITIES,
      });
    }

    // Identity package owns auth pages, auth API, OAuth, and company branding.
    if (isIdentityPath(url.pathname)) {
      return handleIdentityWorkerRequest(request, env, {
        app: APP,
        routeRegistry: ROUTE_REGISTRY,
      });
    }

    // Studio CMS API endpoints
    if (url.pathname.startsWith("/api/cms/")) {
      return handleCmsWorkerRequest(request, env);
    }

    // Gate authenticated Studio app routes from the app manifest mounts.
    if (request.method === "GET" && isProtectedAppPath(url.pathname)) {
      try {
        const identity = createIdentityService({
          adapter: createCloudflareD1Adapter(env.DB),
          app: APP,
          routeRegistry: ROUTE_REGISTRY,
        });
        const ctx = await identity.sessionFromRequest(request);
        if (!ctx) {
          const next = encodeURIComponent(url.pathname + url.search);
          return Response.redirect(
            `${url.origin}${LOGIN_PATH}?next=${next}`,
            302,
          );
        }
      } catch (err) {
        console.error("session_gate_error", String(err));
      }
    }

    // Authenticated identity for Studio routes. Resolved lazily (single D1
    // session lookup, skipped entirely when no Cookie header is present) so
    // static-asset traffic through the Worker pays nothing.
    let sessionUserId;
    async function sessionUser() {
      if (sessionUserId === undefined) sessionUserId = await resolveSessionUserId(request, env);
      return sessionUserId;
    }

    if (isConnectionsRegistry) {
      if (request.method !== "GET") {
        return json({ ok: false, error: "method_not_allowed" }, 405, {
          allow: "GET",
        });
      }
      const userId = await sessionUser();
      if (!userId) return json({ ok: false, error: "unauthorized" }, 401);
      try {
        return json({ ok: true, ...(await loadConnectionsRegistry(env, userId)) });
      } catch (err) {
        console.error("connections_registry_error", String(err));
        return json({ ok: false, error: "internal_error" }, 500);
      }
    }

    if (isPluginToolExecute) {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method_not_allowed" }, 405, { allow: "POST" });
      }
      const userId = await sessionUser();
      if (!userId) return json({ ok: false, error: "unauthorized" }, 401);
      const body = await request.json().catch(() => ({}));
      const toolKey = String(body?.tool_key || "").trim();
      if (!toolKey) return json({ ok: false, error: "tool_key_required" }, 400);
      try {
        const runtime = await createLocalStudioPluginRuntime(env, userId, {
          authorizeTool: ({ tool }) => ({
            // Registry rows are already account-scoped; the tool contract,
            // not a hard-coded provider allowlist, decides which installed
            // plugin may execute.
            allowed: tool.account_id === userId && Boolean(tool.plugin_key),
          }),
          requireApproval: () => body?.approved === true,
        });
        const result = await runtime.execute(toolKey, body?.arguments || {}, {
          accountId: userId,
          agentRunId: body?.agent_run_id || null,
          conversationId: body?.conversation_id || null,
          callIndex: body?.call_index,
          sourceClient: "local-studio",
        });
        return json({ ok: true, tool_key: toolKey, result });
      } catch (error) {
        const code = String(error?.code || error?.message || "plugin_tool_error");
        const status = code === "AGENTSAM_TOOL_NOT_APPROVED" ? 409 : code.includes("not_found") ? 404 : 400;
        return json({ ok: false, error: code.slice(0, 160) }, status);
      }
    }

    if (!isVault && url.pathname !== "/health") {
      // Nitro-bound Studio chat and model inventory run per-user vault BYOK downstream:
      // bind the client-asserted user to the validated session when one exists.
      if (
        (url.pathname === "/api/chat" && request.method === "POST") ||
        (url.pathname === "/api/llm/inventory" && request.method === "GET")
      ) {
        const sid = await sessionUser();
        if (sid && (request.headers.get("x-user-id") || "").trim() !== sid) {
          const bound = bindSessionUser(request, sid);
          if (bound) request = bound;
        }
      }

      if (isLlmInventory) {
        // Pass through to Nitro/TanStack /api/llm/inventory route for live model discovery.
        // Fall back to worker-level credential provenance if Nitro is not mounted or returns 404.
        if (typeof nitroWorker?.fetch === "function") {
          try {
            const nitroRes = await nitroWorker.fetch(request, env, context);
            if (nitroRes && nitroRes.status !== 404) {
              return nitroRes;
            }
          } catch (err) {
            console.error("nitro_llm_inventory_passthrough_error", String(err));
          }
        }
      } else {
        return nitroWorker.fetch(request, env, context);
      }
    }

    const headers = isVault || isLlmInventory ? vaultCors(request) : {};

    if (isVault && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (isLlmInventory && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // Public liveness only — no DB/vault/OAuth diagnostics.
    if (url.pathname === "/health") {
      return json({ ok: true, app: APP.id, worker: "agentsam-sdk" }, 200);
    }

    // Authenticated diagnostics (bridge or session).
    if (url.pathname === "/api/health/diagnostics") {
      const gate = await requireBridgeKey(request, env);
      const sid = await sessionUser();
      if (!gate.ok && !sid) {
        return json({ ok: false, error: gate.error || "unauthorized" }, gate.status || 401);
      }
      let d1 = false;
      try {
        await env.DB.prepare("SELECT 1 AS ok").first();
        d1 = true;
      } catch {
        d1 = false;
      }
      let vaultKey = false;
      let vaultKeyError = null;
      try {
        await importVaultMasterKey(env.VAULT_MASTER_KEY);
        vaultKey = true;
      } catch (err) {
        vaultKeyError = String(err?.message || err).slice(0, 120);
      }
      const inneranimalmedia = await probeInnerAnimalMediaOAuth(env);
      return json({
        ok: true,
        app: APP.id,
        worker: "agentsam-sdk",
        d1,
        database: env.D1_DATABASE_NAME || null,
        vault_key: vaultKey,
        vault_key_error: vaultKeyError,
        service_auth: {
          agentsam_bridge: Boolean(env.AGENTSAM_BRIDGE_KEY),
        },
        identity: {
          inneranimalmedia: inneranimalmedia.healthy,
          oauth: inneranimalmedia,
        },
        connections: {
          cloudflare: {
            configured: resolveCloudflareOAuthClient(env).productionReady,
          },
        },
      });
    }

    // GET /api/llm/inventory: session or AGENTSAM_BRIDGE_KEY. Session account wins.
    if (isLlmInventory && request.method === "GET") {
      const gate = await requireBridgeKey(request, env);
      const sid = await sessionUser();
      if (!gate.ok && !sid) return json({ ok: false, error: gate.error }, gate.status, headers);
      const userId = sid || (request.headers.get("x-user-id") || "").trim();
      if (!userId || userId.length < 3) {
        return json({ ok: false, error: "account_id required (session or X-User-Id)" }, 400, headers);
      }
      try {
        const res = await handleLlmInventory(env, userId, request);
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      } catch (err) {
        console.error("studio_vault_error", String(err));
        return json({ ok: false, error: "internal_error", detail: String(err).slice(0, 200) }, 500, headers);
      }
    }

    // Vault + mint: session or bridge. Session account wins over X-User-Id.
    const sessionId = await sessionUser();
    const gate = await requireBridgeKey(request, env);
    if (!sessionId && !gate.ok) {
      return json({ ok: false, error: gate.error }, gate.status, headers);
    }

    const headerUser = (request.headers.get("x-user-id") || "").trim();
    const userId = sessionId || headerUser;
    if (!userId || userId.length < 3) {
      return json({ ok: false, error: "account_id required (session or X-User-Id)" }, 400, headers);
    }

    try {
      if (url.pathname === "/api/vault/secrets" && request.method === "GET") {
        const res = await handleList(env, userId);
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      if (url.pathname === "/api/vault/secrets" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const res = await handleCreate(env, userId, body);
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      if (url.pathname === "/api/vault/credentials" && request.method === "GET") {
        const credentials = await listStudioCredentials(env, userId);
        return json({ ok: true, count: credentials.length, credentials }, 200, headers);
      }

      if (url.pathname === "/api/vault/credentials" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const kind =
          String(body.kind || body.owner || "").trim().toLowerCase() === "service"
            ? "service"
            : "account";
        let expiresAtUnix = null;
        const exp = String(body.expiration || body.expires || "").trim().toLowerCase();
        if (exp === "30d" || exp === "30 days") expiresAtUnix = Math.floor(Date.now() / 1000) + 30 * 86400;
        else if (exp === "90d" || exp === "90 days") expiresAtUnix = Math.floor(Date.now() / 1000) + 90 * 86400;
        else if (exp === "1y" || exp === "1 year") expiresAtUnix = Math.floor(Date.now() / 1000) + 365 * 86400;
        const minted = await mintStudioCredential(env, {
          accountId: userId,
          kind,
          name: body.name || body.label || "",
          clientType: body.client_type || body.clientType,
          expiresAtUnix,
          mintedBy: STUDIO_VAULT_ACTOR,
        });
        return json(
          {
            ok: true,
            credential: {
              id: minted.id,
              name: minted.name,
              kind: minted.kind,
              env: minted.env,
              prefix: minted.prefix,
              client_type: minted.client_type,
              created_at_unix: minted.created_at_unix,
              expires_at_unix: minted.expires_at_unix,
            },
            secret_once: minted.secret_once,
            env: minted.env,
          },
          200,
          headers,
        );
      }

      const delCred = url.pathname.match(/^\/api\/vault\/credentials\/([^/]+)$/);
      if (delCred && request.method === "DELETE") {
        const result = await revokeStudioCredential(env, {
          accountId: userId,
          credentialId: decodeURIComponent(delCred[1]),
        });
        return json({ ok: result.ok, revoked_at_unix: result.revoked_at_unix }, result.ok ? 200 : 404, headers);
      }

      if (url.pathname === "/api/vault/unwrap" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const res = await handleUnwrap(env, userId, body);
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      const del = url.pathname.match(/^\/api\/vault\/secrets\/([^/]+)$/);
      if (del && request.method === "DELETE") {
        const res = await handleDelete(env, userId, decodeURIComponent(del[1]));
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      return json({ ok: false, error: "not_found" }, 404, headers);
    } catch (err) {
      console.error("studio_vault_error", String(err));
      return json({ ok: false, error: "internal_error", detail: String(err).slice(0, 200) }, 500, headers);
    }
  },
};
