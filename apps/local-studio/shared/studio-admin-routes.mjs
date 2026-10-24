/**
 * Local Studio's owned admin mount registry. Public product/admin console
 * routes retain their existing handlers until their ownership is reconciled.
 *
 * This is intentionally an allowlist, not a blanket /admin/* rewrite:
 * /admin/pages, /admin/content, /admin/agentsam and several other existing
 * URLs belong to the installed Ecommerce application today.
 */
export const STUDIO_ADMIN_MOUNTS = Object.freeze([
  Object.freeze({ id: 'work.projects', flat: '/projects', canonical: '/admin/projects' }),
]);

/** @param {string} pathname */
export function canonicalStudioPath(pathname) {
  for (const mount of STUDIO_ADMIN_MOUNTS) {
    if (pathname === mount.flat || pathname.startsWith(mount.flat + '/')) {
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
