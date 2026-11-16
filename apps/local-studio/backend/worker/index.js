import nitroWorker from "../../.output/server/index.mjs";
import { serveCadChessAsset } from "./cad-chess-assets.js";
import { handleStudioNotifications } from "./studio-notifications.js";
import { handleStudioConversationShares, handlePublicConversationShare } from "./studio-conversation-shares.js";
import { handleStudioQueueObservability } from "./studio-queue-observability.js";
import { serveStudioNavigationAsset } from "./studio-navigation-asset.js";
import { serveDesignCanvasAdminRoute } from "./design-canvas-admin-route.js";
import { resolveStudioSessionUser, guardStudioDocumentSession, guardStudioAdminBoundary } from "./studio-session.js";
import { resolveStudioGoalsCliAccount } from "./studio-goals-auth.js";
import { serveIncludedWasmAsset } from "./included-wasm-assets.js";
import installScript from "../../../../scripts/install.sh";
import { handleCloudflareConnectionRequest, isCloudflareConnectionPath } from "../../../../packages/connectors/cfoa/src/routes.js";
import { resolveCloudflareOAuthClient } from "../../../../packages/connectors/cfoa/src/index.js";
import { handleIdentityWorkerRequest } from "../../../../packages/identity/src/server/worker-router.js";
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
  createCredentialResolver,
} from "../../../../packages/agentsam-vault/src/index.js";
import {
  collectCredentialScopedInventory,
  sanitizeInventoryForClient,
} from "@inneranimalmedia/agentsam-sdk/models/inventory";
import { runStudioCmsAssistant } from "./studio-cms-assistant.js";
import { mergeBoundWorkersAIInventory } from "./bound-workers-inventory.js";
import { handleCmsWorkerRequest } from "./cms-service.js";
import { serveCanonicalHomepage } from "./canonical-homepage.js";
import { isPublicSitePath, publicSitePathForRequest, servePublicSitePage } from "./public-site.js";
import { handlePublicConfigRequest } from "./public-config.js";
import { handleGoogleDesktopExchangeRequest } from "./goaude.js";
import {
  handleGoogleCliCloudRequest,
  isGoogleCliCloudCallbackRequest,
  isGoogleCliCloudPath,
} from "./gclioa.js";
import { loadConnectionsRegistry, safePluginSettingsRecord } from "./connections-registry.js";
import { readAccountSideStageCatalog, updateAccountSideStage } from "./plugin-side-stages.js";
import { handleDatabaseRequest, isDatabaseRequest } from "./database-service.js";
import { handleWorkRequest, isWorkRequest } from "./work-service.js";
import { handleStudioChatHistory } from "./studio-chat-history.js";
import {handleOpenScadLibraries} from "./cad-openscad-libraries.js";
import { canonicalStudioPath, isStudioAdminPath, resolveLegacyContentMediaPath, STUDIO_ADMIN_PRERENDERED_ROUTES } from "../../shared/studio-admin-routes.mjs";
import { handleKnowledgeNodeApiRequest } from "./knowledge-node-api.js";
import { completeGmailOAuth, isGmailOAuthCallbackRequest } from "./gmail-service.js";
import { completeConnectorOAuth, isConnectorOAuthCallbackRequest } from "./connector-oauth.js";
import { createLocalStudioPluginRuntime, loadPluginRegistry, updateLocalStudioPluginPreferences } from "./plugin-registry.js";
import { listCatalogForAccount, installFromCatalog, removeCatalogInstallation } from "./plugin-discovery.js";
import { beginPluginOAuth, completePluginOAuth, disconnectPublicPlugin, pluginOAuthReturnUrl } from "./plugin-oauth.js";
import { handleStudioSkills } from "./studio-skills.js";
import { handleStudioMcps } from "./studio-mcps.js";
import { handleStudioRules } from "./studio-rules.js";
import { handleStudioAgentSettings } from "./studio-agents-settings.js";
import { handleStudioUserPreferences, handleStudioAccountAvatar, handleStudioCompanionSettings } from "./studio-user-preferences.js";
import { handleStudioLivingPlan } from "./studio-living-plan.js";
import { handleStudioStorageSettings } from "./studio-storage-settings.js";
import { handleStudioNotificationSettings } from "./studio-notification-settings.js";
import { readPluginWorkspace } from "./plugin-workspace.js";
import { emitAnalyticsFact } from "./analytics-service.js";
import { handleAnalyticsQueryRequest } from "./analytics-query-service.js";
import { queryAccountToolUsage } from "./analytics-tool-usage-v2.js";
import {
  mintStudioCredential,
  listStudioCredentials,
  revokeStudioCredential,
} from "./agentsam-credentials-mint.js";
import localStudioApp from "../../agentsam.app.json";
import cadCreatorApp from "../../../cad-creator/agentsam.app.json";
import ecommerceApp from "../../../ecommerce-cms-agentsam/agentsam.app.json";
import goalGuruApp from "../../../../packages/agentsam-goalguru/agentsam.app.json";
import { handleStudioPlatformProducts } from "./studio-platform-products.js";
import { handleStudioSitesOverview } from "./studio-sites-overview.js";
import { handleStudioThemeDrafts } from "./studio-theme-drafts.js";
import { handleStudioWebsiteThemeCatalog } from "./studio-website-theme-catalog.js";
import { handleStudioWebsiteThemeInstall } from "./studio-website-theme-install.js";
import { handleStudioThemes } from "./studio-themes.js";
import { handleStudioNavigation } from "./studio-navigation-preferences.js";
import { listLauncherApps, installNativeAdminApp, removeNativeAdminApp, setNativeAdminAppEnabled, setNativeAdminAppPinned, touchNativeAdminAppOpened } from "./apps-launcher.js";
import { listBrowserHistory, recordBrowserVisit, removeBrowserHistoryEntry } from "./browser-history.js";
import { listEmbedPolicy, listTrustedOrigins, trustOrigin, untrustOrigin } from "./browser-trust.js";
import { handleBrowserPage } from "./browser-page.js";
import { handleAgentSamFormsApi, handleAgentSamFormsPublic } from "./agentsam-forms.js";
import { servePackagedConsole, shouldServeProductCatalogView } from "./packaged-console.js";
import { handleAdminApi as handleEcommerceAdminApi } from "../../../ecommerce-cms-agentsam/backend/admin/api.js";
import { handleStudioContentMediaApi } from "./content-media-api.js";
import { handlePlatformMediaRead } from "./platform-media-library.js";
import { handleCompletefulWebhook } from "../../../ecommerce-cms-agentsam/backend/webhooks/completeful.js";
import { serveCatalogImage } from "../../../ecommerce-cms-agentsam/backend/completeful/images.js";

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
    pathname.startsWith("/api/oauth/") ||
    pathname === "/api/account" ||
    pathname.startsWith("/api/account/")
  );
}

function isProtectedAppPath(pathname) {
  return mountRequiresAuth(pathname, APP);
}

function isLocalStudioCommerceApi(pathname) {
  return pathname === "/api/admin/overview"
    || pathname === "/api/admin/me"
    || pathname === "/api/admin/products"
    || /^\/api\/admin\/collections(?:\/[A-Za-z0-9_-]+(?:\/items)?)?$/.test(pathname)
    || /^\/api\/admin\/(?:products\/\d+(?:\/variants|\/images(?:\/\d+(?:\/primary)?)?)?|variants\/\d+(?:\/inventory)?|inventory|collections)$/.test(pathname)
    || pathname === "/api/admin/platform/bindings"
    || pathname === "/api/admin/media" || pathname.startsWith("/api/admin/media/")
    || pathname.startsWith("/api/admin/assets/")
    || pathname.startsWith("/api/admin/growth/")
    || pathname.startsWith("/api/admin/product-studio/")
    || pathname.startsWith("/api/admin/completeful/")
    || pathname.startsWith("/api/admin/cms/")
    || pathname.startsWith("/api/admin/agentsam/")
    || pathname.startsWith("/api/admin/theme-editor/")
    || pathname.startsWith("/api/admin/store/");
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
  ecommerceApp,
  goalGuruApp,
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
const STUDIO_VAULT_ACTOR = APP.id;

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
 * auth_sessions). Browser requests use the cookie; installed desktop requests
 * use the Keychain-backed Bearer session. Returns null when neither credential
 * is present or the session is missing/expired/revoked.
 */
async function resolveSessionUser(request, env) {
  return resolveStudioSessionUser(request, env, { app: APP, routeRegistry: ROUTE_REGISTRY });
}

async function guardStudioDocument(request, env) {
  return guardStudioDocumentSession(request, {
    resolveUser: () => resolveSessionUserId(request, env), loginPath: LOGIN_PATH,
  });
}

async function resolveSessionUserId(request, env) {
  return (await resolveSessionUser(request, env))?.id || null;
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
        vault_item_id: r.id,
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
  const known = await env.DB.prepare("SELECT 1 AS ok FROM agentsam_service_registry WHERE service_name = ?").bind(service).first();
  if (!known) return json({ ok: false, error: "provider_not_available" }, 400);

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
    vault_item_id: row?.id || id,
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

/**
 * Server-side vault resolution for identity-owned outbound capabilities
 * (transactional email). The company row names WHICH account's vault holds the
 * credential (meta.credentials.<purpose>.vault_account_id); this host only
 * decrypts that account's active row for the requested provider. Precedence and
 * the env compatibility lane come from @inneranimalmedia/agentsam-vault.
 */
function createIdentityCredentialResolver(env) {
  return async function resolveCredential({ provider, accountId }) {
    const resolver = createCredentialResolver({
      env,
      envMap: { resend: "RESEND_API_KEY" },
      async lookupVaultMeta({ provider: service }) {
        if (!accountId || !env.DB) return null;
        const row = await env.DB.prepare(
          `SELECT id, metadata_json FROM user_secrets
           WHERE account_id = ? AND service_name = ? AND is_active = 1
           ORDER BY updated_at DESC LIMIT 1`,
        ).bind(accountId, service).first();
        if (!row?.id) return null;
        let meta = {};
        try { meta = JSON.parse(row.metadata_json || "{}"); } catch { meta = {}; }
        return { ref: row.id, last4: meta.last4 };
      },
      async unwrap(ref) {
        const row = await env.DB.prepare(
          `SELECT id, account_id, secret_name, service_name, secret_value_encrypted
           FROM user_secrets WHERE id = ? AND account_id = ? AND is_active = 1`,
        ).bind(ref, accountId).first();
        if (!row) return null;
        const value = await decryptSecret(env, row.secret_value_encrypted, `${row.account_id}:${row.service_name}:${row.secret_name}`);
        await env.DB.prepare(
          `UPDATE user_secrets SET last_used_at = unixepoch(), usage_count = COALESCE(usage_count,0) + 1 WHERE id = ?`,
        ).bind(row.id).run();
        await audit(env, {
          secret_id: row.id,
          account_id: row.account_id,
          event_type: "decrypted_for_use",
          new_last4: last4(value),
          notes: "identity:email.transactional",
        });
        return value;
      },
    });
    return resolver.resolve({ provider });
  };
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

/**
 * Resolve Completeful BYOK from the existing signed-in AgentSam account vault.
 * Never use a different storefront's database, settings or API key.
 * Decryption uses the same AAD and vault master key as /api/vault/secrets.
 */
async function completefulAccountEnvironment(env, accountId) {
  if (!accountId || !env.DB) return env;
  try {
    const row = await env.DB.prepare(
      "SELECT secret_name, service_name, secret_value_encrypted FROM user_secrets "
      + "WHERE account_id = ? AND service_name = 'completeful' AND is_active = 1 "
      + "ORDER BY updated_at DESC LIMIT 1",
    ).bind(accountId).first();
    if (!row) return { ...env, CAPP_KEY: undefined, COMPLETEFUL_CREDENTIAL_SOURCE: "not_connected" };
    const aad = accountId + ":" + row.service_name + ":" + row.secret_name;
    const key = await decryptSecret(env, row.secret_value_encrypted, aad);
    return { ...env, CAPP_KEY: key, COMPLETEFUL_CREDENTIAL_SOURCE: "account_vault" };
  } catch (error) {
    // Missing/broken vault must not silently switch to another account's key.
    console.error("completeful_vault_resolution_failed", error?.name || "unknown");
    return { ...env, CAPP_KEY: undefined, COMPLETEFUL_CREDENTIAL_SOURCE: "vault_unavailable" };
  }
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
  const includePlatform = new URL(request.url).searchParams.get('include_platform') === '1';
  const vault = await loadVaultCredentialsForAccount(env, userId);
  const platform = includePlatform ? platformCredentials(env) : new Map();
  const merged = new Map();
  for (const [id, row] of vault.entries()) merged.set(id, row);
  for (const [id, row] of platform.entries()) {
    if (!merged.has(id)) merged.set(id, row);
  }

  const credentialPlane = vault.size ? (platform.size ? 'mixed' : 'studio_vault') : 'platform';
  const discovered = await collectCredentialScopedInventory({
    credentialPlane,
    resolveCredential: async (providerId) => {
      const row = merged.get(providerId);
      if (!row?.value) {
        return { configured: false, value: '', source: null, error: null };
      }
      return {
        configured: true,
        value: row.value,
        source: row.source || 'injected',
        account_id: row.cloudflare_account_id || row.account_id || null,
      };
    },
  });
  const inventory = mergeBoundWorkersAIInventory(
    sanitizeInventoryForClient(discovered),
    env.AGENTSAM_WAI,
  );

  return json({
    ok: true,
    user_id: userId,
    account_id: userId,
    ...inventory,
  });
}

export default {
  ...nitroWorker,
  async fetch(request, env, context) {
    const url = new URL(request.url);
    // Signing in (or up) mints the owning principal before any /admin/ shell,
    // script, editor, theme install or mutation is reachable. No site_id needed.
    const adminDenied = await guardStudioAdminBoundary(request, {
      resolveUser: () => resolveSessionUserId(request, env), loginPath: LOGIN_PATH,
    });
    if (adminDenied) return adminDenied;
    // Preserve source distribution under /design-canvas/sources/ while removing
    // the second editor presented at its obsolete app root.
    if ((url.pathname === '/design-canvas/' || url.pathname === '/design-canvas') &&
        (request.method === 'GET' || request.method === 'HEAD')) {
      return new Response(null, {status:302, headers:{
        location:new URL('/canvas?library=sources',url).toString(), 'cache-control':'no-store',
      }});
    }
    const designCanvasAdmin = await serveDesignCanvasAdminRoute(request, env, guardStudioDocument);
    if (designCanvasAdmin) return designCanvasAdmin;
    // Only published forms are exposed publicly; account-owned management uses
    // the existing authenticated /api/forms path further below.
    if (url.pathname.startsWith("/forms/embed/") || url.pathname.startsWith("/api/forms/public/")) {
      const formPage = await handleAgentSamFormsPublic(request, env);
      if (formPage) return formPage;
    }
    const publicShareMatch = /^\/share\/([A-Za-z0-9_-]{40,60})$/.exec(url.pathname);
    if (publicShareMatch) return handlePublicConversationShare(request, env, publicShareMatch[1]);
    if (url.pathname === "/api/studio/conversation-shares" || url.pathname.startsWith("/api/studio/conversation-shares/")) {
      return handleStudioConversationShares(request, env, await resolveSessionUserId(request, env), url);
    }
    const navigationAsset = await serveStudioNavigationAsset(request, env);
    if (navigationAsset) return navigationAsset;
    // Legacy Ecommerce Console login belongs to customer installations, not
    // the hosted AgentSam identity boundary. Never serve its Fuel & Free Time
    // form or submit credentials to the unrelated /api/admin/login endpoint.
    if ((request.method === "GET" || request.method === "HEAD") &&
        (/^\/admin\/login(?:\.html)?\/?$/.test(url.pathname) ||
         /^\/ecommerce-cms-agentsam\/admin\/login(?:\.html)?\/?$/.test(url.pathname))) {
      const canonicalLogin = new URL(url);
      canonicalLogin.pathname = LOGIN_PATH;
      return new Response(null, { status: 302, headers: {
        location: canonicalLogin.toString(), "cache-control": "no-store",
      } });
    }
    // This shared legacy icon URL is embedded in the reusable identity portal;
    // the hosted app's verified brand icon is served from its own asset root.
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/shared/app-icon.png") {
      return new Response(null, { status: 302, headers: {
        location: new URL("/brand/agentsam-local-studio-icon.png", url).toString(),
        "cache-control": "no-store",
      } });
    }
    const includedWasm = await serveIncludedWasmAsset(request, env);
    if (includedWasm) return includedWasm;
    const chessAsset = await serveCadChessAsset(request);
    if (chessAsset) return chessAsset;
    // Public, credential-free derivative of Completeful catalog images. The product UI requests
    // /catalog-image?src=...; the proxy only accepts the allowlisted provider storage host and path.
    if (request.method === "GET" && url.pathname === "/catalog-image") return serveCatalogImage(request, env, context);
    const isQueueObservability = url.pathname === "/api/queues/observability";
    const isVault = url.pathname.startsWith("/api/vault/");
    const isLlmInventory = url.pathname === "/api/llm/inventory";
    const isCfConnection = isCloudflareConnectionPath(url.pathname);
    const isConnectionsRegistry = url.pathname === "/api/connections";
    const isSideStageCatalog = url.pathname === "/api/connections/side-stages";
    const sideStagePreferenceMatch = /^\/api\/connections\/side-stages\/(plg_[a-f0-9]{8,})$/i.exec(url.pathname);
    const isStudioPreferences=url.pathname==="/api/settings/preferences";
    const isStudioStorage=url.pathname==="/api/settings/storage";
    const isStudioAccountAvatar=url.pathname==="/api/settings/account-avatar";
    const isStudioCompanions=url.pathname==="/api/settings/companions";
    const isStudioNotifications=url.pathname==="/api/settings/notifications";
    const isStudioAgentSettings=url.pathname==="/api/settings/agents"
      || url.pathname.startsWith("/api/settings/agents/");
    const isStudioSkills = url.pathname === "/api/settings/skills"
      || url.pathname.startsWith("/api/settings/skills/");
    const isStudioMcps = url.pathname === "/api/settings/mcps"
      || url.pathname.startsWith("/api/settings/mcps/");
    const isStudioRules = url.pathname === "/api/settings/rules"
      || url.pathname.startsWith("/api/settings/rules/");
    const workspaceMatch = /^\/api\/plugins\/(plg_[a-z0-9]+)\/workspace$/i.exec(url.pathname);
    const isAppsLauncher = url.pathname === "/api/apps/launcher";
    const isAppsInstall = url.pathname === "/api/apps/install";
    const isAppsOpen = url.pathname === "/api/apps/open";
    const isBrowserHistory = url.pathname === "/api/browser/history";
    const isBrowserPage = url.pathname === "/api/browser/page";
    const isBrowserSettings = url.pathname === "/api/settings/browser";
    const isPluginCatalog = url.pathname === "/api/plugins/catalog";
    const isPluginInstall = url.pathname === "/api/plugins/install";
    const isPluginOAuthCallback = url.pathname === "/api/plugins/oauth/callback";
    const pluginOAuthMatch = /^\/api\/plugins\/(plg_[a-z0-9]+)\/oauth\/(start|disconnect)$/i.exec(url.pathname);
    const pluginSettingsMatch = /^\/api\/plugins\/([^/]+)$/.exec(url.pathname);
    const isDatabaseApi = isDatabaseRequest(url.pathname);
    const isWorkApi = isWorkRequest(url.pathname);
    const isPluginToolExecute = url.pathname === "/api/plugins/tools/execute";
    const isAnalyticsSmoke = url.pathname === "/api/analytics/smoke";
    const isAnalyticsApi = url.pathname.startsWith("/api/analytics/");
    const isTerminalConnect = url.pathname === "/api/agent/terminal/connect";

    // Flat Local Studio URLs remain compatible document-entry redirects only.
    // Keep query strings and project IDs; do not redirect API or Ecommerce paths.
    if (request.method === "GET" || request.method === "HEAD") {
      const canonical = canonicalStudioPath(url.pathname);
      if (canonical) {
        const target = new URL(url);
        target.pathname = canonical;
        return new Response(null, {
          status: 301,
          headers: { location: target.toString(), 'cache-control': 'private, max-age=300' },
        });
      }
      // Legacy Content /admin/content(?kind=) → first-party Media Library.
      // Prevents packaged-console remounts that bounced valid sessions to login.
      const mediaPath = resolveLegacyContentMediaPath(url.pathname, url.searchParams);
      if (mediaPath) {
        const target = new URL(mediaPath, request.url);
        return new Response(null, {
          status: 302,
          headers: { location: target.toString(), 'cache-control': 'private, no-store' },
        });
      }
      if (url.pathname === '/docs' || url.pathname === '/docs/') {
        const target = new URL('/admin/settings/docs', request.url);
        target.search = url.search;
        return Response.redirect(target, 302);
      }
      if (url.pathname === '/admin/products/help/artwork' || url.pathname === '/admin/products/help/artwork/') {
        const target = new URL('/admin/settings/docs', request.url);
        target.searchParams.set('topic', 'artwork');
        return Response.redirect(target, 302);
      }
    }

    // Legacy Ecommerce email entry is only a compatibility link. The reusable
    // AgentSam Work Mail surface owns the inbox on this host.
    if (request.method === "GET" &&
        (url.pathname === "/admin/email" || url.pathname === "/admin/email.html")) {
      const target = new URL("/mail", request.url);
      target.search = url.search;
      return Response.redirect(target, 302);
    }

    // Retire the duplicate donor Atlas page. Existing deep links lead into
    // the canonical in-app Theme Studio; shared section runtime is retained.
    if (url.pathname === "/admin/revise-atlas" || url.pathname === "/admin/revise-atlas.html") {
      const target=new URL('/admin/theme-editor?catalog=revise',request.url);
      return Response.redirect(target,302);
    }

    // Ecommerce's existing product catalog owns /admin/products. Keep the
    // richer Product Studio on /admin/products/create; never redirect the
    // Products parent into creation. Normalize obsolete or invalid view URLs.
    if ((request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === "/admin/products.html" ||
         (url.pathname === "/admin/products" && !shouldServeProductCatalogView(url)))) {
      const target = new URL("/admin/products", request.url);
      if (!shouldServeProductCatalogView(target)) target.searchParams.delete("view");
      return Response.redirect(target, 302);
    }

    // /sites is a legacy entry URL. The ecommerce CMS owns the canonical
    // store route; keep auth and query state, then send users to that existing UI.
    if ((request.method === "GET" || request.method === "HEAD") &&
        url.pathname === "/sites") {
      const denied = await guardStudioDocument(rfulAccountEnvironment(env, principal.id)
        : env;
      const providerMediaResponse = await handleStudioContentMediaApi(request, env, studioUser, url, context);
      if (providerMediaResponse) return providerMediaResponse;
      if (url.pathname === "/api/admin/agentsam/chat" && request.method === "POST") {
        if (request.headers.get("origin") && request.headers.get("origin") !== url.origin) {
          return json({ ok: false, error: "origin_not_allowed" }, 403);
        }
        const CMS_ASSISTANT_INFERENCE = input => runStudioCmsAssistant(input, {
          workersAI: typeof env.AGENTSAM_WAI?.run === "function",
          signal: request.signal,
          async getInventory() {
            const response = await handleLlmInventory(env, principal.id, request);
            return (await response.json()).availableModels || [];
          },
          sendChat(body) {
            const chat = new Request(new URL("/api/chat", url), {
              method: "POST",
              headers: { "content-type": "application/json", "x-user-id": principal.id },
              body: JSON.stringify(body),
              signal: request.signal,
            });
            return nitroWorker.fetch(chat, env, context);
          },
        });
        try {
          return await handleEcommerceAdminApi(request, { ...commerceEnv, CMS_ASSISTANT_INFERENCE }, url, context, studioUser);
        } catch (error) {
          console.error("studio_cms_assistant_error", error?.message);
          return json({ ok: false, error: "AgentSam could not load the editor conversation. Try again." }, 503);
        }
      }
      return handleEcommerceAdminApi(request, commerceEnv, url, context, studioUser);
    }

    // Public marketing/docs: WEBSITE_ASSETS R2 SSOT (Worker ASSETS = bootstrap only)
    const publicPath = publicSitePathForRequest(request);
    if (request.method === "GET" && isPublicSitePath(publicPath)) {
      const page = await servePublicSitePage(request, env, publicPath);
      if (page) return page;
      // Never substitute another site's homepage when the request hostname has
      // no active cms_sites registration or the site has no published page.
      return new Response("Published site page not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (request.method === "GET" && Object.hasOwn(INSTALL_APP_TARGETS, url.pathname)) {
      return serveInstallScript(url.pathname);
    }

    // Stock public OAuth / issuer config (no secrets) — CLI resolves desktop client from here.
    if (url.pathname === "/api/public-config") {
      return handlePublicConfigRequest(request, env);
    }

    // Gmail resource OAuth callback is public only long enough to redeem the one-time PKCE state.
    if (isGmailOAuthCallbackRequest(request)) {
      return completeGmailOAuth(request, env);
    }

    // Drive / Calendar / GitHub connector callbacks share the same one-time-state redemption.
    if (isConnectorOAuthCallbackRequest(request)) {
      return completeConnectorOAuth(request, env);
    }

    // CLI desktop PKCE token exchange broker (secrets stay on Worker).
    if (url.pathname === "/api/oauth/google/desktop-exchange") {
      return handleGoogleDesktopExchangeRequest(request, env);
    }

    // CLI Google Cloud via Studio Web client (reliable when Desktop PKCE is rejected).
    // Callback shares /api/oauth/google/callback with identity when state is cli_*.
    if (isGoogleCliCloudPath(url.pathname) || isGoogleCliCloudCallbackRequest(request)) {
      return handleGoogleCliCloudRequest(request, env);
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
        app: APP,
        routeRegistry: ROUTE_REGISTRY,
        loginPath: LOGIN_PATH,
      });
    }

    // Identity package owns auth pages, auth API, OAuth, and company branding.
    if (isIdentityPath(url.pathname)) {
      return handleIdentityWorkerRequest(request, env, {
        app: APP,
        routeRegistry: ROUTE_REGISTRY,
        resolveCredential: createIdentityCredentialResolver(env),
      });
    }

    // CMS is account- and site-scoped. These routes run before the generic
    // Studio API gate, so they MUST resolve an IAM session themselves.
    if (url.pathname.startsWith("/api/cms/")) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
      const cmsActorId = await resolveSessionUserId(request, env);
      if (!cmsActorId) return json({ ok: false, error: "unauthorized" }, 401);
      return handleCmsWorkerRequest(request, env, cmsActorId);
    }

    // Canonical React app mounts are served as data-free, pre-rendered
    // document shells, never the Ecommerce's legacy /admin/agentsam.html.
    // The packaged Workbench, CAD and MovieMode route chunks hydrate in-place.
    // This also avoids the Cloudflare-only Nitro SSR 500 for these app routes.
    if ((request.method === "GET" || request.method === "HEAD") &&
        (STUDIO_ADMIN_PRERENDERED_ROUTES.includes(url.pathname) ||
         url.pathname === "/mail" ||
         url.pathname === "/artifacts" ||
         url.pathname === "/artifacts/tickets" ||
         url.pathname === "/tickets" ||
         url.pathname === "/themes")) {
      const denied = await guardStudioDocument(request, env);
      if (denied) return denied;
      const assetUrl=new URL(request.url);
      // Both /admin/* mounts and Work package top-level routes hydrate the
      // same canonical React app; no legacy HTML donor is introduced.
      const shellRoute=url.pathname.startsWith("/admin/")
        ? url.pathname.slice("/admin".length) : url.pathname;
      assetUrl.pathname="/studio-app-shell"+shellRoute+"/";
      assetUrl.search="";
      const shell=await env.ASSETS.fetch(new Request(assetUrl,{method:"GET"}));
      if(!shell.ok)return json({ok:false,error:"studio_app_shell_unavailable"},503);
      const headers=new Headers(shell.headers);
      headers.set("content-type","text/html; charset=utf-8");
      headers.set("cache-control","private, no-store");
      headers.delete("content-length");
      return new Response(request.method==="HEAD"?null:shell.body,{status:200,headers});
    }

    // Settings are served as build-generated, canonical React route shells.
    // The browser hydrates the installed Settings package normally. This
    // isolates Cloudflare's Settings-only Nitro SSR failure without creating
    // a separate editor, storing fake preferences or exposing account data.
    if ((request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === "/admin/settings" || url.pathname.startsWith("/admin/settings/"))) {
      const unit=url.pathname.split("/").filter(Boolean)[2] || "general";
      const allowed=new Set(["general","agents","customize","design","git-prs",
        "codebase","network","runtime","themes","storage","keys","usage",
        "notifications","docs","integrations","skills"]);
      if(url.pathname === "/admin/settings" || !allowed.has(unit))
        return Response.redirect(new URL("/admin/settings/general",request.url),302);
      const denied = await guardStudioDocument(request, env);
      if (denied) return denied;
      const assetUrl=new URL(request.url);
      assetUrl.pathname="/studio-settings-shell/"+unit+"/";
      assetUrl.search="";
      const shell=await env.ASSETS.fetch(new Request(assetUrl,{method:"GET"}));
      if(!shell.ok)return json({ok:false,error:"settings_sheigin") !== url.origin) {
          return json({ ok: false, error: "origin_not_allowed" }, 403);
        }
        const CMS_ASSISTANT_INFERENCE = input => runStudioCmsAssistant(input, {
          workersAI: typeof env.AGENTSAM_WAI?.run === "function",
          signal: request.signal,
          async getInventory() {
            const response = await handleLlmInventory(env, principal.id, request);
            return (await response.json()).availableModels || [];
          },
          sendChat(body) {
            const chat = new Request(new URL("/api/chat", url), {
              method: "POST",
              headers: { "content-type": "application/json", "x-user-id": principal.id },
              body: JSON.stringify(body),
              signal: request.signal,
            });
            return nitroWorker.fetch(chat, env, context);
          },
        });
        try {
          return await handleEcommerceAdminApi(request, { ...commerceEnv, CMS_ASSISTANT_INFERENCE }, url, context, studioUser);
        } catch (error) {
          console.error("studio_cms_assistant_error", error?.message);
          return json({ ok: false, error: "AgentSam could not load the editor conversation. Try again." }, 503);
        }
      }
      return handleEcommerceAdminApi(request, commerceEnv, url, context, studioUser);
    }

    // Public marketing/docs: WEBSITE_ASSETS R2 SSOT (Worker ASSETS = bootstrap only)
    const publicPath = publicSitePathForRequest(request);
    if (request.method === "GET" && isPublicSitePath(publicPath)) {
      const page = await servePublicSitePage(request, env, publicPath);
      if (page) return page;
      // Never substitute another site's homepage when the request hostname has
      // no active cms_sites registration or the site has no published page.
      return new Response("Published site page not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (request.method === "GET" && Object.hasOwn(INSTALL_APP_TARGETS, url.pathname)) {
      return serveInstallScript(url.pathname);
    }

    // Stock public OAuth / issuer config (no secrets) — CLI resolves desktop client from here.
    if (url.pathname === "/api/public-config") {
      return handlePublicConfigRequest(request, env);
    }

    // Gmail resource OAuth callback is public only long enough to redeem the one-time PKCE state.
    if (isGmailOAuthCallbackRequest(request)) {
      return completeGmailOAuth(request, env);
    }

    // Drive / Calendar / GitHub connector callbacks share the same one-time-state redemption.
    if (isConnectorOAuthCallbackRequest(request)) {
      return completeConnectorOAuth(request, env);
    }

    // CLI desktop PKCE token exchange broker (secrets stay on Worker).
    if (url.pathname === "/api/oauth/google/desktop-exchange") {
      return handleGoogleDesktopExchangeRequest(request, env);
    }

    // CLI Google Cloud via Studio Web client (reliable when Desktop PKCE is rejected).
    // Callback shares /api/oauth/google/callback with identity when state is cli_*.
    if (isGoogleCliCloudPath(url.pathname) || isGoogleCliCloudCallbackRequest(request)) {
      return handleGoogleCliCloudRequest(request, env);
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
        app: APP,
        routeRegistry: ROUTE_REGISTRY,
        loginPath: LOGIN_PATH,
      });
    }

    // Identity package owns auth pages, auth API, OAuth, and company branding.
    if (isIdentityPath(url.pathname)) {
      return handleIdentityWorkerRequest(request, env, {
        app: APP,
        routeRegistry: ROUTE_REGISTRY,
        resolveCredential: createIdentityCredentialResolver(env),
      });
    }

    // CMS is account- and site-scoped. These routes run before the generic
    // Studio API gate, so they MUST resolve an IAM session themselves.
    if (url.pathname.startsWith("/api/cms/")) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
      const cmsActorId = await resolveSessionUserId(request, env);
      if (!cmsActorId) return json({ ok: false, error: "unauthorized" }, 401);
      return handleCmsWorkerRequest(request, env, cmsActorId);
    }

    // Canonical React app mounts are served as data-free, pre-rendered
    // document shells, never the Ecommerce's legacy /admin/agentsam.html.
    // The packaged Workbench, CAD and MovieMode route chunks hydrate in-place.
    // This also avoids the Cloudflare-only Nitro SSR 500 for these app routes.
    if ((request.method === "GET" || request.method === "HEAD") &&
        (STUDIO_ADMIN_PRERENDERED_ROUTES.includes(url.pathname) ||
         url.pathname === "/mail" ||
         url.pathname === "/artifacts" ||
         url.pathname === "/artifacts/tickets" ||
         url.pathname === "/tickets" ||
         url.pathname === "/themes")) {
      const denied = await guardStudioDocument(request, env);
      if (denied) return denied;
      const assetUrl=new URL(request.url);
      // Both /admin/* mounts and Work package top-level routes hydrate the
      // same canonical React app; no legacy HTML donor is introduced.
      const shellRoute=url.pathname.startsWith("/admin/")
        ? url.pathname.slice("/admin".length) : url.pathname;
      assetUrl.pathname="/studio-app-shell"+shellRoute+"/";
      assetUrl.search="";
      const shell=await env.ASSETS.fetch(new Request(assetUrl,{method:"GET"}));
      if(!shell.ok)return json({ok:false,error:"studio_app_shell_unavailable"},503);
      const headers=new Headers(shell.headers);
      headers.set("content-type","text/html; charset=utf-8");
      headers.set("cache-control","private, no-store");
      headers.delete("content-length");
      return new Response(request.method==="HEAD"?null:shell.body,{status:200,headers});
    }

    // Settings are served as build-generated, canonical React route shells.
    // The browser hydrates the installed Settings package normally. This
    // isolates Cloudflare's Settings-only Nitro SSR failure without creating
    // a separate editor, storing fake preferences or exposing account data.
    if ((request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === "/admin/settings" || url.pathname.startsWith("/admin/settings/"))) {
      const unit=url.pathname.split("/").filter(Boolean)[2] || "general";
      const allowed=new Set(["general","agents","customize","design","git-prs",
        "codebase","network","runtime","themes","storage","keys","usage",
        "notifications","docs","integrations","skills"]);
      if(url.pathname === "/admin/settings" || !allowed.has(unit))
        return Response.redirect(new URL("/admin/settings/general",request.url),302);
      const denied = await guardStudioDocument(request, env);
      if (denied) return denied;
      const assetUrl=new URL(request.url);
      assetUrl.pathname="/studio-settings-shell/"+unit+"/";
      assetUrl.search="";
      const shell=await env.ASSETS.fetch(new Request(assetUrl,{method:"GET"}));
      if(!shell.ok)return json({ok:false,error:"settings_shell_unavailable"},503);
      const headers=new Headers(shell.headers);
      headers.set("content-type","text/html; charset=utf-8");
      headers.set("cache-control","private, no-store");
      headers.delete("content-length");
      return new Response(request.method === "HEAD" ? null : shell.body,{
        status:200,headers,
      });
    }

    // Gate authenticated Studio app routes from the app manifest mounts.
    if (request.method === "GET" && isProtectedAppPath(url.pathname)) {
      const denied = await guardStudioDocument(request, env);
      if (denied) return denied;
    }

    // Authenticated identity for Studio routes. Resolved lazily (single D1
    // session lookup, skipped entirely when no Cookie header is present) so
    // static-asset traffic through the Worker pays nothing.
    let sessionUserId;
    async function sessionUser() {
      if (sessionUserId === undefined) sessionUserId = await resolveSessionUserId(request, env);
      return sessionUserId;
    }

    if(workspaceMatch) {
      if(request.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
      const accountId=await sessionUser();
      if(!accountId)return json({ok:false,error:"unauthorized"},401);
      try{
        const response=await readPluginWorkspace(env,accountId,workspaceMatch[1]);
        return json({ok:true,...response},200,{"cache-control":"no-store"});
      }catch(error){
        const code=String(error?.message||"plugin_workspace_unavailable");
        return json({ok:false,error:code.slice(0,120)},code.includes("not_connected")?409:400);
      }
    }
    if(isStudioAccountAvatar) {
      try{return await handleStudioAccountAvatar(request,env,await sessionUser());}
      catch(error){
        console.warn("studio_account_avatar_error",String(error?.message||error).slice(0,120));
        return json({ok:false,error:"account_avatar_unavailable"},503);
      }
    }
    if(isStudioCompanions) {
      try{return await handleStudioCompanionSettings(request,env,await sessionUser());}
      catch(error){
        console.warn("studio_companion_settings_error",String(error?.message||error).slice(0,120));
        return json({ok:false,error:"companion_settings_unavailable"},503);
      }
    }
    if (url.pathname === "/api/studio/living-plan" || url.pathname.startsWith("/api/studio/living-plan/")) {
      try {
        const accountId = await sessionUser() || await resolveStudioGoalsCliAccount(request,env);
        return await handleStudioLivingPlan(request,env,accountId);
      }
      catch (error) { console.warn("studio_living_plan_unavailable", String(error?.message || error).slice(0, 100));
        return json({ ok: false, error: "living_plan_unavailable" }, 503); }
    }
    if (isStudioStorage) {
      try { return await handleStudioStorageSettings(request, env, await sessionUser()); }
      catch (error) { console.warn("studio_storage_settings_error", String(error?.message || error).slice(0, 120));
        return json({ ok: false, error: "storage_settings_unavailable" }, 503); }
    }
    if(isStudioPreferences) {
      try{return await handleStudioUserPreferences(request,env,await sessionUser());}
      catch(error){
        console.warn("studio_user_preferences_error",String(error?.message||error).slice(0,120));
        return json({ok:false,error:"preferences_unavailable"},503);
      }
    }
    if(isStudioNotifications) {
      try{return await handleStudioNotificationSettings(request,env,await sessionUser());}
      catch(error){
        console.warn("studio_notification_settings_error",String(error?.message||error).slice(0,120));
        return json({ok:false,error:"notifications_unavailable"},503);
      }
    }
    if (isStudioAgentSettings) {
      try {return await handleStudioAgentSettings(request,env,await sessionUser());}
      catch(error){console.warn("studio_agent_settings_error",String(error?.message||error).slice(0,140));
        return json({ok:false,error:"agent_settings_unavailable"},503);}
    }
    if (isStudioMcps) {
      try {
        return await handleStudioMcps(request,env,await sessionUser());
      } catch(error) {
        console.warn('studio_mcps_error',String(error?.message||error).slice(0,150));
        return json({ok:false,error:'mcp_registry_unavailable'},503);
      }
    }

    if (isStudioSkills) {
      try {
        return await handleStudioSkills(request,env,await sessionUser());
      } catch(error) {
        console.warn('studio_skills_error',String(error?.message||error).slice(0,150));
        return json({ok:false,error:'skills_unavailable'},503);
      }
    }
    if (isStudioRules) {
      try {
        return await handleStudioRules(request,env,await sessionUser());
      } catch(error) {
        console.warn('studio_rules_error',String(error?.message||error).slice(0,150));
        return json({ok:false,error:'rules_unavailable'},503);
      }
    }
    if (isTerminalConnect) {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method_not_allowed" }, 405, { allow: "POST" });
      }
      const userId = await sessionUser();
      if (!userId) return json({ ok: false, error: "unauthorized" }, 401);
      if (!env.EXECOS?.fetch) {
        return json({ ok: false, error: "execos_binding_unavailable" }, 503);
      }
      const bridgeKey = String(env.AGENTSAM_BRIDGE_KEY || "").trim();
      if (!bridgeKey) {
        return json({ ok: false, error: "execos_bridge_key_unavailable" }, 503);
      }
      const body = await request.json().catch(() => ({}));
      try {
        const upstream = await env.EXECOS.fetch("https://execos.internal/terminal/connect", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-bridge-key": bridgeKey,
          },
          body: JSON.stringify({ ...body, account_id: userId }),
        });
        const payload = await upstream.json().catch(() => ({
          ok: false,
          error: `execos_terminal_connect_http_${upstream.status}`,
        }));
        return json(payload, upstream.status);
      } catch (error) {
        console.error("execos_terminal_connect_error", String(error));
        return json({ ok: false, error: "execos_terminal_connect_failed" }, 502);
      }
    }

    if (isAnalyticsSmoke) {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method_not_allowed" }, 405, {
          allow: "POST",
        });
      }

      const gate = await requireBridgeKey(request, env);
      if (!gate.ok) {
        return json(
          { ok: false, error: gate.error || "unauthorized" },
          gate.status || 401,
        );
      }

      try {
        const versionMetadata = env.CF_VERSION_METADATA || {};
        const result = await emitAnalyticsFact(env, {
          event_kind: "runtime",
          domain: "analytics",
          operation: "basin_smoke_test",
          outcome: "passed",
          repository_id: "github:samprimeaux/agentsam-sdk",
          git_sha: versionMetadata.tag || null,
          source_client: "operator_smoke",
          duration_ms: 1,
          attempt_count: 1,
          dimensions: { source: "operator_smoke" },
          metrics: { smoke: true },
        });

        return json({
          ok: true,
          operation: "basin_smoke_test",
          analytics: result,
        });
      } catch (error) {
        console.error("analytics_smoke_failed", String(error));
        return json(
          {
            ok: false,
            error: "analytics_smoke_failed",
            detail: String(error?.message || error).slice(0, 200),
          },
          500,
        );
      }
    }

if (isAnalyticsApi && !isAnalyticsSmoke) {
      const sid = await sessionUser();
      const gate = await requireBridgeKey(request, env);

      if (!sid && !gate.ok) {
        return json(
          { ok: false, error: gate.error || "unauthorized" },
          gate.status || 401,
        );
      }

      if(url.pathname==='/api/analytics/tool-usage'){
        // A bridge key cannot supply arbitrary identity. Only a verified
        // account session can access private operational metrics.
        if(!sid)return json({ok:false,error:'authenticated_account_required'},401);
        try{return json(await queryAccountToolUsage(env,sid,url.searchParams.get('range')||'30d'));}
        catignal,
            });
            return nitroWorker.fetch(chat, env, context);
          },
        });
        try {
          return await handleEcommerceAdminApi(request, { ...commerceEnv, CMS_ASSISTANT_INFERENCE }, url, context, studioUser);
        } catch (error) {
          console.error("studio_cms_assistant_error", error?.message);
          return json({ ok: false, error: "AgentSam could not load the editor conversation. Try again." }, 503);
        }
      }
      return handleEcommerceAdminApi(request, commerceEnv, url, context, studioUser);
    }

    // Public marketing/docs: WEBSITE_ASSETS R2 SSOT (Worker ASSETS = bootstrap only)
    const publicPath = publicSitePathForRequest(request);
    if (request.method === "GET" && isPublicSitePath(publicPath)) {
      const page = await servePublicSitePage(request, env, publicPath);
      if (page) return page;
      // Never substitute another site's homepage when the request hostname has
      // no active cms_sites registration or the site has no published page.
      return new Response("Published site page not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (request.method === "GET" && Object.hasOwn(INSTALL_APP_TARGETS, url.pathname)) {
      return serveInstallScript(url.pathname);
    }

    // Stock public OAuth / issuer config (no secrets) — CLI resolves desktop client from here.
    if (url.pathname === "/api/public-config") {
      return handlePublicConfigRequest(request, env);
    }

    // Gmail resource OAuth callback is public only long enough to redeem the one-time PKCE state.
    if (isGmailOAuthCallbackRequest(request)) {
      return completeGmailOAuth(request, env);
    }

    // Drive / Calendar / GitHub connector callbacks share the same one-time-state redemption.
    if (isConnectorOAuthCallbackRequest(request)) {
      return completeConnectorOAuth(request, env);
    }

    // CLI desktop PKCE token exchange broker (secrets stay on Worker).
    if (url.pathname === "/api/oauth/google/desktop-exchange") {
      return handleGoogleDesktopExchangeRequest(request, env);
    }

    // CLI Google Cloud via Studio Web client (reliable when Desktop PKCE is rejected).
    // Callback shares /api/oauth/google/callback with identity when state is cli_*.
    if (isGoogleCliCloudPath(url.pathname) || isGoogleCliCloudCallbackRequest(request)) {
      return handleGoogleCliCloudRequest(request, env);
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
        app: APP,
        routeRegistry: ROUTE_REGISTRY,
        loginPath: LOGIN_PATH,
      });
    }

    // Identity package owns auth pages, auth API, OAuth, and company branding.
    if (isIdentityPath(url.pathname)) {
      return handleIdentityWorkerRequest(request, env, {
        app: APP,
        routeRegistry: ROUTE_REGISTRY,
        resolveCredential: createIdentityCredentialResolver(env),
      });
    }

    // CMS is account- and site-scoped. These routes run before the generic
    // Studio API gate, so they MUST resolve an IAM session themselves.
    if (url.pathname.startsWith("/api/cms/")) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
      const cmsActorId = await resolveSessionUserId(request, env);
      if (!cmsActorId) return json({ ok: false, error: "unauthorized" }, 401);
      return handleCmsWorkerRequest(request, env, cmsActorId);
    }

    // Canonical React app mounts are served as data-free, pre-rendered
    // document shells, never the Ecommerce's legacy /admin/agentsam.html.
    // The packaged Workbench, CAD and MovieMode route chunks hydrate in-place.
    // This also avoids the Cloudflare-only Nitro SSR 500 for these app routes.
    if ((request.method === "GET" || request.method === "HEAD") &&
        (STUDIO_ADMIN_PRERENDERED_ROUTES.includes(url.pathname) ||
         url.pathname === "/mail" ||
         url.pathname === "/artifacts" ||
         url.pathname === "/artifacts/tickets" ||
         url.pathname === "/tickets" ||
         url.pathname === "/themes")) {
      const denied = await guardStudioDocument(request, env);
      if (denied) return denied;
      const assetUrl=new URL(request.url);
      // Both /admin/* mounts and Work package top-level routes hydrate the
      // same canonical React app; no legacy HTML donor is introduced.
      const shellRoute=url.pathname.startsWith("/admin/")
        ? url.pathname.slice("/admin".length) : url.pathname;
      assetUrl.pathname="/studio-app-shell"+shellRoute+"/";
      assetUrl.search="";
      const shell=await env.ASSETS.fetch(new Request(assetUrl,{method:"GET"}));
      if(!shell.ok)return json({ok:false,error:"studio_app_shell_unavailable"},503);
      const headers=new Headers(shell.headers);
      headers.set("content-type","text/html; charset=utf-8");
      headers.set("cache-control","private, no-store");
      headers.delete("content-length");
      return new Response(request.method==="HEAD"?null:shell.body,{status:200,headers});
    }

    // Settings are served as build-generated, canonical React route shells.
    // The browser hydrates the installed Settings package normally. This
    // isolates Cloudflare's Settings-only Nitro SSR failure without creating
    // a separate editor, storing fake preferences or exposing account data.
    if ((request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === "/admin/settings" || url.pathname.startsWith("/admin/settings/"))) {
      const unit=url.pathname.split("/").filter(Boolean)[2] || "general";
      const allowed=new Set(["general","agents","customize","design","git-prs",
        "codebase","network","runtime","themes","storage","keys","usage",
        "notifications","docs","integrations","skills"]);
      if(url.pathname === "/admin/settings" || !allowed.has(unit))
        return Response.redirect(new URL("/admin/settings/general",request.url),302);
      const denied = await guardStudioDocument(request, env);
      if (denied) return denied;
      const assetUrl=new URL(request.url);
      assetUrl.pathname="/studio-settings-shell/"+unit+"/";
      assetUrl.search="";
      const shell=await env.ASSETS.fetch(new Request(assetUrl,{method:"GET"}));
      if(!shell.ok)return json({ok:false,error:"settings_shell_unavailable"},503);
      const headers=new Headers(shell.headers);
      headers.set("content-type","text/html; charset=utf-8");
      headers.set("cache-control","private, no-store");
      headers.delete("content-length");
      return new Response(request.method === "HEAD" ? null : shell.body,{
        status:200,headers,
      });
    }

    // Gate authenticated Studio app routes from the app manifest mounts.
    if (request.method === "GET" && isProtectedAppPath(url.pathname)) {
      const denied = await guardStudioDocument(request, env);
      if (denied) return denied;
    }

    // Authenticated identity for Studio routes. Resolved lazily (single D1
    // session lookup, skipped entirely when no Cookie header is present) so
    // static-asset traffic through the Worker pays nothing.
    let sessionUserId;
    async function sessionUser() {
      if (sessionUserId === undefined) sessionUserId = await resolveSessionUserId(request, env);
      return sessionUserId;
    }

    if(workspaceMatch) {
      if(request.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
      const accountId=await sessionUser();
      if(!accountId)return json({ok:false,error:"unauthorized"},401);
      try{
        const response=await readPluginWorkspace(env,accountId,workspaceMatch[1]);
        return json({ok:true,...response},200,{"cache-control":"no-store"});
      }catch(error){
        const code=String(error?.message||"plugin_workspace_unavailable");
        return json({ok:false,error:code.slice(0,120)},code.includes("not_connected")?409:400);
      }
    }
    if(isStudioAccountAvatar) {
      try{return await handleStudioAccountAvatar(request,env,await sessionUser());}
      catch(error){
        console.warn("studio_account_avatar_error",String(error?.message||error).slice(0,120));
        return json({ok:false,error:"account_avatar_unavailable"},503);
      }
    }
    if(isStudioCompanions) {
      try{return await handleStudioCompanionSettings(request,env,await sessionUser());}
      catch(error){
        console.warn("studio_companion_settings_error",String(error?.message||error).slice(0,120));
        return json({ok:false,error:"companion_settings_unavailable"},503);
      }
    }
    if (url.pathname === "/api/studio/living-plan" || url.pathname.startsWith("/api/studio/living-plan/")) {
      try {
        const accountId = await sessionUser() || await resolveStudioGoalsCliAccount(request,env);
        return await handleStudioLivingPlan(request,env,accountId);
      }
      catch (error) { console.warn("studio_living_plan_unavailable", String(error?.message || error).slice(0, 100));
        return json({ ok: false, error: "living_plan_unavailable" }, 503); }
    }
    if (isStudioStorage) {
      try { return await handleStudioStorageSettings(request, env, await sessionUser()); }
      catch (error) { console.warn("studio_storage_settings_error", String(error?.message || error).slice(0, 120));
        return json({ ok: false, error: "storage_settings_unavailable" }, 503); }
    }
    if(isStudioPreferences) {
      try{return await handleStudioUserPreferences(request,env,await sessionUser());}
      catch(error){
        console.warn("studio_user_preferences_error",String(error?.message||error).slice(0,120));
        return json({ok:false,error:"preferences_unavailable"},503);
      }
    }
    if(isStudioNotifications) {
      try{return await handleStudioNotificationSettings(request,env,await sessionUser());}
      catch(error){
        console.warn("studio_notification_settings_error",String(error?.message||error).slice(0,120));
        return json({ok:false,error:"notifications_unavailable"},503);
      }
    }
    if (isStudioAgentSettings) {
      try {return await handleStudioAgentSettings(request,env,await sessionUser());}
      catch(error){console.warn("studio_agent_settings_error",String(error?.message||error).slice(0,140));
        return json({ok:false,error:"agent_settings_unavailable"},503);}
    }
    if (isStudioMcps) {
      try {
        return await handleStudioMcps(request,env,await sessionUser());
      } catch(error) {
        console.warn('studio_mcps_error',String(error?.message||error).slice(0,150));
        return json({ok:false,error:'mcp_registry_unavailable'},503);
      }
    }

    if (isStudioSkills) {
      try {
        return await handleStudioSkills(request,env,await sessionUser());
      } catch(error) {
        console.warn('studio_skills_error',String(error?.message||error).slice(0,150));
        return json({ok:false,error:'skills_unavailable'},503);
      }
    }
    if (isStudioRules) {
      try {
        return await handleStudioRules(request,env,await sessionUser());
      } catch(error) {
        console.warn('studio_rules_error',String(error?.message||error).slice(0,150));
        return json({ok:false,error:'rules_unavailable'},503);
      }
    }
    if (isTerminalConnect) {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method_not_allowed" }, 405, { allow: "POST" });
      }
      const userId = await sessionUser();
      if (!userId) return json({ ok: false, error: "unauthorized" }, 401);
      if (!env.EXECOS?.fetch) {
        return json({ ok: false, error: "execos_binding_unavailable" }, 503);
      }
      const bridgeKey = String(env.AGENTSAM_BRIDGE_KEY || "").trim();
      if (!bridgeKey) {
        return json({ ok: false, error: "execos_bridge_key_unavailable" }, 503);
      }
      const body = await request.json().catch(() => ({}));
      try {
        const upstream = await env.EXECOS.fetch("https://execos.internal/terminal/connect", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-bridge-key": bridgeKey,
          },
          body: JSON.stringify({ ...body, account_id: userId }),
        });
        const payload = await upstream.json().catch(() => ({
          ok: false,
          error: `execos_terminal_connect_http_${upstream.status}`,
        }));
        return json(payload, upstream.status);
      } catch (error) {
        console.error("execos_terminal_connect_error", String(error));
        return json({ ok: false, error: "execos_terminal_connect_failed" }, 502);
      }
    }

    if (isAnalyticsSmoke) {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method_not_allowed" }, 405, {
          allow: "POST",
        });
      }

      const gate = await requireBridgeKey(request, env);
      if (!gate.ok) {
        return json(
          { ok: false, error: gate.error || "unauthorized" },
          gate.status || 401,
        );
      }

      try {
        const versionMetadata = env.CF_VERSION_METADATA || {};
        const result = await emitAnalyticsFact(env, {
          event_kind: "runtime",
          domain: "analytics",
          operation: "basin_smoke_test",
          outcome: "passed",
          repository_id: "github:samprimeaux/agentsam-sdk",
          git_sha: versionMetadata.tag || null,
          source_client: "operator_smoke",
          duration_ms: 1,
          attempt_count: 1,
          dimensions: { source: "operator_smoke" },
          metrics: { smoke: true },
        });

        return json({
          ok: true,
          operation: "basin_smoke_test",
          analytics: result,
        });
      } catch (error) {
        console.error("analytics_smoke_failed", String(error));
        return json(
          {
            ok: false,
            error: "analytics_smoke_failed",
            detail: String(error?.message || error).slice(0, 200),
          },
          500,
        );
      }
    }

if (isAnalyticsApi && !isAnalyticsSmoke) {
      const sid = await sessionUser();
      const gate = await requireBridgeKey(request, env);

      if (!sid && !gate.ok) {
        return json(
          { ok: false, error: gate.error || "unauthorized" },
          gate.status || 401,
        );
      }

      if(url.pathname==='/api/analytics/tool-usage'){
        // A bridge key cannot supply arbitrary identity. Only a verified
        // account session can access private operational metrics.
        if(!sid)return json({ok:false,error:'authenticated_account_required'},401);
        try{return json(await queryAccountToolUsage(env,sid,url.searchParams.get('range')||'30d'));}
        catch(error){
          console.warn('tool_metrics_unavailable',String(error?.message||error).slice(0,120));
          return json({ok:false,error:'tool_metrics_unavailable'},503);
        }
      }
      const result = await handleAnalyticsQueryRequest(request, env);
      return json(result.body, result.status, result.headers || {});
    }

    if (url.pathname.startsWith("/api/knowledge/node-api")) {
      const userId = await sessionUser();
      if (!userId) return json({ ok: false, error: "unauthorized" }, 401);
      return handleKnowledgeNodeApiRequest(request, env, userId);
    }

    if (isDatabaseApi) {
      const userId = await sessionUser();
      if (!userId) return json({ ok: false, error: "unauthorized" }, 401);
      return handleDatabaseRequest(request, env, userId, context);
    }

    if (url.pathname === '/api/studio/chats' || /^\/api\/studio\/chats\/[a-zA-Z0-9_-]+(?:\/messages)?$/.test(url.pathname)) {
      return handleStudioChatHistory(request, env, await sessionUser());
    }

    if (isWorkApi) {
      const userId = await sessionUser();
      if (!userId) return json({ ok: false, error: "unauthorized" }, 401)