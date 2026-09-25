/**
 * Host-side app route registry (not identity).
 * Workers import their own agentsam.app.json; multi-app hosts load many.
 */

/**
 * @typedef {import('../../packages/identity/src/server/post-auth.js').AppManifestLike} AppManifestLike
 * @typedef {import('../../packages/identity/src/server/post-auth.js').AppMount} AppMount
 */

/**
 * @param {AppManifestLike[]} manifests
 */
export function createAppRegistry(manifests = []) {
  /** @type {Map<string, AppManifestLike>} */
  const byId = new Map();
  for (const m of manifests) {
    if (!m?.id) continue;
    byId.set(m.id, Object.freeze({ ...m }));
  }

  return Object.freeze({
    get(id) {
      return byId.get(String(id || '')) || null;
    },
    list() {
      return [...byId.values()];
    },
    /**
     * Longest-prefix mount match across all registered apps.
     * @param {string} pathname
     */
    resolvePath(pathname) {
      const path = String(pathname || '');
      let best = null;
      for (const app of byId.values()) {
        const mounts = Array.isArray(app.routes?.mounts) ? app.routes.mounts : [];
        for (const mount of mounts) {
          const base = String(mount.path || '');
          if (!base) continue;
          if (path !== base && !path.startsWith(`${base}/`)) continue;
          if (
            !best ||
            base.length > String(best.mount.path).length
          ) {
            best = { app, mount };
          }
        }
      }
      return best;
    },
  });
}
