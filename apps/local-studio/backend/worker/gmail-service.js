import { createHash, randomBytes } from "node:crypto";
import {
  oauthAad,
  sealOauthToken,
  unsealOauthToken,
} from "../../../../packages/agentsam-vault/src/crypto/oauth-envelope.js";
import {
  decryptSecret,
  encryptSecret,
  vaultConfigured,
} from "../../../../packages/connectors/cfoa/src/vault.js";

const PROVIDER = "google_gmail";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function gmailScopeSet(...values) {
  const scopes = new Set();
  for (const value of values) {
    if (!value) continue;
    let items = [];
    if (Array.isArray(value)) items = value;
    else {
      const raw = clean(value);
      try {
        const parsed = JSON.parse(raw);
        items = Array.isArray(parsed) ? parsed : raw.split(/[\s,]+/);
      } catch {
        items = raw.split(/[\s,]+/);
      }
    }
    for (const item of items) {
      const scope = clean(item).toLowerCase();
      if (scope) scopes.add(scope);
    }
  }
  return scopes;
}

function gmailCapabilities(scope, scopes) {
  const granted = gmailScopeSet(scope, scopes);
  const capabilities = [];
  const fullMail = granted.has("https://mail.google.com/");
  if (
    fullMail ||
    granted.has("https://www.googleapis.com/auth/gmail.readonly") ||
    granted.has("https://www.googleapis.com/auth/gmail.modify")
  ) capabilities.push("mail.read");
  if (fullMail || granted.has("https://www.googleapis.com/auth/gmail.send")) capabilities.push("mail.send");
  if (fullMail || granted.has("https://www.googleapis.com/auth/gmail.modify")) capabilities.push("mail.modify");
  return capabilities;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function vaultMaterial(env) {
  return clean(env?.VAULT_MASTER_KEY || env?.VAULT_KEY);
}

const OAUTH_STATE_PROVIDER = "google_gmail";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function hashState(state) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clean(state)));
  return bytesToHex(new Uint8Array(digest));
}

function stateAad(userId) {
  return "oauth_state_nonces:" + OAUTH_STATE_PROVIDER + ":" + clean(userId);
}

async function ensureOauthStateTable(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS oauth_state_nonces (" +
      "id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, provider TEXT NOT NULL, " +
      "state_hash TEXT NOT NULL, code_verifier_encrypted TEXT, redirect_after TEXT, " +
      "metadata_json TEXT DEFAULT '{}', expires_at INTEGER NOT NULL, consumed_at INTEGER, " +
      "created_at INTEGER DEFAULT (unixepoch()))"
  ).run();
}

async function saveOauthState(env, { state, userId, verifier, returnTo }) {
  if (!vaultConfigured(env)) throw new Error("vault_required");
  await ensureOauthStateTable(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const stateHash = await hashState(state);
  const encrypted = await encryptSecret(env, verifier, stateAad(userId));
  const id = "osn_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  await env.DB.prepare(
    "DELETE FROM oauth_state_nonces WHERE provider = ? AND (expires_at < ? OR consumed_at IS NOT NULL)"
  ).bind(OAUTH_STATE_PROVIDER, now).run();
  await env.DB.prepare(
    "INSERT INTO oauth_state_nonces (" +
      "id, tenant_id, user_id, provider, state_hash, code_verifier_encrypted, redirect_after, " +
      "metadata_json, expires_at, consumed_at, created_at" +
    ") VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?)"
  ).bind(
    id,
    userId,
    OAUTH_STATE_PROVIDER,
    stateHash,
    encrypted,
    returnTo || null,
    JSON.stringify({ product: "agentsam-work", resource: "gmail" }),
    now + OAUTH_STATE_TTL_SECONDS,
    now,
  ).run();
}

async function consumeOauthState(env, state) {
  await ensureOauthStateTable(env.DB);
  const stateHash = await hashState(state);
  const row = await env.DB.prepare(
    "SELECT id, user_id, code_verifier_encrypted, redirect_after, expires_at, consumed_at " +
      "FROM oauth_state_nonces WHERE state_hash = ? AND provider = ? LIMIT 1"
  ).bind(stateHash, OAUTH_STATE_PROVIDER).first();
  if (!row || row.consumed_at) return null;
  const now = Math.floor(Date.now() / 1000);
  if (Number(row.expires_at || 0) <= now) return null;
  const consumed = await env.DB.prepare(
    "UPDATE oauth_state_nonces SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL"
  ).bind(now, row.id).run();
  if (Number(consumed?.meta?.changes || 0) !== 1) return null;
  if (!row.code_verifier_encrypted) return null;
  return {
    user_id: clean(row.user_id),
    code_verifier: await decryptSecret(env, row.code_verifier_encrypted, stateAad(row.user_id)),
    return_to: clean(row.redirect_after),
  };
}

function safeReturnTo(value) {
  const target = clean(value);
  if (target.startsWith("/") && !target.startsWith("//")) return target;
  try {
    const url = new URL(target);
    if (
      url.protocol === "agentsamstudio:" &&
      url.hostname === "connection" &&
      url.pathname === "/callback"
    ) {
      return url.toString();
    }
  } catch {
    // Fall through to the hosted Mail surface.
  }
  return "/mail";
}

async function activeRow(env, userId, accountIdentifier = "") {
  try {
    if (clean(accountIdentifier)) {
      return await env.DB.prepare(
        "SELECT user_id, provider, account_identifier, access_token, refresh_token, access_token_encrypted, refresh_token_encrypted, " +
          "scope, scopes, expires_at, account_display, metadata_json, created_at, updated_at " +
          "FROM user_oauth_tokens WHERE user_id = ? AND LOWER(provider) = ? AND account_identifier = ? " +
          "AND COALESCE(is_active, 1) = 1 AND (revoked_at IS NULL OR revoked_at = 0) LIMIT 1"
      ).bind(userId, PROVIDER, clean(accountIdentifier)).first();
    }
    return await env.DB.prepare(
      "SELECT user_id, provider, account_identifier, access_token, refresh_token, access_token_encrypted, refresh_token_encrypted, " +
        "scope, scopes, expires_at, account_display, metadata_json, created_at, updated_at " +
        "FROM user_oauth_tokens WHERE user_id = ? AND LOWER(provider) = ? " +
        "AND COALESCE(is_active, 1) = 1 AND (revoked_at IS NULL OR revoked_at = 0) " +
        "ORDER BY account_identifier COLLATE NOCASE ASC LIMIT 1"
    ).bind(userId, PROVIDER).first();
  } catch {
    return null;
  }
}

export async function listGmailConnections(env, userId) {
  try {
    const result = await env.DB.prepare(
      "SELECT account_identifier, account_display, scope, scopes, updated_at " +
        "FROM user_oauth_tokens WHERE user_id = ? AND LOWER(provider) = ? " +
        "AND COALESCE(is_active, 1) = 1 AND (revoked_at IS NULL OR revoked_at = 0) " +
        "ORDER BY account_identifier COLLATE NOCASE ASC"
    ).bind(userId, PROVIDER).all();
    return (result?.results || []).map((row) => {
      const capabilities = gmailCapabilities(row.scope, row.scopes);
      return {
        id: PROVIDER + ":" + clean(row.account_identifier),
        provider: PROVIDER,
        label: "Gmail",
        kind: "mailbox",
        status: capabilities.includes("mail.read") ? "connected" : "needs_scope",
        accountLabel: clean(row.account_display || row.account_identifier),
        accountIdentifier: clean(row.account_identifier),
        capabilities,
      };
    });
  } catch {
    return [];
  }
}

async function readStoredOauthToken(material, row, kind, aad) {
  const encryptedField = kind === "refresh" ? "refresh_token_encrypted" : "access_token_encrypted";
  const plainField = kind === "refresh" ? "refresh_token" : "access_token";
  const encrypted = clean(row?.[encryptedField]);
  if (encrypted) {
    try {
      return await unsealOauthToken(material, encrypted, aad);
    } catch {
      // Legacy rows may predate the current OAuth envelope/AAD convention.
    }
  }
  return clean(row?.[plainField]);
}

async function persistGrant(env, userId, tokens, email) {
  const material = vaultMaterial(env);
  if (!material) throw new Error("vault_required");
  const account = clean(email).toLowerCase();
  if (!account) throw new Error("gmail_email_required");
  const aad = oauthAad(PROVIDER, userId, account);
  const existing = await activeRow(env, userId, account);
  const refreshToken = clean(tokens.refresh_token) || (existing?.account_identifier === account
    ? await readStoredOauthToken(material, existing, "refresh", aad)
    : "");
  const accessEnc = await sealOauthToken(material, clean(tokens.access_token), aad);
  const refreshEnc = refreshToken ? await sealOauthToken(material, refreshToken, aad) : null;
  const scopes = clean(tokens.scope) || GMAIL_SCOPES.join(" ");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + Math.max(60, Number(tokens.expires_in || 3600));
  const metadata = JSON.stringify({ status: "connected", product: "agentsam-work", provider: PROVIDER });

  await env.DB.prepare(
    "INSERT INTO user_oauth_tokens (" +
      "user_id, tenant_id, person_uuid, provider, account_identifier, access_token, refresh_token, " +
      "access_token_encrypted, refresh_token_encrypted, scope, scopes, expires_at, account_display, " +
      "metadata_json, is_active, created_at, updated_at, revoked_at, refresh_failure_count" +
    ") VALUES (?, '', '', ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, 0) " +
    "ON CONFLICT(user_id, provider, account_identifier) DO UPDATE SET " +
      "access_token = NULL, refresh_token = NULL, access_token_encrypted = excluded.access_token_encrypted, " +
      "refresh_token_encrypted = COALESCE(excluded.refresh_token_encrypted, user_oauth_tokens.refresh_token_encrypted), " +
      "scope = excluded.scope, scopes = excluded.scopes, expires_at = excluded.expires_at, " +
      "account_display = excluded.account_display, metadata_json = excluded.metadata_json, is_active = 1, " +
      "revoked_at = NULL, refresh_failure_count = 0, updated_at = excluded.updated_at"
  ).bind(
    userId, PROVIDER, account, accessEnc, refreshEnc, scopes, scopes, expiresAt,
    account, metadata, now, now
  ).run();
}

export async function beginGmailOAuth(request, env, userId) {
  const clientId = clean(env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(env.GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) return json({ ok: false, error: "google_web_client_not_configured" }, 503);
  if (!vaultMaterial(env)) return json({ ok: false, error: "vault_required" }, 503);

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = "gmail_" + b64url(randomBytes(18));
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const returnTo = safeReturnTo(body.return_to || "/mail");
  await saveOauthState(env, { state, userId, verifier, returnTo });

  const url = new URL(request.url);
  const redirectUri = url.origin + "/api/oauth/google/callback";
  const auth = new URL(GOOGLE_AUTH_URL);
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  auth.searchParams.set("state", state);
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");
  auth.searchParams.set("include_granted_scopes", "true");
  return json({ ok: true, authorize_url: auth.toString() });
}

export function isGmailOAuthCallbackRequest(request) {
  const url = new URL(request.url);
  return url.pathname === "/api/oauth/google/callback" && clean(url.searchParams.get("state")).startsWith("gmail_");
}

export async function completeGmailOAuth(request, env) {
  const url = new URL(request.url);
  const state = clean(url.searchParams.get("state"));
  const code = clean(url.searchParams.get("code"));
  const error = clean(url.searchParams.get("error"));
  if (!state || !code || error) return new Response("Gmail authorization failed.", { status: 400 });

  const pending = await consumeOauthState(env, state);
  if (!pending) {
    return new Response("Gmail authorization expired. Return to AgentSam and retry.", { status: 400 });
  }

  const redirectUri = url.origin + "/api/oauth/google/callback";
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: pending.code_verifier,
      client_id: clean(env.GOOGLE_CLIENT_ID),
      client_secret: clean(env.GOOGLE_CLIENT_SECRET),
      redirect_uri: redirectUri,
    }),
  });
  const tokens = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokens.access_token) {
    return new Response("Google token exchange failed.", { status: 502 });
  }

  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: "Bearer " + tokens.access_token },
  });
  const profile = await profileResponse.json().catch(() => ({}));
  const email = clean(profile.email);
  if (!profileResponse.ok || !email) return new Response("Google account email unavailable.", { status: 502 });

  await persistGrant(env, clean(pending.user_id), tokens, email);
  const target = new URL(safeReturnTo(pending.return_to), url.origin);
  target.searchParams.set("gmail", "connected");
  return Response.redirect(target.toString(), 302);
}

async function accessToken(env, userId, accountIdentifier = "") {
  const row = await activeRow(env, userId, accountIdentifier);
  if (!row) return { row: null, token: "" };
  const material = vaultMaterial(env);
  if (!material) return { row, token: "" };
  const account = clean(row.account_identifier);
  const aad = oauthAad(PROVIDER, userId, account);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(row.expires_at || 0);
  if ((!expiresAt || expiresAt > now + 90) && (row.access_token_encrypted || row.access_token)) {
    const token = await readStoredOauthToken(material, row, "access", aad);
    if (token) return { row, token };
  }

  const refresh = await readStoredOauthToken(material, row, "refresh", aad);
  if (!refresh) return { row, token: "" };
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: clean(env.GOOGLE_CLIENT_ID),
      client_secret: clean(env.GOOGLE_CLIENT_SECRET),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) return { row, token: "" };
  const encrypted = await sealOauthToken(material, payload.access_token, aad);
  await env.DB.prepare(
    "UPDATE user_oauth_tokens SET access_token_encrypted = ?, expires_at = ?, updated_at = ?, " +
      "last_refresh_at = ?, last_refresh_error_code = NULL WHERE user_id = ? AND provider = ? AND account_identifier = ?"
  ).bind(
    encrypted,
    now + Math.max(60, Number(payload.expires_in || 3600)),
    now,
    now,
    userId,
    PROVIDER,
    account
  ).run();
  return { row, token: payload.access_token };
}

export async function gmailConnectionStatus(env, userId, accountIdentifier = "") {
  const row = await activeRow(env, userId, accountIdentifier);
  return row
    ? {
        id: PROVIDER + ":" + clean(row.account_identifier),
        provider: PROVIDER,
        label: "Gmail",
        kind: "mailbox",
        status: "connected",
        accountLabel: clean(row.account_display || row.account_identifier),
        accountIdentifier: clean(row.account_identifier),
        capabilities: ["mail.read", "mail.send", "mail.modify"],
      }
    : null;
}

function header(message, name) {
  const headers = message?.payload?.headers || [];
  return clean(headers.find((item) => String(item?.name || "").toLowerCase() === name.toLowerCase())?.value);
}

function receivedLabel(internalDate) {
  const ts = Number(internalDate || 0);
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + "m";
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + "h";
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + "d";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export async function loadGmailMessages(env, userId, accountIdentifier = "") {
  const auth = await accessToken(env, userId, accountIdentifier);
  if (!auth.token) return [];
  const listUrl = new URL(GMAIL_API + "/messages");
  listUrl.searchParams.set("maxResults", "24");
  listUrl.searchParams.append("labelIds", "INBOX");
  const listResponse = await fetch(listUrl, { headers: { authorization: "Bearer " + auth.token } });
  const list = await listResponse.json().catch(() => ({}));
  if (!listResponse.ok) return [];
  const ids = Array.isArray(list.messages) ? list.messages.slice(0, 24) : [];
  const messages = await Promise.all(ids.map(async ({ id }) => {
    const messageUrl = new URL(GMAIL_API + "/messages/" + encodeURIComponent(id));
    messageUrl.searchParams.set("format", "metadata");
    for (const name of ["From", "To", "Subject", "Date"]) messageUrl.searchParams.append("metadataHeaders", name);
    const response = await fetch(messageUrl, { headers: { authorization: "Bearer " + auth.token } });
    const message = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    const labels = Array.isArray(message.labelIds) ? message.labelIds : [];
    return {
      id: clean(message.id),
      from: header(message, "From") || "Unknown sender",
      to: header(message, "To"),
      subject: header(message, "Subject") || "(no subject)",
      preview: clean(message.snippet),
      receivedLabel: receivedLabel(message.internalDate),
      unread: labels.includes("UNREAD"),
      starred: labels.includes("STARRED"),
    };
  }));
  return messages.filter(Boolean);
}

export async function mutateGmailMessage(env, userId, messageId, patch = {}, accountIdentifier = "") {
  const auth = await accessToken(env, userId, accountIdentifier);
  if (!auth.token) throw new Error("gmail_not_connected");
  const addLabelIds = [];
  const removeLabelIds = [];
  if (patch.is_archived === 1 || patch.is_archived === true) removeLabelIds.push("INBOX");
  if (patch.is_starred === 1 || patch.is_starred === true) addLabelIds.push("STARRED");
  if (patch.is_starred === 0 || patch.is_starred === false) removeLabelIds.push("STARRED");
  if (!addLabelIds.length && !removeLabelIds.length) return { ok: true };

  const response = await fetch(
    GMAIL_API + "/messages/" + encodeURIComponent(messageId) + "/modify",
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + auth.token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    },
  );
  if (!response.ok) throw new Error("gmail_message_update_failed");
  return { ok: true };
}

export async function sendGmailMessage(env, userId, input = {}, accountIdentifier = "") {
  const auth = await accessToken(env, userId, accountIdentifier);
  if (!auth.token) throw new Error("gmail_not_connected");
  const to = clean(input.to);
  const subject = clean(input.subject);
  const body = String(input.body || "");
  if (!to) throw new Error("mail_recipient_required");

  const mime = [
    "To: " + to,
    "Subject: " + subject,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ].join("\r\n");
  const raw = Buffer.from(mime, "utf8").toString("base64url");
  const response = await fetch(GMAIL_API + "/messages/send", {
    method: "POST",
    headers: {
      authorization: "Bearer " + auth.token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!response.ok) throw new Error("gmail_send_failed");
  return { ok: true };
}

export async function disconnectGmail(env, userId, accountIdentifier = "") {
  const account = clean(accountIdentifier);
  if (!account) throw new Error("mail_connection_required");
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE user_oauth_tokens SET is_active = 0, revoked_at = ?, access_token = NULL, refresh_token = NULL, " +
      "access_token_encrypted = NULL, refresh_token_encrypted = NULL, updated_at = ? " +
      "WHERE user_id = ? AND LOWER(provider) = ? AND account_identifier = ?"
  ).bind(now, now, userId, PROVIDER, account).run();
  return { ok: true };
}
