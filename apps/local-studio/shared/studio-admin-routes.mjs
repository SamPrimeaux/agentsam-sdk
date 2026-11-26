import { canonicalLocalStudioEcommercePath, isLocalStudioEcommerceAdminPath, isLocalStudioEcommerceDocumentPath } from './ecommerce-admin-routes.mjs';

/**
 * Local Studio owns canonical dashboard routes, account/site identity and
 * route dispatch. Installed apps contribute capabilities and packaged assets,
 * never a competing top-level /admin route authority.
 * Flat paths are retained only as compatibility redirects.
 */
export const STUDIO_ADMIN_MOUNTS = Object.freeze([
  Object.freeze({ id: 'dashboard.root', flat: '/admin', canonical: '/admin/home', exactOnly: true }),
  Object.freeze({ id: 'commerce.home', flat: '/admin/home', canonical: '/admin/home', exactOnly: true }),
  Object.freeze({ id: 'commerce.store', flat: '/admin/store', canonical: '/admin/store', exactOnly: true }),
  Object.freeze({ id: 'commerce.checkout-preview', flat: '/admin/onboarding-preview', canonical: '/admin/onboarding-preview', exactOnly: true }),
  Object.freeze({ id: 'creative.moviemode', flat: '/admin/moviemode', canonical: '/admin/moviemode' }),
  Object.freeze({ id: 'agent.cad-compat', flat: '/agentsam/apps/cad', canonical: '/admin/cad' }),
  Object.freeze({ id: 'ecommerce.compat', flat: '/apps/ecommerce-cms-agentsam', canonical: '/admin/apps/ecommerce-cms-agentsam' }),
  Object.freeze({ id: 'help.cms', flat: '/help/cms', canonical: '/admin/help/cms' }),
  Object.freeze({ id: 'agent.chat', flat: '/agentsam', canonical: '/admin/agentsam', exactOnly: true }),
  Object.freeze({ id: 'agent.chats', flat: '/chats', canonical: '/admin/chats' }),
  Object.freeze({ id: 'analytics', flat: '/analytics', canonical: '/admin/analytics' }),
  Object.freeze({ id: 'artifacts', flat: '/artifacts', canonical: '/admin/artifacts' }),
  Object.freeze({ id: 'browser', flat: '/browse', canonical: '/admin/browse' }),
  Object.freeze({ id: 'cad.studio', flat: '/cad', canonical: '/admin/cad' }),
  Object.freeze({ id: 'campaigns', flat: '/campaigns', canonical: '/admin/campaigns' }),
  Object.freeze({ id: 'canvas', flat: '/canvas', canonical: '/admin/canvas' }),
  // Existing account app installs may still carry the former Design Canvas launch URL.
  Object.freeze({ id: 'design-canvas.compat', flat: '/admin/design-canvas', canonical: '/admin/canvas' }),
  Object.freeze({ id: 'cli', flat: '/cli', canonical: '/admin/cli' }),
  Object.freeze({ id: 'cms', flat: '/cms', canonical: '/admin/cms' }),
  Object.freeze({ id: 'collaborate', flat: '/collaborate', canonical: '/admin/collaborate' }),
  Object.freeze({ id: 'content', flat: '/content', canonical: '/admin/content' }),
  Object.freeze({ id: 'database', flat: '/database', canonical: '/admin/database' }),
  Object.freeze({ id: 'docs', flat: '/docs', canonical: '/admin/docs' }),
  Object.freeze({ id: 'files', flat: '/files', canonical: '/admin/files' }),
  Object.freeze({ id: 'forms', flat: '/forms', canonical: '/admin/forms' }),
  Object.freeze({ id: 'goals', flat: '/goalguru', canonical: '/admin/goalguru' }),
  Object.freeze({ id: 'ideas', flat: '/ideas', canonical: '/admin/ideas' }),
  Object.freeze({ id: 'library', flat: '/library', canonical: '/admin/library' }),
  Object.freeze({ id: 'mail', flat: '/mail', canonical: '/admin/mail' }),
  Object.freeze({ id: 'media', flat: '/media', canonical: '/admin/media' }),
  Object.freeze({ id: 'projects', flat: '/projects', canonical: '/admin/projects' }),
  Object.freeze({ id: 'samsketch', flat: '/samsketch', canonical: '/admin/samsketch' }),
  Object.freeze({ id: 'settings', flat: '/settings', canonical: '/admin/settings' }),
  Object.freeze({ id: 'ship', flat: '/ship', canonical: '/admin/ship' }),
  Object.freeze({ id: 'sites', flat: '/sites', canonical: '/admin/sites' }),
  Object.freeze({ id: 'theme-store', flat: '/store', canonical: '/admin/themes' }),
  Object.freeze({ id: 'themes', flat: '/themes', canonical: '/admin/themes' }),
  Object.freeze({ id: 'tickets', flat: '/tickets', canonical: '/admin/tickets' }),
  Object.freeze({ id: 'widgets', flat: '/widgets', canonical: '/admin/widgets' }),
]);

// Build and serve the same route match. Hydrating HTML serialized for a flat
// redirect or a parent route can leave TanStack Start with different matches.
export const STUDIO_ADMIN_PRERENDERED_ROUTES = Object.freeze([
  "/admin/store", "/admin/onboarding-preview", "/admin/agentsam", "/admin/cad",
  "/admin/moviemode", "/admin/moviemode/edit", "/admin/projects",
  "/admin/media", "/admin/media/images", "/admin/media/videos",
  "/admin/media/models", "/admin/media/files",
]);

/**
 * Retired Structure URLs are compatibility redirects only, not app mounts.
 * @param {string} pathname
 * @param {URLSearchParams} search
 */
export function resolveRetiredStructurePath(pathname, search) {
  if (!['/structure', '/structure/', '/admin/structure', '/admin/structure/'].includes(pathname)) return null;
  if (search?.get?.('scope') === 'platform') return '/admin/settings/themes?view=navigation';
  const params = new URLSearchParams();
  for (const key of ['site_id', 'site_slug']) {
    const value = search?.get?.(key);
    if (value && /^[A-Za-z0-9_-]{1,160}$/.test(value)) params.set(key, value);
  }
  return '/admin/preferences' + (params.size ? '?' + params.toString() : '');
}

/** Legacy Content → Media Library destinations. */
export const LEGACY_CONTENT_MEDIA_REDIRECTS = Object.freeze({
  '/admin/content': '/admin/media',
  image: '/admin/media/images',
  video: '/admin/media/videos',
  model: '/admin/media/models',
  file: '/admin/media/files',
});

/** @param {string} pathname */
export function canonicalStudioPath(pathname) {
  if (pathname === '/admin' || pathname === '/admin/') return '/admin/home';
  const ecommerceCanonical = canonicalLocalStudioEcommercePath(pathname);
  if (ecommerceCanonical) return ecommerceCanonical;
  // Published forms are public documents, not the account-owned Forms app.
  if (pathname === '/forms/embed' || pathname.startsWith('/forms/embed/')) return null;

  for (const mount of STUDIO_ADMIN_MOUNTS) {
    const exactOnly = 'exactOnly' in mount && mount.exactOnly;
    if (pathname === mount.flat) {
      return pathname === mount.canonical ? null : mount.canonical;
    }
    if (exactOnly && mount.flat === mount.canonical && pathname === mount.canonical + '/') {
      return mount.canonical;
    }
    if (!exactOnly && pathname.startsWith(mount.flat + '/')) {
      const target = mount.canonical + pathname.slice(mount.flat.length);
      if (target === pathname) return pathname.endsWith('/') ? pathname.slice(0, -1) : null;
      return target;
    }
  }
  return null;
}

/**
 * The host owns the full admin URL namespace (including installed app pages).
 * This is route authority, not a request to render every page in the shell.
 * @param {string} pathname
 */
export function isStudioAdminPath(pathname) {
  return isLocalStudioEcommerceAdminPath(pathname) || STUDIO_ADMIN_MOUNTS.some((mount) =>
    pathname === mount.canonical || (!('exactOnly' in mount && mount.exactOnly)
      && pathname.startsWith(mount.canonical + '/')));
}

/**
 * Shell-rendered routes exclude packaged Ecommerce documents so the existing
 * document handler can serve those assets without a duplicate shell.
 * @param {string} pathname
 */
export function isStudioShellAdminPath(pathname) {
  return !isLocalStudioEcommerceDocumentPath(pathname) && STUDIO_ADMIN_MOUNTS.some((mount) =>
    pathname === mount.canonical || (!('exactOnly' in mount && mount.exactOnly)
      && pathname.startsWith(mount.canonical + '/')));
}

/** @param {string} pathname @param {URLSearchParams | null | undefined} search */
export function resolveLegacyContentMediaPath(pathname, search) {
  if (pathname !== '/admin/content' && pathname !== '/admin/content/') return null;
  const kind = search?.get?.('kind') || '';
  if (kind === 'image' || kind === 'images') return LEGACY_CONTENT_MEDIA_REDIRECTS.image;
  if (kind === 'video' || kind === 'videos') return LEGACY_CONTENT_MEDIA_REDIRECTS.video;
  if (kind === 'model' || kind === 'models') return LEGACY_CONTENT_MEDIA_REDIRECTS.model;
  if (kind === 'file' || kind === 'files') return LEGACY_CONTENT_MEDIA_REDIRECTS.file;
  return LEGACY_CONTENT_MEDIA_REDIRECTS['/admin/content'];
}
