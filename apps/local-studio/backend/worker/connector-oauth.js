import { createHash, randomBytes } from "node:crypto";
import {
  oauthAad,
  sealOauthToken,
} from "../../../../packages/agentsam-vault/src/crypto/oauth-envelope.js";
import {
  b64url,
  clean,
  consumeOauthState,
  readStoredOauthToken,
  safeReturnTo,
  saveOauthState,
  vaultMaterial,
} from "./gmail-service.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

/**
 * Provider table for the non-mail OAuth plugins. Gmail keeps its own service because it also
 * owns the mailbox API; everything here only needs connect / status / disconnect.
 * `provider` is the user_oauth_tokens.provider and the agentsam_plugins.provider_key.
 */
export const CONNECTOR_PROVIDERS = Object.freeze({
  google_drive: {
    provider: "google_drive",
    label: "Google Drive",
    kind: "google",
    statePrefix: "gdrive_",
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/drive.file"],
  },
  google_calendar: {
    provider: "google_calendar",
    label: "Google Calendar",
    kind: "google",
    statePrefix: "gcal_",
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar.events"],
  },
  github: {
    provider: "github",
    label: "GitHub",
    kind: "github",
    statePrefix: "ghub_",
    scopes: ["offline_access"], // GitHub App identity permissions come from app installation.
  },
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function connectorProvider(key) {
  return CONNECTOR_PROVIDERS[clean(key).toLowerCase()] || null;
}

function stateProvider(def) {
  return "connector_" + def.provider;
}

function callbackPath(def) {
  return def.kind === "github" ? "/api/oauth/github/callback" : "/api/oauth/google/callback";
}

function clientCreds(env, def) {
  return def.kind === "github"
    ? { id: clean(env.GITHUB_CLIENT_ID), secret: clean(env.GITHUB_CLIENT_SECRET), missing: "github_client_not_configured" }
    : { id: clean(env.GOOGLE_CLIENT_ID), secret: clean(env.GOOGLE_CLIENT_SECRET), missing: "google_web_client_not_configured" };
}

/** Resolve which provider a callback belongs to from its one-time state prefix. */
export function connectorForCallback(request) {
  const url = new URL(request.url);
  const state = clean(url.searchParams.get("state"));
  for (const def of Object.values(CONNECTOR_PROVIDERS)) {
    if (url.pathname === callbackPath(def) && state.startsWith(def.statePrefix)) return def;
  }
  return null;
}

export function isConnectorOAuthCallbackRequest(request) {
  return connectorForCallback(request) !== null;
}

export function connectionIdParts(connectionId) {
  const raw = clean(connectionId);
  const index = raw.indexOf(":");
  if (index <= 0) return { provider: "", accountIdentifier: "" };
  return { provider: raw.slice(0, index).toLowerCase(), accountIdentifier: raw.slice(index + 1) };
}

export async function beginConnectorOAuth(request, env, userId, key) {
  const def = connectorProvider(key);
  if (!def) return json({ ok: false, error: "connector_provider_unknown" }, 404);
  const creds = clientCreds(env, def);
  if (!creds.id || !creds.secret) return json({ ok: false, error: creds.missing }, 503);
  if (!vaultMaterial(env)) return json({ ok: false, error: "vault_required" }, 503);

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = def.statePrefix + b64url(randomBytes(18));
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const returnTo = safeReturnTo(body.return_to || "/settings/customize?view=plugins");
  await saveOauthState(env, {
    state, userId, verifier, returnTo,
    provider: stateProvider(def), resource: def.provider,
  });

  const redirectUri = new URL(request.url).origin + callbackPath(def);
  const auth = new URL(def.kind === "github" ? GITHUB_AUTH_URL : GOOGLE_AUTH_URL);
  auth.searchParams.set("client_id", creds.id);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", state);
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");
  auth.searchParams.set("scope", def.scopes.join(" "));
  if (def.kind !== "github") {
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("access_type", "offline");
    auth.searchParams.set("prompt", "consent");
    auth.searchParams.set("include_granted_scopes", "true");
  }
  return json({ ok: true, authorize_url: auth.toString() });
}

async function exchangeCode(env, def, code, verifier, redirectUri) {
  const creds = clientCreds(env, def);
  const form = new URLSearchParams({
    client_id: creds.id,
    client_secret: creds.secret,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });
  if (def.kind !== "github") form.set("grant_type", "authorization_code");
  const response = await fetch(def.kind === "github" ? GITHUB_TOKEN_URL : GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form,
  });
  const tokens = await response.json().catch(() => ({}));
  return response.ok && tokens.access_token && !tokens.error ? tokens : null;
}

async function fetchProfile(def, accessToken) {
  if (def.kind === "github") {
    const response = await fetch(GITHUB_USER_URL, {
      headers: {
        authorization: "Bearer " + accessToken,
        accept: "application/vnd.github+json",
        "user-agent": "agentsam-local-studio",
      },
    });
    const profile = await response.json().catch(() => ({}));
    const login = clean(profile.login);
    if (!response.ok || !login) return null;
    return { identifier: login, display: clean(profile.name) || login, email: clean(profile.email).toLowerCase() };
  }
  const response = await fetch(GOOGLE_USERINFO_URL, { headers: { authorization: "Bearer " + accessToken } });
  const profile = await response.json().catch(() => ({}));
  const email = clean(profile.email).toLowerCase();
  if (!response.ok || !email) return null;
  return { identifier: email, display: email, email };
}

async function persistConnectorGrant(env, userId, def, tokens, profile) {
  const material = vaultMaterial(env);
  if (!material) throw new Error("vault_required");
  const account = profile.identifier;
  const aad = oauthAad(def.provider, userId, account);
  const existing = await env.DB.prepare(
    "SELECT refresh_token_encrypted, access_token_encrypted FROM user_oauth_tokens " +
      "WHERE account_id = ? AND LOWER(provider) = ? AND account_identifier = ? LIMIT 1"
  ).bind(userId, def.provider, account).first();
  const refreshToken = clean(tokens.refresh_token)
    || (existing ? await readStoredOauthToken(material, existing, "refresh", aad) : "");
  const accessEnc = await sealOauthToken(material, clean(tokens.access_token), aad);
  const refreshEnc = refreshToken ? await sealOauthToken(material, refreshToken, aad) : null;
  const scopes = def.kind === "github" ? "" : (clean(tokens.scope).replace(/,/g, " ") || def.scopes.join(" "));
  const now = Math.floor(Date.now() / 1000);
  // GitHub App user tokens may expire; persist expiry/refresh token when GitHub returns them.
  const expiresAt = tokens.expires_in ? now + Math.max(60, Number(tokens.expires_in)) : null;
  const metadata = JSON.stringify({
    status: "connected", product: "agentsam-work", provider: def.provider,
    email: profile.email || null, display: profile.display,
  });

  await env.DB.prepare(
    "INSERT INTO user_oauth_tokens (" +
      "account_id, provider, account_identifier, access_token_encrypted, refresh_token_encrypted, " +
      "scopes, expires_at, metadata_json, is_active, created_at, updated_at, revoked_at, refresh_failure_count" +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, 0) " +
    "ON CONFLICT(account_id, provider, account_identifier) DO UPDATE SET " +
      "access_token_encrypted = excluded.access_token_encrypted, " +
      "refresh_token_encrypted = COALESCE(excluded.refresh_token_encrypted, user_oauth_tokens.refresh_token_encrypted), " +
      "scopes = excluded.scopes, expires_at = excluded.expires_at, " +
      "metadata_json = excluded.metadata_json, is_active = 1, " +
      "revoked_at = NULL, refresh_failure_count = 0, last_refresh_error_code = NULL, updated_at = excluded.updated_at"
  ).bind(userId, def.provider, account, accessEnc, refreshEnc, scopes, expiresAt, metadata, now, now).run();

  // Installation row is a non-fatal projection: connection state is also derived from the token row.
  try {
    const plugin = await env.DB.prepare(
      "SELECT id FROM agentsam_plugins WHERE provider_key = ? AND plugin_kind = 'oauth' LIMIT 1"
    ).bind(def.provider).first();
    if (plugin?.id) {
      await env.DB.prepare(
        "INSERT INTO agentsam_plugin_installations (account_id, plugin_id, instance_key, enabled, setup_status, secret_ref, " +
          "health_status, last_health_at, last_healthy_at, consecutive_failures, last_error_code, created_at, updated_at) " +
        "VALUES (?, ?, ?, 1, 'connected', ?, 'healthy', ?, ?, 0, NULL, ?, ?) " +
        "ON CONFLICT(account_id, plugin_id, instance_key) DO UPDATE SET " +
          "setup_status = 'connected', secret_ref = excluded.secret_ref, health_status = 'healthy', " +
          "last_health_at = excluded.last_health_at, last_healthy_at = excluded.last_healthy_at, " +
          "consecutive_failures = 0, last_error_code = NULL, updated_at = excluded.updated_at"
      ).bind(
        userId, plugin.id, account, "oauth:" + def.provider + ":" + account, now, now, now, now
      ).run();
    }
  } catch {
    // Non-fatal: the plugin list falls back to token-row state.
  }
}

export async function completeConnectorOAuth(request, env) {
  const def = connectorForCallback(request);
  if (!def) return new Response("Unknown connector callback.", { status: 400 });
  const url = new URL(request.url);
  const state = clean(url.searchParams.get("state"));
  const code = clean(url.searchParams.get("code"));
  if (!state || !code || clean(url.searchParams.get("error"))) {
    return new Response(def.label + " authorization failed.", { status: 400 });
  }
  const pending = await consumeOauthState(env, state, stateProvider(def));
  if (!pending) {
    return new Response(def.label + " authorization expired. Return to AgentSam and retry.", { status: 400 });
  }
  const tokens = await exchangeCode(env, def, code, pending.code_verifier, url.origin + callbackPath(def));
  if (!tokens) return new Response(def.label + " token exchange failed.", { status: 502 });
  const profile = await fetchProfile(def, tokens.access_token);
  if (!profile) return new Response(def.label + " account unavailable.", { status: 502 });

  await persistConnectorGrant(env, clean(pending.user_id), def, tokens, profile);
  const target = new URL(safeReturnTo(pending.return_to), url.origin);
  target.searchParams.set("provider", def.provider);
  target.searchParams.set("result", "connected");
  return Response.redirect(target.toString(), 302);
}

export async function disconnectConnector(env, userId, connectionId) {
  const { provider, accountIdentifier } = connectionIdParts(connectionId);
  const def = connectorProvider(provider);
  if (!def || !accountIdentifier) throw new Error("connection_required");
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE user_oauth_tokens SET is_active = 0, revoked_at = ?, " +
      "access_token_encrypted = NULL, refresh_token_encrypted = NULL, updated_at = ? " +
      "WHERE account_id = ? AND LOWER(provider) = ? AND account_identifier = ?"
  ).bind(now, now, userId, def.provider, accountIdentifier).run();
  try {
    await env.DB.prepare(
      "UPDATE agentsam_plugin_installations SET setup_status = 'unconfigured', health_status = 'unknown', updated_at = ? " +
        "WHERE account_id = ? AND secret_ref = ?"
    ).bind(now, userId, "oauth:" + def.provider + ":" + accountIdentifier).run();
  } catch {
    // Non-fatal projection.
  }
  return { ok: true, provider: def.provider };
}

/**
 * Server-only, account-scoped Google OAuth access for IDE providers.
 * Consumes the existing encrypted user_oauth_tokens SSOT. Never sends a token
 * to the browser, falls back to another Google grant, or guesses an account.
 */
export async function resolveConnectorAccess(env, userId, provider, accountIdentifier, options = {}) {
  const def = connectorProvider(provider);
  if (!def || def.kind !== "google" || !clean(userId) || !clean(accountIdentifier)) {
    return { ok: false, code: "oauth_account_selection_required" };
  }
  let row;
  try {
    row = await env.DB.prepare(
      "SELECT account_identifier, access_token_encrypted, refresh_token_encrypted, scopes, expires_at " +
      "FROM user_oauth_tokens WHERE account_id=? AND LOWER(provider)=? AND account_identifier=? " +
      "AND COALESCE(is_active,1)=1 AND (revoked_at IS NULL OR revoked_at=0) LIMIT 1"
    ).bind(userId, def.provider, accountIdentifier).first();
  } catch {
    return { ok: false, code: "oauth_storage_unavailable" };
  }
  if (!row) return { ok: false, code: "oauth_not_connected" };
  const granted = clean(row.scopes).split(/[,\s]+/).filter(Boolean);
  const allowed = options.requiredScopes || def.scopes.slice(3);
  if (!allowed.some(scope => granted.includes(scope))) {
    return { ok: false, code: "oauth_insufficient_scope", grantedScopes: granted };
  }
  const vault = vaultMaterial(env);
  if (!vault) return { ok: false, code: "oauth_vault_unavailable" };
  const aad = oauthAad(def.provider, userId, accountIdentifier);
  const expires = Number(row.expires_at || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!expires || expires > now + 90) {
    const access = await readStoredOauthToken(vault, row, "access", aad);
    if (access) return { ok: true, accessToken: access, grantedScopes: granted };
  }
  const refreshToken = await readStoredOauthToken(vault, row, "refresh", aad);
  if (!refreshToken || !clean(env.GOOGLE_CLIENT_ID) || !clean(env.GOOGLE_CLIENT_SECRET))
    return { ok: false, code: "oauth_reconnect_required" };
  let result;
  try {
    const res = await (options.fetchImpl || fetch)(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clean(env.GOOGLE_CLIENT_ID),
        client_secret: clean(env.GOOGLE_CLIENT_SECRET),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) return { ok: false, code: "oauth_reconnect_required" };
    result = data;
  } catch {
    return { ok: false, code: "oauth_refresh_unavailable" };
  }
  const accessEncrypted = await sealOauthToken(vault, clean(result.access_token), aad);
  const nextExpiry = now + Math.max(60, Number(result.expires_in || 3600));
  await env.DB.prepare(
    "UPDATE user_oauth_tokens SET access_token_encrypted=?, expires_at=?, updated_at=?, " +
    "last_refresh_at=?, last_refresh_error_code=NULL, refresh_failure_count=0 " +
    "WHERE account_id=? AND LOWER(provider)=? AND account_identifier=? AND COALESCE(is_active,1)=1"
  ).bind(accessEncrypted, nextExpiry, now, now, userId, def.provider, accountIdentifier).run();
  return { ok: true, accessToken: clean(result.access_token), grantedScopes: granted };
}

/**
 * GitHub App user access tokens are permission-scoped by installation/account,
 * not OAuth repo scopes. Refresh encrypted expiring grants on demand.
 */
export async function resolveGithubConnectorAccess(env, userId, account, options={}) {
  if(!clean(userId)||!clean(account))return {ok:false,code:"github_account_selection_required"};
  let row;
  try {
    row=await env.DB.prepare(
      "SELECT access_token_encrypted, refresh_token_encrypted, expires_at, scopes " +
      "FROM user_oauth_tokens WHERE account_id=? AND LOWER(provider)='github' AND account_identifier=? " +
      "AND COALESCE(is_active,1)=1 AND (revoked_at IS NULL OR revoked_at=0) LIMIT 1"
    ).bind(userId,account).first();
  }catch{return {ok:false,code:"github_oauth_storage_unavailable"};}
  if(!row)return {ok:false,code:"github_oauth_required"};
  const material=vaultMaterial(env);
  if(!material)return {ok:false,code:"github_oauth_vault_unavailable"};
  const aad=oauthAad("github",userId,account);
  const now=Math.floor(Date.now()/1000);
  const expires=Number(row.expires_at||0);
  if(!expires||expires>now+90){
    const token=await readStoredOauthToken(material,row,"access",aad);
    return token?{ok:true,accessToken:token}:{ok:false,code:"github_oauth_reconnect_required"};
  }
  const refresh=await readStoredOauthToken(material,row,"refresh",aad);
  if(!refresh||!clean(env.GITHUB_CLIENT_ID)||!clean(env.GITHUB_CLIENT_SECRET))
    return {ok:false,code:"github_oauth_reconnect_required"};
  let data;
  try {
    const response=await (options.fetchImpl||fetch)(GITHUB_TOKEN_URL,{
      method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",accept:"application/json"},
      body:new URLSearchParams({client_id:clean(env.GITHUB_CLIENT_ID),
        client_secret:clean(env.GITHUB_CLIENT_SECRET),grant_type:"refresh_token",refresh_token:refresh}),
    });
    data=await response.json().catch(()=>({}));
    if(!response.ok||!clean(data.access_token)||!clean(data.refresh_token))
      return {ok:false,code:"github_oauth_reconnect_required"};
  }catch{return {ok:false,code:"github_oauth_refresh_unavailable"};}
  const accessEnc=await sealOauthToken(material,clean(data.access_token),aad);
  const refreshEnc=await sealOauthToken(material,clean(data.refresh_token),aad);
  const newExpiry=now+Math.max(60,Number(data.expires_in||28800));
  try {
    const updated=await env.DB.prepare(
      "UPDATE user_oauth_tokens SET access_token_encrypted=?,refresh_token_encrypted=?,expires_at=?,"+
      "updated_at=?,last_refresh_at=?,last_refresh_error_code=NULL,refresh_failure_count=0 "+
      "WHERE account_id=? AND LOWER(provider)='github' AND account_identifier=? AND expires_at=? "+
      "AND COALESCE(is_active,1)=1"
    ).bind(accessEnc,refreshEnc,newExpiry,now,now,userId,account,row.expires_at).run();
    if(updated?.meta?.changes===0)return {ok:false,code:"github_oauth_refresh_concurrent_retry"};
  }catch{return {ok:false,code:"github_oauth_refresh_storage_failed"};}
  return {ok:true,accessToken:clean(data.access_token)};
}

export async function connectorStatus(env, userId, key) {
  const def = connectorProvider(key);
  if (!def) return [];
  try {
    const result = await env.DB.prepare(
      "SELECT account_identifier, json_extract(metadata_json, '$.display') AS account_display, scopes " +
        "FROM user_oauth_tokens WHERE account_id = ? AND LOWER(provider) = ? " +
        "AND COALESCE(is_active, 1) = 1 AND (revoked_at IS NULL OR revoked_at = 0) " +
        "ORDER BY account_identifier COLLATE NOCASE ASC"
    ).bind(userId, def.provider).all();
    return (result?.results || []).map((row) => ({
      id: def.provider + ":" + clean(row.account_identifier),
      provider: def.provider,
      label: def.label,
      status: "connected",
      accountLabel: clean(row.account_display || row.account_identifier),
      accountIdentifier: clean(row.account_identifier),
    }));
  } catch {
    return [];
  }
}

/**
 * A GitHub connection becomes useful only when its stored, account-bound grant
 * can perform a real GitHub read. Tokens stay on the Worker; never return them
 * to Desktop, browser JavaScript or the plugin registry response.
 */
export async function listGitHubConnectionRepositories(request, env, userId, fetcher = fetch) {
  if (request.method !== "GET") return json({ ok:false, error:"method_not_allowed" }, 405);
  const connectionId = new URL(request.url).searchParams.get("connection_id") || "";
  const { provider, accountIdentifier } = connectionIdParts(connectionId);
  if (provider !== "github" || !/^[a-zA-Z0-9-]{1,39}$/.test(accountIdentifier)) {
    return json({ ok:false, error:"github_connection_required" }, 400);
  }
  if (!env.DB?.prepare) return json({ ok:false, error:"database_unavailable" }, 503);
  const material = vaultMaterial(env);
  if (!material) return json({ ok:false, error:"vault_required" }, 503);

  // Use the same actor/account-bound resolver as other GitHub operations.
  // It refreshes an expiring GitHub App user token rather than serving stale
  // credentials, and keeps all secret material on the Worker.
  const grant = await resolveGithubConnectorAccess(env,userId,accountIdentifier,{fetchImpl:fetcher});
  if(!grant.ok) {
    const code=grant.code;
    const status=code==="github_oauth_required"?404
      :code==="github_oauth_vault_unavailable"||code==="github_oauth_storage_unavailable"?503
      :code==="github_oauth_refresh_unavailable"||code==="github_oauth_refresh_storage_failed"?502
      :code==="github_oauth_refresh_concurrent_retry"?409
      :401;
    return json({ok:false,error:code},status);
  }
  const token=grant.accessToken;
  let response;
  try {
    response = await fetcher(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", {
        headers:{
          authorization:"Bearer " + token,
          accept:"application/vnd.github+json",
          "x-github-api-version":"2022-11-28",
          "user-agent":"agentsam-local-studio",
        },
        redirect:"error",
        signal:AbortSignal.timeout(12000),
      });
  } catch (error) {
    // Never forward fetch exception messages: they may include credentials or
    // upstream URLs. A bounded failure kind is sufficient for diagnostics.
    const name=typeof error?.name==="string"?error.name:"";
    const reason=name==="TimeoutError"||name==="AbortError"?"timeout":"transport";
    return json({ ok:false, error:"github_repositories_unreachable", reason }, 502);
  }
  if (response.status === 401 || response.status === 403) {
    return json({ ok:false, error:"github_repository_access_denied", providerStatus:response.status }, 403);
  }
  if (!response.ok) return json({ ok:false, error:"github_repository_list_failed", providerStatus:response.status }, 502);
  const data = await response.json().catch(()=>null);
  if (!Array.isArray(data)) return json({ ok:false, error:"github_repository_response_invalid" }, 502);
  const repositories = data.slice(0,100).filter(repo=>
    repo && typeof repo.full_name==="string" && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo.full_name)
  ).map(repo=>({
    id:String(repo.id || repo.full_name),
    fullName:repo.full_name,
    description:typeof repo.description==="string" ? repo.description.slice(0,280) : "",
    private:repo.private===true,
    defaultBranch:typeof repo.default_branch==="string" ? repo.default_branch : "",
    updatedAt:typeof repo.updated_at==="string" ? repo.updated_at : "",
    htmlUrl:"https://github.com/"+repo.full_name,
    permissions:{
      pull:repo.permissions?.pull===true,
      push:repo.permissions?.push===true,
      admin:repo.permissions?.admin===true,
    },
  }));
  return json({ ok:true, account:accountIdentifier, repositories, limitedTo:100, hasMore:data.length===100 });
}

export function isConnectorWorkRequest(pathname) {
  return pathname === "/api/work/github/repos" || /^\/api\/work\/connect\/(google_drive|google_calendar|github)\/(start|status|disconnect)$/.test(pathname);
}

export async function handleConnectorWorkRequest(request, env, userId) {
  const url = new URL(request.url);
  if (url.pathname === "/api/work/github/repos") return listGitHubConnectionRepositories(request,env,userId);
  const match = url.pathname.match(/^\/api\/work\/connect\/([a-z_]+)\/(start|status|disconnect)$/);
  if (!match) return json({ ok: false, error: "not_found" }, 404);
  const [, key, action] = match;
  if (action === "start" && request.method === "POST") return beginConnectorOAuth(request, env, userId, key);
  if (action === "status" && request.method === "GET") {
    return json({ ok: true, connections: await connectorStatus(env, userId, key) });
  }
  if (action === "disconnect" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    try {
      return json(await disconnectConnector(env, userId, body.connection_id || body.connectionId));
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error) }, 400);
    }
  }
  return json({ ok: false, error: "method_not_allowed" }, 405);
}
