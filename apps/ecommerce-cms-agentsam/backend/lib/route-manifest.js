/**
 * Canonical route definitions — legacy aliases compile from here.
 * Worker entry should match against compiled maps, not hand-maintained parallel lists.
 */

const STORE_ROUTES = [
  { id: "store.home", path: "/", surface: "storefront", handler: "cms-page", page: "home", legacy: ["/index.html"] },
  { id: "store.shop", path: "/shop", surface: "storefront", handler: "cms-page", page: "shop", legacy: ["/shop.html", "/pages/shop", "/pages/shop/"] },
  { id: "store.about", path: "/about", surface: "storefront", handler: "cms-page", page: "about", legacy: ["/about.html", "/pages/about", "/pages/about/"] },
  { id: "store.community", path: "/community", surface: "storefront", handler: "cms-page", page: "community", legacy: ["/community.html", "/pages/community", "/pages/community/"] },
  { id: "store.collaborate", path: "/collaborate", surface: "storefront", handler: "cms-page", page: "collaborate", legacy: ["/collaborate.html", "/pages/collaborate", "/pages/collaborate/"] },
  { id: "store.policies", path: "/policies", surface: "storefront", handler: "cms-page", page: "policies", legacy: ["/policies.html", "/pages/policies", "/pages/policies/"] },
  { id: "store.terms", path: "/terms", surface: "storefront", handler: "cms-page", page: "terms", legacy: ["/terms.html", "/pages/terms", "/pages/terms/"] },
  { id: "store.cart", path: "/cart", surface: "storefront", handler: "static", page: "cart", legacy: ["/cart.html", "/pages/cart", "/pages/cart/"] },
];

const ADMIN_ROUTES = [
  { id: "admin.login", path: "/admin/login", surface: "admin", handler: "admin-html", page: "login", policy: { auth: "public", cache: "private-no-store" }, legacy: ["/admin/login.html"] },
  { id: "admin.home", path: "/admin/home", surface: "admin", handler: "admin-html", page: "home", policy: { auth: "session", cache: "private-no-store" }, legacy: ["/admin/home.html", "/admin/dashboard.html"] },
  { id: "admin.content", path: "/admin/content", surface: "admin", handler: "admin-html", page: "content", policy: { auth: "session", cache: "private-no-store" }, legacy: ["/admin/content.html", "/admin/media.html"] },
  { id: "admin.email", path: "/admin/email", surface: "admin", handler: "admin-html", page: "email", asset: "/admin/dashboard/email.html", policy: { auth: "session", cache: "private-no-store" }, legacy: ["/admin/dashboard/email.html"] },
  { id: "admin.analytics.overview", path: "/admin/analytics/overview", surface: "admin", handler: "admin-spa", policy: { auth: "session", cache: "private-no-store" }, legacy: [
    "/admin-app", "/admin-app/", "/admin-app/analytics/overview", "/admin-app/admin-app/analytics/overview",
    "/admin/dashboard/overview.html", "/admin/analytics/overview.html",
  ] },
  { id: "admin.analytics.finance", path: "/admin/analytics/finance", surface: "admin", handler: "admin-spa", policy: { auth: "session", cache: "private-no-store" }, legacy: [
    "/admin-app/analytics/finance", "/admin-app/admin-app/analytics/finance",
    "/admin/dashboard/finance.html", "/admin/analytics/finance.html",
  ] },
  { id: "admin.analytics.health", path: "/admin/analytics/health", surface: "admin", handler: "admin-spa", policy: { auth: "session", cache: "private-no-store" }, legacy: [
    "/admin-app/analytics/health", "/admin-app/admin-app/analytics/health",
    "/admin/dashboard/analytics.html", "/admin/analytics/health.html",
  ] },
];

export const ROUTE_MANIFEST = [...STORE_ROUTES, ...ADMIN_ROUTES];

function compileLegacyRedirects(routes) {
  const htmlToClean = new Map();
  const pagesToClean = new Map();
  for (const route of routes) {
    for (const legacy of route.legacy || []) {
      if (legacy.endsWith(".html") || legacy.includes("/admin-app/") || legacy.includes("/dashboard/")) {
        htmlToClean.set(legacy, route.path);
      }
      if (legacy.startsWith("/pages/")) {
        pagesToClean.set(legacy, route.path);
        if (!legacy.endsWith("/")) pagesToClean.set(`${legacy}/`, route.path);
      }
    }
  }
  return { htmlToClean, pagesToClean };
}

const compiledStore = compileLegacyRedirects(STORE_ROUTES);
const compiledAdmin = compileLegacyRedirects(ADMIN_ROUTES);

/** Legacy .html → clean storefront paths */
export const STORE_HTML_REDIRECTS = compiledStore.htmlToClean;

/** /pages/* → clean paths */
export const PAGES_CLEAN_REDIRECTS = compiledStore.pagesToClean;

/** Legacy admin HTML / admin-app → clean */
export const ADMIN_REDIRECTS = compiledAdmin.htmlToClean;

export function privateNoStoreHeaders(headers = new Headers()) {
  headers.set("Cache-Control", "private, no-store");
  return headers;
}

export function routePolicyForPath(pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return ROUTE_MANIFEST.find((r) => r.path === normalized)?.policy || null;
}
