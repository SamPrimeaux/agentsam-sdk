/**
 * Mount-level auth policy helpers (host applies; identity does not invent mounts).
 */

/**
 * @typedef {{ path: string, auth?: 'required'|'optional'|'public', spa?: boolean, shell?: string }} AppMount
 */

export function pathMatchesMount(pathname, mount) {
  const base = String(mount?.path || '');
  if (!base) return false;
  const path = String(pathname || '');
  return path === base || path.startsWith(`${base}/`);
}

export function resolveMountForPath(pathname, app) {
  const mounts = Array.isArray(app?.routes?.mounts) ? app.routes.mounts : [];
  let best = null;
  for (const mount of mounts) {
    if (!pathMatchesMount(pathname, mount)) continue;
    if (!best || String(mount.path).length > String(best.path).length) best = mount;
  }
  return best;
}

export function mountRequiresAuth(pathname, app) {
  const mount = resolveMountForPath(pathname, app);
  if (!mount) return false;
  return (mount.auth || 'public') === 'required';
}
