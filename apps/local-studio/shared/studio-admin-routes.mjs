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
  Object.freeze({ id: 'agent.chat', flat: '/agentsam', canonical: '/admin/agentsam', exactOnly: true }),
  Object.freeze({ id: 'cad.studio', flat: '/cad', canonical: '/admin/cad' }),
  Object.freeze({ id: 'cad.samsketch-compat', flat: '/samsketch', canonical: '/admin/cad' }),
  Object.freeze({ id: 'creative.moviemode', flat: '/media', canonical: '/admin/moviemode' }),
]);

/** @param {string} pathname */
export function canonicalStudioPath(pathname) {
  for (const mount of STUDIO_ADMIN_MOUNTS) {
    if (pathname === mount.flat || (!('exactOnly' in mount && mount.exactOnly) && pathname.startsWith(mount.flat + '/'))) {
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
