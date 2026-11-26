import { loadStorePreferences, verifyStorefrontPassword } from "../admin/store.js";
import {
  createPasswordGateToken,
  verifyPasswordGateToken,
} from "@inneranimalmedia/agentsam-sdk/identity/core/password-gate";
import { renderStorePasswordPortal } from "@inneranimalmedia/agentsam-sdk/identity/frontend/auth-portal/store-access";

const ACCESS_COOKIE = "__Host-iam-store-access";
const ACCESS_SECONDS = 7 * 24 * 60 * 60;
const ACCESS_RATE_LIMIT = 10;
const ACCESS_RATE_WINDOW_SECONDS = 10 * 60;

// Prefer a dedicated gate secret. The bridge key is a domain-separated,
// backwards-compatible fallback for existing hosted Worker deployments.
function accessSigningSecret(env) {
  return String(env?.STOREFRONT_ACCESS_SECRET || env?.AGENTSAM_BRIDGE_KEY || "");
}

async function accessRateLimitKey(request, siteId) {
  const rawIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawIp));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
  return `store-access-attempts:${siteId}:${fingerprint}`;
}

async function accessAttempts(env, key) {
  if (!env?.CMS_CACHE) return 0;
  try { return Math.max(0, Number(await env.CMS_CACHE.get(key)) || 0); }
  catch { return 0; }
}

async function recordAccessAttempt(env, key, attempts) {
  if (!env?.CMS_CACHE) return;
  try {
    if (attempts <= 0) await env.CMS_CACHE.delete(key);
    else await env.CMS_CACHE.put(key, String(attempts), { expirationTtl: ACCESS_RATE_WINDOW_SECONDS });
  } catch { /* Password verification remains available if the optional rate-limit cache is down. */ }
}

export const createStorefrontAccessToken = createPasswordGateToken;
export const verifyStorefrontAccessToken = verifyPasswordGateToken;

function cookieValue(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    return part.slice(index + 1).trim();
  }
  return "";
}

function accessCookie(token) {
  return `${ACCESS_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ACCESS_SECONDS}`;
}

function clearAccessCookie() {
  return `${ACCESS_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function safeReturnTo(value) {
  const target = String(value || "/").trim();
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("\\") || target.startsWith("/api/") || target.startsWith("/admin")) return "/";
  return target.slice(0, 2048);
}

function accessPage(siteName, returnTo, error = "", settings = {}) {
  return renderStorePasswordPortal({
    siteName,
    returnTo,
    error,
    logoUrl: settings.navLogoUrl || "",
    accent: settings.navBrandAccent || "",
  });
}

function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
      "x-content-type-options": "nosniff",
      "vary": "Cookie",
      ...headers,
    },
  });
}

function jsonResponse(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { "cache-control": "private, no-store", ...headers } });
}

function bypassAccessGate(pathname, method) {
  if (method === "OPTIONS") return true;
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml" || pathname === "/catalog-image" || pathname === "/api/health" || pathname === "/api/company" || pathname === "/api/storefront/identity/company" || pathname === "/api/newsletter/confirm" || pathname === "/api/newsletter/unsubscribe") return true;
  if (pathname === "/api/storefront/access") return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname.startsWith("/media/") || pathname.startsWith("/api/admin/") || pathname.startsWith("/api/internal/") || pathname.startsWith("/api/webhooks/") || pathname.startsWith("/api/agentsam/webhooks/")) return true;
  return false;
}

export async function handleStorefrontAccessApi(request, env, url) {
  if (url.pathname !== "/api/storefront/access") return null;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, { allow: "POST" });
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== url.origin) return jsonResponse({ ok: false, error: "same_origin_required" }, 403);
    } catch {
      return jsonResponse({ ok: false, error: "same_origin_required" }, 403);
    }
  }

  const contentType = request.headers.get("content-type") || "";
  let password = "";
  let returnTo = "/";
  let wantsJson = contentType.includes("application/json");
  try {
    if (wantsJson) {
      const body = await request.json();
      password = String(body?.password || "");
      returnTo = safeReturnTo(body?.return_to);
    } else {
      const form = await request.formData();
      password = String(form.get("password") || "");
      returnTo = safeReturnTo(form.get("return_to"));
    }
  } catch {
    return wantsJson ? jsonResponse({ ok: false, error: "invalid_request" }, 400) : htmlResponse(accessPage("This store", "/", "Enter the store password to continue."), 400);
  }
  if (!password || password.length > 128) {
    return wantsJson
      ? jsonResponse({ ok: false, error: "invalid_request" }, 400)
      : htmlResponse(accessPage("This store", "/", "Enter a valid store password."), 400);
  }

  const loaded = await loadStorePreferences(env, { hostname: url.hostname, allowCache: false });
  if (!loaded.ok) return wantsJson ? jsonResponse({ ok: false, error: "store_not_found" }, 404) : htmlResponse("Store not found", 404);
  if (!loaded.settings.passwordProtection) {
    return new Response(null, { status: 303, headers: { location: new URL(returnTo, url.origin).href, "set-cookie": clearAccessCookie(), "cache-control": "no-store" } });
  }
  if (!loaded.settings.storePasswordHash || !loaded.settings.storePasswordSalt) {
    return wantsJson ? jsonResponse({ ok: false, error: "store_password_unavailable" }, 503) : htmlResponse(accessPage(loaded.site.name, returnTo, "Store password protection is not configured correctly.", loaded.settings), 503);
  }
  const signingSecret = accessSigningSecret(env);
  if (signingSecret.length < 32) {
    return wantsJson
      ? jsonResponse({ ok: false, error: "store_access_signing_secret_unavailable" }, 503)
      : htmlResponse(accessPage(loaded.site.name, returnTo, "Store access is temporarily unavailable. Please contact the store owner.", loaded.settings), 503);
  }

  const rateKey = await accessRateLimitKey(request, loaded.site.id);
  const attempts = await accessAttempts(env, rateKey);
  if (attempts >= ACCESS_RATE_LIMIT) {
    return wantsJson
      ? jsonResponse({ ok: false, error: "too_many_attempts", retryAfter: ACCESS_RATE_WINDOW_SECONDS }, 429, { "retry-after": String(ACCESS_RATE_WINDOW_SECONDS) })
      : htmlResponse(accessPage(loaded.site.name, returnTo, "Too many attempts. Please wait a few minutes and try again.", loaded.settings), 429, { "retry-after": String(ACCESS_RATE_WINDOW_SECONDS) });
  }
  const valid = await verifyStorefrontPassword(env, password, { hostname: url.hostname });
  if (!valid) {
    await recordAccessAttempt(env, rateKey, attempts + 1);
    return wantsJson
      ? jsonResponse({ ok: false, error: "invalid_store_password" }, 401)
      : htmlResponse(accessPage(loaded.site.name, returnTo, "That password did not match. Try again.", loaded.settings), 401);
  }
  await recordAccessAttempt(env, rateKey, 0);

  const token = await createStorefrontAccessToken({
    siteId: loaded.site.id,
    passwordHash: loaded.settings.storePasswordHash,
    passwordSalt: loaded.settings.storePasswordSalt,
    signingSecret,
  });
  const headers = { "set-cookie": accessCookie(token), "cache-control": "private, no-store" };
  if (wantsJson) return jsonResponse({ ok: true, redirect_to: returnTo }, 200, headers);
  return new Response(null, { status: 303, headers: { ...headers, location: new URL(returnTo, url.origin).href } });
}

export async function storefrontAccessGate(request, env, url = new URL(request.url)) {
  if (bypassAccessGate(url.pathname, request.method)) return null;
  if (!env?.DB) {
    return new Response("Store access could not be verified. Please try again shortly.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
    });
  }

  const loaded = await loadStorePreferences(env, { hostname: url.hostname, allowCache: false });
  if (!loaded.ok) {
    if (["cms_site_context_required", "cms_site_not_found", "store_site_not_found"].includes(loaded.error)) return null;
    return new Response("Store access could not be verified. Please try again shortly.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
    });
  }
  if (!loaded.settings.passwordProtection) return null;
  if (!loaded.settings.storePasswordHash || !loaded.settings.storePasswordSalt) {
    return new Response("Store password protection is enabled but has not been configured. Contact the store owner.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
    });
  }
  const signingSecret = accessSigningSecret(env);
  if (signingSecret.length < 32) {
    return new Response("Store access could not be verified. Please contact the store owner.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
    });
  }

  const token = cookieValue(request, ACCESS_COOKIE);
  const authorized = await verifyStorefrontAccessToken(token, {
    siteId: loaded.site.id,
    passwordHash: loaded.settings.storePasswordHash,
    passwordSalt: loaded.settings.storePasswordSalt,
    signingSecret,
  });
  if (authorized) return null;

  if (url.pathname.startsWith("/api/")) {
    return jsonResponse({ ok: false, error: "store_password_required", message: "Enter the store password to continue." }, 401);
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Store password required", { status: 401, headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
  }
  const returnTo = safeReturnTo(url.pathname + url.search);
  return htmlResponse(accessPage(loaded.site.name, returnTo, "", loaded.settings));
}
