/**
 * Admin GitHub OAuth — scoped to InnerAnimalMedia/commerce-demo via post-auth repo check.
 *
 * Register OAuth App: https://github.com/settings/developers
 *   Name: Ember Supply AgentSam
 *   Homepage: https://ember.example/admin/agentsam
 *   Callback: https://ember.example/api/admin/agentsam/github/callback
 *
 * Secrets: COMMERCE_GITHUB_CLIENT_ID, COMMERCE_GITHUB_CLIENT_SECRET
 */

import { adminLoginPath } from "../lib/admin-routes.js";
import { getSessionUser } from "../lib/auth.js";
import { resolveGithubRepo } from "../lib/integration-config.js";
import { githubStatus } from "../agentsam/github-client.js";

const OAUTH_STATE_COOKIE = "commerce_github_oauth_state";
const SCOPES = "read:user repo";

function json(data, init = {}) {
  return Response.json(data, init);
}

function redirect(url, status = 302) {
  return Response.redirect(url, status);
}

function cookie(name, value, maxAgeSec) {
  const secure = "Secure; ";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=${maxAgeSec}`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function callbackUrl(request) {
  return new URL("/api/admin/agentsam/github/callback", request.url).toString();
}

function agentsamUrl(request, params = "") {
  const u = new URL("/admin/agentsam", request.url);
  if (params) u.search = params;
  return u.toString();
}

async function verifyRepoAccess(env, token) {
  const resolved = await resolveGithubRepo(env);
  if (!resolved.ok || !resolved.repo) {
    throw new Error(resolved.error || "github_repo_not_configured");
  }
  const [owner, repo] = resolved.repo.split("/");
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Embertime-AgentSam/1.0",
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `Cannot access ${resolved.repo}`);
  }
  return res.json();
}

export async function agentsamGithubOAuthStart(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return redirect(new URL(adminLoginPath(), request.url).toString());

  const clientId = String(env.COMMERCE_GITHUB_CLIENT_ID || "").trim();
  const clientSecret = String(env.COMMERCE_GITHUB_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    return redirect(agentsamUrl(request, "github=oauth_not_configured"));
  }

  const state = crypto.randomUUID();
  const stateHash = await sha256Hex(state);

  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl(request));
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("allow_signup", "false");

  if (env.CMS_CACHE) {
    await env.CMS_CACHE.put(`github_oauth:${stateHash}`, user.id, { expirationTtl: 600 });
  }

  const headers = new Headers();
  headers.append("Set-Cookie", cookie(OAUTH_STATE_COOKIE, state, 600));
  headers.set("Location", authUrl.toString());
  return new Response(null, { status: 302, headers });
}

export async function agentsamGithubOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) return redirect(agentsamUrl(request, `github=denied`));

  const cookies = Object.fromEntries(
    (request.headers.get("cookie") || "")
      .split(";")
      .map((p) => p.trim().split("="))
      .filter(([k]) => k)
      .map(([k, v]) => [k, decodeURIComponent(v || "")])
  );
  const cookieState = cookies[OAUTH_STATE_COOKIE];
  if (!state || !cookieState || state !== cookieState) {
    return redirect(agentsamUrl(request, "github=bad_state"));
  }

  const stateHash = await sha256Hex(state);
  const userId = env.CMS_CACHE ? await env.CMS_CACHE.get(`github_oauth:${stateHash}`) : null;
  if (!userId) return redirect(agentsamUrl(request, "github=expired"));

  const clientId = String(env.COMMERCE_GITHUB_CLIENT_ID || "").trim();
  const clientSecret = String(env.COMMERCE_GITHUB_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret || !code) {
    return redirect(agentsamUrl(request, "github=oauth_not_configured"));
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl(request),
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  const accessToken = tokenData.access_token;
  if (!accessToken) return redirect(agentsamUrl(request, "github=token_failed"));

  let repoMeta;
  let scopedRepo;
  try {
    const resolved = await resolveGithubRepo(env);
    scopedRepo = resolved.repo;
    repoMeta = await verifyRepoAccess(env, accessToken);
  } catch (e) {
    return redirect(agentsamUrl(request, `github=no_repo_access`));
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Embertime-AgentSam/1.0",
    },
  });
  const ghUser = await userRes.json().catch(() => ({}));

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
    : null;

  await env.DB.prepare(
    `INSERT INTO admin_github_tokens (user_id, provider, access_token, account_login, scopes, repo_scope, expires_at, updated_at)
     VALUES (?, 'github', ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, provider) DO UPDATE SET
       access_token = excluded.access_token,
       account_login = excluded.account_login,
       scopes = excluded.scopes,
       repo_scope = excluded.repo_scope,
       expires_at = excluded.expires_at,
       updated_at = datetime('now')`
  )
    .bind(
      userId,
      accessToken,
      ghUser.login || null,
      SCOPES,
      scopedRepo || repoMeta?.full_name || null,
      expiresAt
    )
    .run();

  await env.CMS_CACHE?.delete(`github_oauth:${stateHash}`);

  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(OAUTH_STATE_COOKIE));
  headers.set("Location", agentsamUrl(request, "github=connected"));
  return new Response(null, { status: 302, headers });
}

export async function agentsamGithubOAuthStatus(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const status = await githubStatus(env, user.id);
  const resolved = await resolveGithubRepo(env);
  const oauthConfigured = Boolean(
    String(env.COMMERCE_GITHUB_CLIENT_ID || "").trim() && String(env.COMMERCE_GITHUB_CLIENT_SECRET || "").trim()
  );

  return json({
    ok: true,
    scoped_repo: status.scoped_repo || resolved.repo,
    oauth_app_configured: oauthConfigured,
    connect_url: oauthConfigured ? "/api/admin/agentsam/github/start" : null,
    service_token: Boolean(String(env.COMMERCE_GITHUB_TOKEN || "").trim()),
    ...status,
  });
}

export async function agentsamGithubOAuthDisconnect(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  await env.DB.prepare(`DELETE FROM admin_github_tokens WHERE user_id = ? AND provider = 'github'`)
    .bind(user.id)
    .run();

  return json({ ok: true, disconnected: true });
}
