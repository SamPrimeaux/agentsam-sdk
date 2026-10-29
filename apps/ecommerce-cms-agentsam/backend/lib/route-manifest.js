/**
 * Canonical route definitions.
 *
 * This file is the runtime route authority for storefront/admin paths.
 * Legacy aliases, clean admin page resolution, route ownership and contextual
 * resource identity compile from here instead of from parallel route lists.
 *
 * Capability permissions intentionally remain a separate audit: a route owning
 * a resource does not automatically grant low-level D1/R2/provider mutations.
 */

const SESSION_POLICY = { auth: "session", cache: "private-no-store" };
const PUBLIC_POLICY = { auth: "public", cache: "private-no-store" };

const STORE_ROUTES = [
  { id: "store.home", path: "/", surface: "storefront", handler: "cms-page", page: "home", context: "cms.page", indexable: true, legacy: ["/index.html"] },
  { id: "store.shop", path: "/shop", surface: "storefront", handler: "cms-page", page: "shop", context: "cms.page", indexable: true, legacy: ["/shop.html", "/pages/shop", "/pages/shop/"] },
  { id: "store.about", path: "/about", surface: "storefront", handler: "cms-page", page: "about", context: "cms.page", indexable: true, legacy: ["/about.html", "/pages/about", "/pages/about/"] },
  { id: "store.community", path: "/community", surface: "storefront", handler: "cms-page", page: "community", context: "cms.page", indexable: true, legacy: ["/community.html", "/pages/community", "/pages/community/"] },
  { id: "store.collaborate", path: "/collaborate", surface: "storefront", handler: "cms-page", page: "collaborate", context: "cms.page", indexable: true, legacy: ["/collaborate.html", "/pages/collaborate", "/pages/collaborate/"] },
  { id: "store.policies", path: "/policies", surface: "storefront", handler: "cms-page", page: "policies", context: "cms.page", indexable: true, legacy: ["/policies.html", "/pages/policies", "/pages/policies/"] },
  { id: "store.terms", path: "/terms", surface: "storefront", handler: "cms-page", page: "terms", context: "cms.page", indexable: true, legacy: ["/terms.html", "/pages/terms", "/pages/terms/"] },
  { id: "store.checkout", path: "/checkout", surface: "storefront", handler: "static", page: "cart", context: "commerce.checkout", indexable: false, legacy: ["/cart", "/cart.html", "/pages/cart", "/pages/cart/"] },
];

const coreAdmin = (route) => ({
  surface: "admin",
  owner: { kind: "core", id: "ecommerce-cms-agentsam" },
  capability_policy: "pending-audit",
  policy: SESSION_POLICY,
  ...route,
});

const appAdmin = (app, route) => ({
  surface: "admin",
  owner: { kind: "app", id: app },
  capability_policy: "app-contract",
  policy: SESSION_POLICY,
  ...route,
});

export const ADMIN_ROUTE_MANIFEST = [
  coreAdmin({
    id: "admin.login",
    path: "/admin/login",
    handler: "admin-html",
    page: "login",
    context: "auth.login",
    policy: PUBLIC_POLICY,
    legacy: ["/admin/login.html"],
  }),
  coreAdmin({
    id: "admin.home",
    path: "/admin/home",
    handler: "admin-html",
    page: "home",
    context: "store.overview",
    legacy: ["/admin/home.html", "/admin/dashboard.html"],
  }),
  coreAdmin({ id: "admin.orders", path: "/admin/orders", handler: "admin-html", page: "orders", context: "commerce.orders", legacy: ["/admin/orders.html"] }),
  coreAdmin({ id: "admin.products", path: "/admin/products", handler: "admin-html", page: "products", context: "commerce.products", legacy: ["/admin/products.html"] }),
  coreAdmin({ id: "admin.product-edit", path: "/admin/product-edit", handler: "admin-html", page: "product-edit", context: "commerce.product", legacy: ["/admin/product-edit.html"] }),
  coreAdmin({ id: "admin.inventory", path: "/admin/inventory", handler: "admin-html", page: "inventory", context: "commerce.inventory", legacy: ["/admin/inventory.html"] }),
  coreAdmin({ id: "admin.subscribers", path: "/admin/subscribers", handler: "admin-html", page: "subscribers", context: "newsletter.subscribers", legacy: ["/admin/subscribers.html"] }),
  appAdmin("growth", { id: "admin.growth", path: "/admin/growth", handler: "admin-html", page: "growth", context: "growth.workspace", legacy: ["/admin/growth.html"] }),
  coreAdmin({ id: "admin.discounts", path: "/admin/discounts", handler: "admin-html", page: "discounts", context: "commerce.discounts", legacy: ["/admin/discounts.html"] }),
  coreAdmin({ id: "admin.scaffold", path: "/admin/scaffold", handler: "admin-html", page: "scaffold", context: "admin.scaffold", legacy: ["/admin/scaffold.html"] }),
  coreAdmin({
    id: "admin.content",
    path: "/admin/content",
    handler: "admin-html",
    page: "content",
    context: "media.library",
    legacy: ["/admin/content.html", "/admin/media.html"],
  }),
  coreAdmin({ id: "admin.pages", path: "/admin/pages", handler: "admin-html", page: "pages", context: "cms.pages", legacy: ["/admin/pages.html"] }),
  coreAdmin({ id: "admin.page-edit", path: "/admin/page-edit", handler: "admin-html", page: "page-edit", context: "cms.page", legacy: ["/admin/page-edit.html"] }),
  coreAdmin({ id: "admin.theme-editor", path: "/admin/theme-editor", handler: "admin-html", page: "theme-editor", context: "cms.theme-editor", legacy: ["/admin/theme-editor.html"] }),
  coreAdmin({ id: "admin.theme-workspace", path: "/admin/theme-workspace", handler: "admin-html", page: "theme-workspace", context: "cms.theme-workspace", legacy: ["/admin/theme-workspace.html"] }),
  coreAdmin({ id: "admin.scene-lab", path: "/admin/scene-lab", handler: "admin-html", page: "scene-lab", context: "cms.scene", legacy: ["/admin/scene-lab.html"] }),
  coreAdmin({ id: "admin.bridge-fly-preview", path: "/admin/bridge-fly-preview", handler: "admin-html", page: "bridge-fly-preview", context: "cms.preview", legacy: ["/admin/bridge-fly-preview.html"] }),
  coreAdmin({ id: "admin.store", path: "/admin/store", handler: "admin-html", page: "store", context: "store.settings", legacy: ["/admin/store.html"] }),
  coreAdmin({ id: "admin.preferences", path: "/admin/preferences", handler: "admin-html", page: "preferences", context: "store.preferences", legacy: ["/admin/preferences.html"] }),
  appAdmin("resend", {
    id: "admin.email",
    path: "/admin/email",
    handler: "admin-html",
    page: "email",
    asset: "/admin/dashboard/email.html",
    context: "communications.email",
    legacy: ["/admin/email.html", "/admin/dashboard/email.html"],
  }),
  coreAdmin({ id: "admin.agentsam", path: "/admin/agentsam", handler: "admin-html", page: "agentsam", context: "agentsam.workspace", legacy: ["/admin/agentsam.html"] }),
  coreAdmin({
    id: "admin.analytics.overview",
    path: "/admin/analytics/overview",
    handler: "admin-spa",
    context: "analytics.overview",
    legacy: [
      "/admin-app", "/admin-app/", "/admin-app/analytics/overview", "/admin-app/admin-app/analytics/overview",
      "/admin/dashboard/overview.html", "/admin/analytics/overview.html",
    ],
  }),
  coreAdmin({
    id: "admin.analytics.finance",
    path: "/admin/analytics/finance",
    handler: "admin-spa",
    context: "analytics.finance",
    legacy: [
      "/admin-app/analytics/finance", "/admin-app/admin-app/analytics/finance",
      "/admin/dashboard/finance.html", "/admin/analytics/finance.html",
    ],
  }),
  coreAdmin({
    id: "admin.analytics.health",
    path: "/admin/analytics/health",
    handler: "admin-spa",
    context: "analytics.health",
    legacy: [
      "/admin-app/analytics/health", "/admin-app/admin-app/analytics/health",
      "/admin/dashboard/analytics.html", "/admin/analytics/health.html",
    ],
  }),
  coreAdmin({ id: "admin.account", path: "/admin/account", handler: "admin-spa", context: "account.current" }),
  appAdmin("product-studio", { id: "admin.product-studio.create", path: "/admin/products/create", handler: "admin-spa", context: "commerce.product-studio" }),
  appAdmin("product-studio", { id: "admin.product-studio.edit", path: "/admin/products/create/:productId", handler: "admin-spa", context: "commerce.product-studio" }),
  appAdmin("product-studio", { id: "admin.product-studio.artwork", path: "/admin/products/help/artwork", handler: "admin-spa", context: "commerce.artwork-help" }),
];

export const ROUTE_MANIFEST = [...STORE_ROUTES, ...ADMIN_ROUTE_MANIFEST];

/** Public storefront paths that are intentionally eligible for search indexing. */
export const INDEXABLE_STORE_ROUTES = STORE_ROUTES.filter((route) => route.indexable === true);

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

function routePatternMatches(pattern, pathname) {
  const normalizedPattern = pattern.replace(/\/+$/, "") || "/";
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  if (!normalizedPattern.includes(":")) return normalizedPattern === normalizedPath;

  const patternParts = normalizedPattern.split("/");
  const pathParts = normalizedPath.split("/");
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
}

const compiledStore = compileLegacyRedirects(STORE_ROUTES);
const compiledAdmin = compileLegacyRedirects(ADMIN_ROUTE_MANIFEST);

/** Legacy .html → clean storefront paths */
export const STORE_HTML_REDIRECTS = compiledStore.htmlToClean;

/** /pages/* → clean paths */
export const PAGES_CLEAN_REDIRECTS = compiledStore.pagesToClean;

/** Legacy admin HTML / admin-app → clean */
export const ADMIN_REDIRECTS = compiledAdmin.htmlToClean;

export function adminRouteForPath(pathname) {
  return ADMIN_ROUTE_MANIFEST.find((route) => routePatternMatches(route.path, pathname)) || null;
}

export function privateNoStoreHeaders(headers = new Headers()) {
  headers.set("Cache-Control", "private, no-store");
  return headers;
}

export function routePolicyForPath(pathname) {
  const route = ROUTE_MANIFEST.find((candidate) => routePatternMatches(candidate.path, pathname));
  return route?.policy || null;
}
