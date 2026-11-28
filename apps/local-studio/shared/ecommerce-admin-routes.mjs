/**
 * Local Studio is the canonical owner of hosted Ecommerce admin URLs.
 * Ecommerce CMS contributes page capabilities and packaged assets only.
 * Its own backend route manifest is retained solely for standalone installs;
 * hosted Local Studio code must never import that manifest.
 */
/** @param {string} id @param {string} path @param {string} handler
 * @param {string | undefined} [page] @param {'document' | 'host'} [surface]
 */
const route = (id, path, handler, page, surface = 'document') => Object.freeze({
  id, path, handler, page: page || null, asset: handler === 'admin-spa' ? '_spa/index.html' : `${page}.html`, surface,
  authority: 'local-studio',
});

export const LOCAL_STUDIO_ECOMMERCE_ADMIN_ROUTES = Object.freeze([
  route('admin.orders', '/admin/orders', 'admin-html', 'orders'),
  route('admin.products', '/admin/products', 'admin-html', 'products'),
  route('admin.collections', '/admin/collections', 'admin-spa'),
  route('admin.collections.new', '/admin/collections/new', 'admin-spa'),
  route('admin.collections.edit', '/admin/collections/:collectionId', 'admin-spa'),
  route('admin.product-edit', '/admin/product-edit', 'admin-html', 'product-edit'),
  route('admin.inventory', '/admin/inventory', 'admin-html', 'inventory'),
  route('admin.subscribers', '/admin/subscribers', 'admin-html', 'subscribers'),
  route('admin.discounts', '/admin/discounts', 'admin-html', 'discounts'),
  route('admin.content', '/admin/content', 'admin-html', 'content'),
  route('admin.pages', '/admin/pages', 'admin-html', 'pages'),
  route('admin.page-edit', '/admin/page-edit', 'admin-html', 'page-edit'),
  route('admin.theme-project-editor', '/admin/theme-project-editor', 'admin-html', 'theme-project-editor'),
  route('admin.theme-editor.site-page', '/admin/sites/:siteId/pages/:pageId/editor', 'admin-html', 'theme-editor'),
  route('admin.theme-editor.site-settings', '/admin/sites/:siteId/settings/editor', 'admin-html', 'theme-editor'),
  route('admin.theme-editor.theme', '/admin/sites/:siteId/themes/:projectId/editor', 'admin-html', 'theme-editor'),
  route('admin.theme-editor.theme-page', '/admin/sites/:siteId/themes/:projectId/editor/:pageSlug', 'admin-html', 'theme-editor'),
  route('admin.theme-workspace', '/admin/theme-workspace', 'admin-html', 'theme-workspace'),
  route('admin.growth', '/admin/growth', 'admin-html', 'growth'),
  route('admin.email', '/admin/email', 'admin-html', 'email'),
  route('admin.preferences', '/admin/preferences', 'admin-html', 'preferences'),
  route('admin.analytics.overview', '/admin/analytics/overview', 'admin-spa'),
  route('admin.analytics.finance', '/admin/analytics/finance', 'admin-spa'),
  route('admin.analytics.health', '/admin/analytics/health', 'admin-spa'),
  route('admin.analytics.security', '/admin/analytics/security', 'admin-spa'),
  route('admin.account', '/admin/account', 'admin-spa'),
  route('admin.product-studio.create', '/admin/products/create', 'admin-spa'),
  route('admin.product-studio.edit', '/admin/products/create/:productId', 'admin-spa'),
  route('admin.product-studio.artwork', '/admin/products/help/artwork', 'admin-spa'),
  // These are Local Studio-owned React routes. The Store route embeds only its
  // single packaged Store surface; editor and page documents are top-level.
  route('admin.store', '/admin/store', 'admin-html', 'store', 'host'),
  route('admin.onboarding-preview', '/admin/onboarding-preview', 'admin-html', 'onboarding-preview', 'host'),
  route('admin.home', '/admin/home', 'admin-html', 'home', 'host'),
  route('admin.analytics', '/admin/analytics', 'admin-html', 'analytics', 'host'),
]);

const ID = /^[A-Za-z0-9_-]{1,160}$/;

/** @param {string} pathname @param {string} template
 * @returns {Record<string, string> | null}
 */
function matchPath(pathname, template) {
  const actual = String(pathname || '').split('/');
  const expected = String(template || '').split('/');
  if (actual.length !== expected.length) return null;
  /** @type {Record<string, string>} */
  const params = {};
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index];
    if (segment.startsWith(':')) {
      if (!ID.test(actual[index])) return null;
      params[segment.slice(1)] = actual[index];
    } else if (actual[index] !== segment) return null;
  }
  return params;
}

/** @param {string} pathname */
export function resolveLocalStudioEcommerceAdminRoute(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/admin/') || pathname.startsWith('//') || /[?#\\]/.test(pathname)) return null;
  for (const candidate of LOCAL_STUDIO_ECOMMERCE_ADMIN_ROUTES) {
    const params = matchPath(pathname, candidate.path);
    if (params) return { ...candidate, params };
  }
  return null;
}

/** Return a redirect target for legacy .html and trailing-slash paths only.
 * @param {string} pathname
 */
export function canonicalLocalStudioEcommercePath(pathname) {
  if (typeof pathname !== 'string') return null;
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (trimmed !== pathname && resolveLocalStudioEcommerceAdminRoute(trimmed)) return trimmed;
  if (pathname.endsWith('.html')) {
    const candidate = pathname.slice(0, -5);
    if (resolveLocalStudioEcommerceAdminRoute(candidate)) return candidate;
  }
  return null;
}

/** @param {string} pathname */
export function isLocalStudioEcommerceAdminPath(pathname) {
  return Boolean(resolveLocalStudioEcommerceAdminRoute(pathname));
}

/** @param {string} pathname */
export function isLocalStudioEcommerceDocumentPath(pathname) {
  return resolveLocalStudioEcommerceAdminRoute(pathname)?.surface === 'document';
}

/** @param {string} pathname */
export function localStudioEcommerceAssetForPath(pathname) {
  const resolved = resolveLocalStudioEcommerceAdminRoute(pathname);
  if (!resolved) return null;
  return resolved.asset;
}
