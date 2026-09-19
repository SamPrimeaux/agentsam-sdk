import nitroWorker from "../../.output/server/index.mjs";
import installScript from "../../../../scripts/install.sh";
import { handleCloudflareConnectionRequest, isCloudflareConnectionPath } from "../../../../packages/connectors/cloudflare/src/routes.js";
import { resolveCloudflareOAuthClient } from "../../../../packages/connectors/cloudflare/src/index.js";
import {
  handleIdentityWorkerRequest,
  createIdentityService,
  createCloudflareD1Adapter,
} from "../../../../packages/identity/src/server/worker-router.js";
import { handleCmsWorkerRequest } from "./cms-service.js";

// Paths owned by the identity package (auth pages, auth API, OAuth, company branding).
const IDENTITY_EXACT_PATHS = new Set(["/auth/login", "/auth/signup", "/auth/reset", "/api/company"]);
function isIdentityPath(pathname) {
  return (
    IDENTITY_EXACT_PATHS.has(pathname) ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/oauth/")
  );
}

// Studio app routes that require a signed-in session before the SPA shell loads.
const PROTECTED_APP_PATHS = [
  "/agentsam",
  "/projects",
  "/artifacts",
  "/files",
  "/browse",
  "/cli",
  "/ship",
  "/cad",
  "/cms",
];
function isProtectedAppPath(pathname) {
  return PROTECTED_APP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const INSTALL_APP_TARGETS = Object.freeze({
  "/install": "",
  "/install/cad": "cad-creator",
  "/install/cms": "client-cms-editor",
  "/install/studio": "local-studio",
});

function serveInstallScript(pathname) {
  const appTarget = INSTALL_APP_TARGETS[pathname];
  const body = appTarget
    ? installScript.replace(
        'APP_SELECTOR="${AGENTSAM_DEFAULT_APP:-}"',
        `APP_SELECTOR="\${AGENTSAM_DEFAULT_APP:-${appTarget}}"`,
      )
    : installScript;

  return new Response(body, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * AgentSam Workmode — vault Worker
 * AES-256-GCM secrets against D1 inneranimalmedia-business.
 *
 * Routes:
 *   GET  /health
 *   GET  /api/vault/secrets          metadata for caller user
 *   POST /api/vault/secrets          encrypt + upsert (never returns plaintext)
 *   DELETE /api/vault/secrets/:id    soft-revoke
 *   GET  /api/llm/inventory          per-user vault (+ optional platform) model inventory
 *
 * Auth (v1): Authorization: Bearer <WORKMODE_API_KEY>
 *            X-User-Id: <user_id>  (required for vault + inventory routes)
 *
 * Auth (session lane): requests carrying a valid identity session cookie are
 * authenticated without the desk API key for GET /api/llm/inventory, and the
 * session user is authoritative everywhere a user_id is needed — a
 * client-asserted X-User-Id never overrides the validated session. POST
 * /api/chat bound for Nitro gets its X-User-Id rewritten to the session user
 * so downstream vault BYOK resolution cannot be spoofed.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

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
  const v = String(value ?? "");
  if (!v) return "";
  return v.length <= 4 ? "••••" : v.slice(-4);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function importVaultKey(env) {
  const raw = env.VAULT_MASTER_KEY || env.VAULT_KEY;
  if (!raw) throw new Error("VAULT_MASTER_KEY missing");
  let keyBytes;
  try {
    keyBytes = b64ToBytes(raw);
  } catch {
    keyBytes = enc.encode(raw);
  }
  if (keyBytes.byteLength === 32) {
    // ok
  } else if (keyBytes.byteLength > 32) {
    keyBytes = keyBytes.slice(0, 32);
  } else {
    const hash = await crypto.subtle.digest("SHA-256", keyBytes);
    keyBytes = new Uint8Array(hash);
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptSecret(env, plaintext, aad) {
  const key = await importVaultKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    enc.encode(plaintext),
  );
  const packed = new Uint8Array(iv.byteLength + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.byteLength);
  return bytesToB64(packed);
}

async function decryptSecret(env, packedB64, aad) {
  const key = await importVaultKey(env);
  const packed = b64ToBytes(packedB64);
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    data,
  );
  return dec.decode(plain);
}

function requireApiKey(request, env) {
  const expected = env.WORKMODE_API_KEY;
  if (!expected) return { ok: false, error: "WORKMODE_API_KEY not configured", status: 503 };
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token || token !== expected) return { ok: false, error: "unauthorized", status: 401 };
  return { ok: true };
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
    const identity = createIdentityService({ adapter });
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

function cors(request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type, x-user-id",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    vary: "Origin",
  };
}

async function audit(env, row) {
  try {
    await env.DB.prepare(
      `INSERT INTO secret_audit_log (
         id, secret_id, secret_source, tenant_id, user_id, event_type,
         triggered_by, previous_last4, new_last4, notes, created_at
       ) VALUES (?, ?, 'user_secrets', ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
    )
      .bind(
        `saudit_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        row.secret_id,
        row.tenant_id || "system",
        row.user_id || null,
        row.event_type,
        row.triggered_by || "agentsam-workmode",
        row.previous_last4 || null,
        row.new_last4 || null,
        row.notes || null,
      )
      .run();
  } catch (err) {
    console.error("audit_failed", String(err));
  }
}

async function handleList(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT id, secret_name, secret_type, service_name, description, is_active,
            expires_at, last_used_at, usage_count, workspace_id, created_at, updated_at,
            substr(secret_value_encrypted, -4) AS hint
     FROM user_secrets
     WHERE user_id = ? AND is_active = 1
     ORDER BY updated_at DESC
     LIMIT 100`,
  )
    .bind(userId)
    .all();

  return json({
    ok: true,
    count: results?.length ?? 0,
    secrets: (results || []).map((r) => ({
      id: r.id,
      name: r.secret_name,
      type: r.secret_type,
      service: r.service_name,
      description: r.description,
      workspace_id: r.workspace_id,
      expires_at: r.expires_at,
      last_used_at: r.last_used_at,
      usage_count: r.usage_count,
      created_at: r.created_at,
      updated_at: r.updated_at,
      // never ciphertext; hint is not last4 of plaintext — omit misleading field
    })),
  });
}

async function handleCreate(env, userId, body) {
  const service = String(body.service_name || body.service || "").trim().toLowerCase();
  const name = String(body.secret_name || body.name || service || "default").trim();
  const value = String(body.value || body.secret || "").trim();
  const secretType = String(body.secret_type || "api_key").trim();
  const description = body.description ? String(body.description).slice(0, 500) : null;
  const tenantId = String(body.tenant_id || "tenant_sam_primeaux").trim();
  const workspaceId = body.workspace_id ? String(body.workspace_id) : "ws_inneranimalmedia";

  if (!service) return json({ ok: false, error: "service_name required" }, 400);
  if (!value || value.length < 8) return json({ ok: false, error: "value too short" }, 400);

  const aad = `${userId}:${service}:${name}`;
  const ciphertext = await encryptSecret(env, value, aad);
  const id = `usec_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO user_secrets (
       id, user_id, tenant_id, secret_name, secret_value_encrypted, secret_type,
       description, service_name, is_active, workspace_id, created_at, updated_at, metadata_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
     ON CONFLICT(user_id, secret_name, service_name) DO UPDATE SET
       secret_value_encrypted = excluded.secret_value_encrypted,
       secret_type = excluded.secret_type,
       description = excluded.description,
       is_active = 1,
       updated_at = excluded.updated_at,
       metadata_json = excluded.metadata_json`,
  )
    .bind(
      id,
      userId,
      tenantId,
      name,
      ciphertext,
      secretType,
      description,
      service,
      workspaceId,
      now,
      now,
      JSON.stringify({ key_version: 1, aad_bound: true, source: "agentsam-workmode" }),
    )
    .run();

  const row = await env.DB.prepare(
    `SELECT id FROM user_secrets WHERE user_id = ? AND secret_name = ? AND service_name = ?`,
  )
    .bind(userId, name, service)
    .first();

  await audit(env, {
    secret_id: row?.id || id,
    tenant_id: tenantId,
    user_id: userId,
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

async function handleDelete(env, userId, secretId) {
  const existing = await env.DB.prepare(
    `SELECT id, tenant_id FROM user_secrets WHERE id = ? AND user_id = ?`,
  )
    .bind(secretId, userId)
    .first();
  if (!existing) return json({ ok: false, error: "not found" }, 404);

  await env.DB.prepare(
    `UPDATE user_secrets SET is_active = 0, updated_at = unixepoch() WHERE id = ? AND user_id = ?`,
  )
    .bind(secretId, userId)
    .run();

  await audit(env, {
    secret_id: secretId,
    tenant_id: existing.tenant_id,
    user_id: userId,
    event_type: "revoked",
    notes: "soft-revoke",
  });

  return json({ ok: true, id: secretId, revoked: true });
}

/** Internal decrypt-for-use — never expose via public docs as a browser API. */
async function handleUnwrap(env, userId, body) {
  const secretId = String(body.id || body.secret_id || "").trim();
  if (!secretId) return json({ ok: false, error: "id required" }, 400);

  const row = await env.DB.prepare(
    `SELECT id, secret_name, service_name, secret_value_encrypted, tenant_id, is_active
     FROM user_secrets WHERE id = ? AND user_id = ?`,
  )
    .bind(secretId, userId)
    .first();

  if (!row || !row.is_active) return json({ ok: false, error: "not found" }, 404);

  const aad = `${userId}:${row.service_name}:${row.secret_name}`;
  let plaintext;
  try {
    plaintext = await decryptSecret(env, row.secret_value_encrypted, aad);
  } catch (err) {
    await audit(env, {
      secret_id: secretId,
      tenant_id: row.tenant_id,
      user_id: userId,
      event_type: "failed_decrypt",
      notes: String(err).slice(0, 200),
    });
    return json({ ok: false, error: "decrypt_failed" }, 500);
  }

  await env.DB.prepare(
    `UPDATE user_secrets SET last_used_at = unixepoch(), usage_count = COALESCE(usage_count,0) + 1
     WHERE id = ?`,
  )
    .bind(secretId)
    .run();

  await audit(env, {
    secret_id: secretId,
    tenant_id: row.tenant_id,
    user_id: userId,
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

const SERVICE_TO_PROVIDER = Object.freeze({
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'gemini',
  xai: 'grok',
  grok: 'grok',
  cursor: 'cursor',
  cloudflare: 'cloudflare',
});

async function loadVaultCredentialsForUser(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT id, secret_name, service_name, secret_value_encrypted
     FROM user_secrets
     WHERE user_id = ? AND is_active = 1
     ORDER BY updated_at DESC
     LIMIT 100`,
  )
    .bind(userId)
    .all();

  const byProvider = new Map();
  for (const row of results || []) {
    const providerId = SERVICE_TO_PROVIDER[String(row.service_name || '').toLowerCase()];
    if (!providerId || byProvider.has(providerId)) continue;
    const aad = `${userId}:${row.service_name}:${row.secret_name}`;
    try {
      const value = await decryptSecret(env, row.secret_value_encrypted, aad);
      const entry = { value, source: 'user_vault' };
      if (providerId === 'cloudflare') {
        entry.account_id = env.CLOUDFLARE_ACCOUNT_ID || env.ACCOUNT_ID || null;
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
    account_id: env.CLOUDFLARE_ACCOUNT_ID || env.ACCOUNT_ID || null,
  });
  return map;
}

async function handleLlmInventory(env, userId, request) {
  const includePlatform = new URL(request.url).searchParams.get('include_platform') !== '0';
  const vault = await loadVaultCredentialsForUser(env, userId);
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
  const providers = [
    'openai', 'anthropic', 'gemini', 'grok', 'cursor', 'cloudflare',
  ].map((id) => {
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

    if (request.method === "GET" && Object.hasOwn(INSTALL_APP_TARGETS, url.pathname)) {
      return serveInstallScript(url.pathname);
    }

    // The checked-in Worker owns vault + health + llm inventory. Everything else belongs
    // to the generated Nitro application handler.
    if (isCfConnection) {
      return handleCloudflareConnectionRequest(request, env);
    }

    // Identity package owns auth pages, auth API, OAuth, and company branding.
    if (isIdentityPath(url.pathname)) {
      return handleIdentityWorkerRequest(request, env);
    }

    // Studio CMS API endpoints
    if (url.pathname.startsWith("/api/cms/")) {
      return handleCmsWorkerRequest(request, env);
    }

    // Gate authenticated Studio app routes on a real session before the SPA shell loads.
    if (request.method === "GET" && isProtectedAppPath(url.pathname)) {
      try {
        const adapter = createCloudflareD1Adapter(env.DB);
        const identity = createIdentityService({ adapter });
        const ctx = await identity.sessionFromRequest(request);
        if (!ctx) {
          const next = encodeURIComponent(url.pathname + url.search);
          return Response.redirect(`${url.origin}/auth/login?next=${next}`, 302);
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

    if (!isVault && !isLlmInventory && url.pathname !== "/health") {
      // Nitro-bound Studio chat runs per-user vault BYOK downstream: bind the
      // client-asserted user to the validated session when one exists.
      if (url.pathname === "/api/chat" && request.method === "POST") {
        const sid = await sessionUser();
        if (sid && (request.headers.get("x-user-id") || "").trim() !== sid) {
          const bound = bindSessionUser(request, sid);
          if (bound) request = bound;
        }
      }
      return nitroWorker.fetch(request, env, context);
    }

    const headers = cors(request);

    if (isVault && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (isLlmInventory && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/health") {
      let d1 = false;
      try {
        await env.DB.prepare("SELECT 1 AS ok").first();
        d1 = true;
      } catch {
        d1 = false;
      }
      return json(
        {
          ok: true,
          app: env.WORKMODE_APP || "agentsam-sdk",
          d1,
          database: env.D1_DATABASE_NAME || "inneranimalmedia-business",
          vault_key: Boolean(env.VAULT_MASTER_KEY || env.VAULT_KEY),
          api_key: Boolean(env.WORKMODE_API_KEY),
          identity: {
            iam: Boolean(env.IAM_CLIENT_ID && env.IAM_CLIENT_SECRET),
          },
          connections: {
            cloudflare: {
              configured: resolveCloudflareOAuthClient(env).productionReady,
            },
          },
        },
        200,
        headers,
      );
    }

    // GET /api/llm/inventory: desk API key OR a valid session authenticates.
    // The session user is authoritative; the client header is a fallback for
    // API-key service callers.
    if (isLlmInventory && request.method === "GET") {
      const gate = requireApiKey(request, env);
      const sid = await sessionUser();
      if (!gate.ok && !sid) return json({ ok: false, error: gate.error }, gate.status, headers);
      const userId = sid || (request.headers.get("x-user-id") || "").trim();
      if (!userId || userId.length < 3) {
        return json({ ok: false, error: "X-User-Id required" }, 400, headers);
      }
      try {
        const res = await handleLlmInventory(env, userId, request);
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      } catch (err) {
        console.error("workmode_error", String(err));
        return json({ ok: false, error: "internal_error", detail: String(err).slice(0, 200) }, 500, headers);
      }
    }

    // Vault routes stay desk-key-only (server callers); the user still
    // resolves session-first so an authenticated operator needs no header.
    const gate = requireApiKey(request, env);
    if (!gate.ok) return json({ ok: false, error: gate.error }, gate.status, headers);

    const headerUser = (request.headers.get("x-user-id") || "").trim();
    const sessionId = await sessionUser();
    const userId = sessionId || headerUser;
    if (!userId || userId.length < 3) {
      return json({ ok: false, error: "X-User-Id required" }, 400, headers);
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
      console.error("workmode_error", String(err));
      return json({ ok: false, error: "internal_error", detail: String(err).slice(0, 200) }, 500, headers);
    }
  },
};
