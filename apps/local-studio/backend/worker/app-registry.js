/**
 * Host-side app route and screen registry (not identity).
 * Workers import their own agentsam.app.json; multi-app hosts load many.
 */

/**
 * @typedef {{
 *   id: string,
 *   name?: string,
 *   routes?: { mounts?: Array<{ path: string }> },
 *   screens?: Array<{
 *     id: string, app_id?: string, route: string, module?: string, export?: string,
 *     mount?: { type: string, path?: string }, navigation?: object,
 *     host_core?: boolean, installation_required?: boolean, matchSubpaths?: boolean
 *   }>
 * }} AppManifestLike
 */

function pathMatches(pathname, route, matchSubpaths = true) {
  const path = String(pathname || "").split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  const base = String(route || "").split(/[?#]/, 1)[0].replace(/\/+$/, "");
  if (!base || !base.startsWith("/") || base.startsWith("//")) return false;
  return path === base || (matchSubpaths && path.startsWith(base + "/"));
}

/**
 * @param {AppManifestLike[]} manifests
 */
export function createAppRegistry(manifests = []) {
  /** @type {Map<string, AppManifestLike>} */
  const byId = new Map();
  for (const manifest of manifests) {
    if (!manifest?.id) continue;
    byId.set(String(manifest.id), Object.freeze({ ...manifest }));
  }

  const installationFor = (installedApps, appId) =>
    (Array.isArray(installedApps) ? installedApps : []).find(app => String(app?.key || "") === String(appId || "")) || null;

  return Object.freeze({
    get(id) {
      return byId.get(String(id || "")) || null;
    },
    list() {
      return [...byId.values()];
    },
    /**
     * Longest-prefix mount match across all registered legacy app mounts.
     * @param {string} pathname
     */
    resolvePath(pathname) {
      let best = null;
      for (const app of byId.values()) {
        const mounts = Array.isArray(app.routes?.mounts) ? app.routes.mounts : [];
        for (const mount of mounts) {
          const base = String(mount.path || "");
          if (!pathMatches(pathname, base, true)) continue;
          if (!best || base.length > String(best.mount.path).length) best = { app, mount };
        }
      }
      return best;
    },
    /**
     * Resolve an installed, enabled screen by its canonical route. A catalog
     * entry alone is insufficient: the account installation must expose the
     * screen ID that the app manifest declares.
     * @param {string} pathname
     * @param {Array<{key:string,installed:boolean,enabled:boolean,screens?:Array<{id:string}>}>} installedApps
     */
    resolveScreenPath(pathname, installedApps = []) {
      let best = null;
      for (const app of byId.values()) {
        for (const screen of Array.isArray(app.screens) ? app.screens : []) {
          if (!screen?.id) continue;
          const ownerId = String(screen.app_id || app.id);
          const installation = installationFor(installedApps, ownerId);
          const hostCore = screen.host_core === true || screen.installation_required === false;
          if (!hostCore && (!installation?.installed || !installation.enabled ||
              !(installation.screens || []).some(item => String(item?.id || "") === String(screen.id)))) continue;
          const route = String(screen.route || "");
          if (!pathMatches(pathname, route, screen.matchSubpaths !== false)) continue;
          if (!best || route.length > String(best.screen.route || "").length) best = { app, screen, installation };
        }
      }
      return best;
    },
    /**
     * Resolve a screen identity only when that screen is bound to the account's
     * installed, enabled application.
     * @param {string} appId
     * @param {string} screenId
     * @param {Array<{key:string,installed:boolean,enabled:boolean,screens?:Array<{id:string}>}>} installedApps
     */
    resolveScreen(appId, screenId, installedApps = []) {
      const app = byId.get(String(appId || ""));
      if (!app) return null;
      const screen = (Array.isArray(app.screens) ? app.screens : []).find(item => item?.id === screenId) || null;
      if (!screen) return null;
      const ownerId = String(screen.app_id || app.id);
      const installation = installationFor(installedApps, ownerId);
      const hostCore = screen.host_core === true || screen.installation_required === false;
      if (!hostCore && (!installation?.installed || !installation.enabled || !(installation.screens || []).some(item => item?.id === screenId))) return null;
      return { app, screen, installation };
    },
  });
}
