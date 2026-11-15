/**
 * Local Studio's owned admin mount registry. Public product/admin console
 * routes retain their existing handlers until their ownership is reconciled.
 *
 * This is intentionally an allowlist, not a blanket /admin/* rewrite:
 * /admin/pages, /admin/content and other installed-commerce routes remain
 * product-owned. AgentSam/CAD/MovieMode are owned by Local Studio only when
 * that host is installed, never by the standalone Ecommerce customer Worker.
 *
 * Media Library owns /media/* as a first-party Studio surface. MovieMode is
 * only mounted at /admin/moviemode — never aliased from /media.
 */
export const STUDIO_ADMIN_MOUNTS = Object.freeze([
  Object.freeze({ id: 'work.projects', flat: '/projects', canonical: '/admin/projects' }),
  Object.freeze({ id: 'commerce.home', flat: '/admin/home', canonical: '/admin/home', exactOnly: true }),
  // Canonical Online Store uses the same installed Ecommerce component as the
  // legacy /apps/ecommerce-cms-agentsam?page=/admin/store launch surface.
  Object.freeze({ id: 'commerce.store', flat: '/admin/store', canonical: '/admin/store', exactOnly: true }),
  Object.freeze({ id: 'commerce.checkout-preview', flat: '/admin/onboarding-preview', canonical: '/admin/onboarding-preview', exactOnly: true }),
  Object.freeze({ id: 'agent.chat', flat: '/agentsam', canonical: '/admin/agentsam', exactOnly: true }),
  Object.freeze({ id: 'cad.studio', flat: '/cad', canonical: '/admin/cad' }),
  // SamSketch owns /samsketch as an included app route — do not redirect it into CAD.
  Object.freeze({ id: 'creative.moviemode', flat: '/admin/moviemode', canonical: '/admin/moviemode' }),
]);

/** Legacy Content → Media Library destinations (no MovieMode, no ecommerce logout). */
export const LEGACY_CONTENT_MEDIA_REDIRECTS = Object.freeze({
  '/admin/content': '/media',
  image: '/media/images',
  video: '/media/videos',
  model: '/media/models',
  file: '/media/files',
});

/** @param {string} pathname */
export function canonicalStudioPath(pathname) {
  for (const mount of STUDIO_ADMIN_MOUNTS) {
    const exactOnly = 'exactOnly' in mount && mount.exactOnly;
    if (pathname === mount.flat) {
      // Canonical mounts must never redirect to themselves.
      return pathname === mount.canonical ? null : mount.canonical;
    }
    // Normalize a trailing slash on an exact canonical document route without
    // turning it into a self-redirect or claiming arbitrary child routes.
    if (exactOnly && mount.flat === mount.canonical && pathname === mount.canonical + '/') {
      return mount.canonical;
    }
    if (!exactOnly && pathname.startsWith(mount.flat + '/')) {
      const target = mount.canonical + pathname.slice(mount.flat.length);
      // Descendant URLs of an already canonical mount are real app routes,
      // not legacy aliases. Redirecting them to themselves loops on Cloudflare.
      if (target === pathname) return pathname.endsWith('/') ? pathname.slice(0, -1) : null;
      return target;
    }
  }
  return null;
}

/** @param {string} pathname */
export function isStudioAdminPath(pathname) {
  return STUDIO_ADMIN_MOUNTS.some(({ canonical }) =>
    pathname === canonical || pathname.startsWith(canonical + '/'));
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
