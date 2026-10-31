/**
 * Local Studio's owned admin mount registry. Public product/admin console
 * routes retain their existing handlers until their ownership is reconciled.
 *
 * This is intentionally an allowlist, not a blanket /admin/* rewrite:
 * /admin/pages, /admin/content and other installed-commerce routes remain
 * product-owned. AgentSam/CAD/MovieMode are owned by Local Studio only when
 * that host is installed, never by the standalone Ecommerce customer Worker.
 */
export const STUDIO_ADMIN_MOUNTS = Object.freeze([
  Object.freeze({ id: 'work.projects', flat: '/projects', canonical: '/admin/projects' }),
  Object.freeze({ id: 'commerce.home', flat: '/admin/home', canonical: '/admin/home', exactOnly: true }),
  Object.freeze({ id: 'agent.chat', flat: '/agentsam', canonical: '/admin/agentsam', exactOnly: true }),
  Object.freeze({ id: 'cad.studio', flat: '/cad', canonical: '/admin/cad' }),
  Object.freeze({ id: 'cad.samsketch-compat', flat: '/samsketch', canonical: '/admin/cad' }),
  Object.freeze({ id: 'creative.moviemode', flat: '/media', canonical: '/admin/moviemode' }),
]);

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
      return mount.canonical + pathname.slice(mount.flat.length);
    }
  }
  return null;
}

/** @param {string} pathname */
export function isStudioAdminPath(pathname) {
  return STUDIO_ADMIN_MOUNTS.some(({ canonical }) =>
    pathname === canonical || pathname.startsWith(canonical + '/'));
}
