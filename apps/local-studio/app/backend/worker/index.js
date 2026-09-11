/**
 * AgentSam Workmode — vault Worker
 * AES-256-GCM secrets against D1 inneranimalmedia-business.
 *
 * Routes:
 *   GET  /health
 *   GET  /api/vault/secrets          metadata for caller user
 *   POST /api/vault/secrets          encrypt + upsert (never returns plaintext)
 *   DELETE /api/vault/secrets/:id    soft-revoke
 *
 * Auth (v1): Authorization: Bearer <WORKMODE_API_KEY>
 *            X-User-Id: <user_id>  (required for vault routes)
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

function requireUserId(request) {
  const userId = (request.headers.get("x-user-id") || "").trim();
  if (!userId || userId.length < 3) return { ok: false, error: "X-User-Id required", status: 400 };
  return { ok: true, userId };
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/health" || url.pathname === "/") {
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
          app: env.WORKMODE_APP || "agentsam-workmode",
          d1,
          database: env.D1_DATABASE_NAME || "inneranimalmedia-business",
          vault_key: Boolean(env.VAULT_MASTER_KEY || env.VAULT_KEY),
          api_key: Boolean(env.WORKMODE_API_KEY),
        },
        200,
        headers,
      );
    }

    const gate = requireApiKey(request, env);
    if (!gate.ok) return json({ ok: false, error: gate.error }, gate.status, headers);

    const user = requireUserId(request);
    if (!user.ok && url.pathname.startsWith("/api/vault/")) {
      return json({ ok: false, error: user.error }, user.status, headers);
    }

    try {
      if (url.pathname === "/api/vault/secrets" && request.method === "GET") {
        const res = await handleList(env, user.userId);
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      if (url.pathname === "/api/vault/secrets" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const res = await handleCreate(env, user.userId, body);
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      if (url.pathname === "/api/vault/unwrap" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const res = await handleUnwrap(env, user.userId, body);
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      const del = url.pathname.match(/^\/api\/vault\/secrets\/([^/]+)$/);
      if (del && request.method === "DELETE") {
        const res = await handleDelete(env, user.userId, decodeURIComponent(del[1]));
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
