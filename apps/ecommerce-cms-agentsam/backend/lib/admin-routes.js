/**
 * Clean admin URL helpers compiled from the canonical route manifest.
 */

import { ADMIN_REDIRECTS, ADMIN_ROUTE_MANIFEST, adminRouteForPath } from "./route-manifest.js";

const HTML_ROUTES = ADMIN_ROUTE_MANIFEST.filter((route) => route.handler === "admin-html");

/** Compatibility exports; values now compile from route-manifest.js. */
export const ADMIN_CLEAN_PAGES = new Set(HTML_ROUTES.map((route) => route.page).filter(Boolean));

export const ADMIN_PUBLIC_PAGES = new Set(
  HTML_ROUTES.filter((route) => route.policy?.auth === "public").map((route) => route.page).filter(Boolean),
);

export const ADMIN_CLEAN_ALIASES = Object.fromEntries(
  HTML_ROUTES.filter((route) => route.asset).map((route) => [route.path, route.asset]),
);

/** Legacy .html paths → clean canonical URL (301) — from route-manifest */
export const ADMIN_HTML_TO_CLEAN = Object.fromEntries(ADMIN_REDIRECTS);

export function adminLoginPath() {
  return "/admin/login";
}

export function adminHtmlFile(pathname) {
  const route = adminRouteForPath(pathname);
  if (!route || route.handler !== "admin-html") return null;
  if (route.asset) return route.asset;
  if (!route.page) return null;
  return `/admin/${route.page}.html`;
}

export function adminCleanUrl(pathname) {
  if (ADMIN_HTML_TO_CLEAN[pathname]) return ADMIN_HTML_TO_CLEAN[pathname];

  const match = pathname.match(/^\/admin\/([a-z0-9-]+)\.html$/);
  if (!match || !ADMIN_CLEAN_PAGES.has(match[1])) return null;
  const route = HTML_ROUTES.find((candidate) => candidate.page === match[1]);
  return route?.path || null;
}

export function isAdminPublicPath(pathname) {
  const route = adminRouteForPath(pathname.replace(/\.html$/, ""));
  if (route) return route.policy?.auth === "public";

  const html = pathname.match(/^\/admin\/([a-z0-9-]+)\.html$/);
  return Boolean(html && ADMIN_PUBLIC_PAGES.has(html[1]));
}

export function redirectToAdminLogin(request, { status = 302 } = {}) {
  return Response.redirect(new URL(adminLoginPath(), request.url), status);
}
