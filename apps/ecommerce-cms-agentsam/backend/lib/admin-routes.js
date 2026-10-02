/** Clean admin URLs — /admin/login instead of /admin/login.html */

import { ADMIN_REDIRECTS } from "./route-manifest.js";

export const ADMIN_CLEAN_PAGES = new Set([
  "login",
  "home",
  "orders",
  "products",
  "product-edit",
  "inventory",
  "subscribers",
  "growth",
  "discounts",
  "scaffold",
  "content",
  "pages",
  "page-edit",
  "theme-editor",
  "store",
  "preferences",
  "email",
  "agentsam",
]);

/** Pages reachable without a session */
export const ADMIN_PUBLIC_PAGES = new Set(["login"]);

/** Clean path → static asset file */
export const ADMIN_CLEAN_ALIASES = {
  "/admin/email": "/admin/dashboard/email.html",
};

/** Legacy .html paths → clean canonical URL (301) — from route-manifest */
export const ADMIN_HTML_TO_CLEAN = Object.fromEntries(ADMIN_REDIRECTS);

export function adminLoginPath() {
  return "/admin/login";
}

export function adminHtmlFile(pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (ADMIN_CLEAN_ALIASES[normalized]) return ADMIN_CLEAN_ALIASES[normalized];

  const match = normalized.match(/^\/admin\/([a-z0-9-]+)$/);
  if (!match || !ADMIN_CLEAN_PAGES.has(match[1])) return null;
  return `/admin/${match[1]}.html`;
}

export function adminCleanUrl(pathname) {
  if (ADMIN_HTML_TO_CLEAN[pathname]) return ADMIN_HTML_TO_CLEAN[pathname];

  const match = pathname.match(/^\/admin\/([a-z0-9-]+)\.html$/);
  if (!match || !ADMIN_CLEAN_PAGES.has(match[1])) return null;
  return `/admin/${match[1]}`;
}

export function isAdminPublicPath(pathname) {
  const clean = pathname.match(/^\/admin\/([a-z0-9-]+)\/?$/);
  if (clean) return ADMIN_PUBLIC_PAGES.has(clean[1]);

  const html = pathname.match(/^\/admin\/([a-z0-9-]+)\.html$/);
  if (html) return ADMIN_PUBLIC_PAGES.has(html[1]);

  return false;
}

export function redirectToAdminLogin(request, { status = 302 } = {}) {
  return Response.redirect(new URL(adminLoginPath(), request.url), status);
}
