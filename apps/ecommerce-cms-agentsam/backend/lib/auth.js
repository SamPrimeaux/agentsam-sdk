/**
 * Admin auth — auth_users + auth_sessions (PBKDF2, httpOnly cookie).
 */

import { resolveApplicationAccountId } from "./account-context.js";

const ITERATIONS = 100000;
const SESSION_DAYS = 7;
const COOKIE_NAME = "commerce_admin_session";

function toHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function pbkdf2(password, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return toHex(bits);
}

export function newAuthUserId() {
  return `au_${toHex(crypto.getRandomValues(new Uint8Array(8)))}`;
}

export async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = toHex(saltBytes);
  const hash = await pbkdf2(password, saltBytes);
  return { hash, salt };
}

export async function verifyPassword(password, hash, salt) {
  const computed = await pbkdf2(password, fromHex(salt));
  return computed === hash;
}

async function sha256Hex(input) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return toHex(digest);
}

function randomToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return out;
}

async function touchLogin(env, userId) {
  await env.DB.prepare(
    `UPDATE auth_users
     SET last_login_at = ?, login_count = COALESCE(login_count, 0) + 1, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(Math.floor(Date.now() / 1000), userId)
    .run();
}

export async function createSession(env, userId, explicitAccountId = null) {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  const accountId = await resolveApplicationAccountId(env, explicitAccountId);
  if (!accountId) throw new Error("application_account_not_configured");

  await env.DB.prepare(
    `INSERT INTO auth_sessions (token_hash, user_id, active_account_id, expires_at) VALUES (?, ?, ?, ?)`
  )
    .bind(tokenHash, String(userId), accountId, expiresAt)
    .run();

  await touchLogin(env, userId);

  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getSessionUser(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const tokenHash = await sha256Hex(token);

  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.display_name, u.name, u.avatar_url,
            COALESCE(s.active_account_id, u.default_account_id) AS account_id
     FROM auth_sessions s
     JOIN auth_users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.status = 'active'`
  )
    .bind(tokenHash)
    .first();

  return row || null;
}

export async function destroySession(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[COOKIE_NAME];
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`).bind(tokenHash).run();
}

export async function findAuthUserByEmail(env, email) {
  return env.DB.prepare(
    `SELECT id, email, password_hash, salt, role, status, default_account_id
     FROM auth_users
     WHERE email = ? AND status = 'active'`
  )
    .bind(email.trim().toLowerCase())
    .first();
}
