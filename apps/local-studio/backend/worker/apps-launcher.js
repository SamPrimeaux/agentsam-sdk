/**
 * Account-scoped application and plugin navigation projections. The existing
 * apps/installations and plugins/installations tables remain their authorities;
 * package manifests provide only trusted screen mounts.
 */
import { createAppRegistry } from "./app-registry.js";

const KEY_RE = /^[a-z0-9][a-z0-9._-]{1,100}$/i;
const need = (db, accountId) => {
  if (!db?.prepare || !accountId) throw new Error("apps_launcher_context_missing");
};
const safeKey = (key) => {
  if (typeof key !== "string" || !KEY_RE.test(key)) throw new Error("app_install_key_invalid");
  return key;
};
const safeHref = (href) =>
  typeof href === "string" && /^\/(?!\/)/.test(href) && !/[<>"'\s]/.test(href) ? href : null;

const parseObject = value => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
};

export async function listLauncherApps(db, accountId, manifestCatalog = []) {
  need(db, accountId);
  const { results } = await db.prepare(
    "SELECT a.id, a.name, a.description, a.icon_url, a.app_icon, a.launch_url, a.editor_url, a.config_json, " +
    "       i.id AS install_id, COALESCE(i.enabled, 0) AS enabled, COALESCE(i.pinned, 0) AS pinned, i.last_opened_at, i.config_json AS install_config_json " +
    "  FROM apps a LEFT JOIN agentsam_app_installations i ON i.app_id = a.id AND i.account_id = ? " +
    " WHERE a.app_type = 'application' AND a.status = 'active' AND a.visibility = 'public' " +
    " ORDER BY a.featured DESC, a.name"
  ).bind(accountId).all();
  const manifestRows = Array.isArray(manifestCatalog) ? manifestCatalog.filter(item => item?.id) : [];
  const manifestScreens = manifestRows.flatMap(manifest =>
    (Array.isArray(manifest?.screens) ? manifest.screens : []).map(screen => ({
      ...screen,
      app_id: String(screen.app_id || manifest.id),
      owner_manifest_id: manifest.id,
      owner_manifest_version: manifest.version || null,
    }))
  );

  // Build the account's screen bindings once, then let the shared registry
  // resolve both screen identity and route ownership. The database remains the
  // registration/installation authority; manifests only provide trusted mounts.
  const runtimeRows = (results || []).map(row => {
    const appConfig = parseObject(row.config_json);
    const installConfig = parseObject(row.install_config_json);
    const appRuntime = parseObject(appConfig.runtime);
    const installRuntime = parseObject(installConfig.runtime);
    const registeredIds = new Set(Array.isArray(appRuntime.screen_ids) ? appRuntime.screen_ids.map(String) : []);
    const accountIds = new Set(Array.isArray(installRuntime.screen_ids) ? installRuntime.screen_ids.map(String) : [...registeredIds]);
    const disabledIds = new Set(Array.isArray(installRuntime.disabled_screen_ids) ? installRuntime.disabled_screen_ids.map(String) : []);
    const declaredScreens = manifestScreens.filter(screen => screen.app_id === row.id);
    const ownerManifestIds = new Set(declaredScreens.map(screen => screen.owner_manifest_id));
    const manifestMatches = !appRuntime.manifest_id || ownerManifestIds.has(appRuntime.manifest_id);
    const screenIds = manifestMatches
      ? declaredScreens.filter(screen => screen?.id && registeredIds.has(String(screen.id)) && accountIds.has(String(screen.id)) && !disabledIds.has(String(screen.id))).map(screen => String(screen.id))
      : [];
    return {
      row, appRuntime, declaredScreens, ownerManifestIds,
      installed: row.install_id != null,
      enabled: Number(row.enabled) === 1,
      screens: screenIds.map(id => ({ id })),
    };
  });
  const registry = createAppRegistry(manifestRows);
  const installedApps = runtimeRows.map(({ row, installed, enabled, screens }) => ({
    key: row.id, installed, enabled, screens,
  }));

  return runtimeRows.map(({ row, appRuntime, declaredScreens, ownerManifestIds, installed, enabled }) => {
    const manifestMatches = !appRuntime.manifest_id || ownerManifestIds.has(appRuntime.manifest_id);
    const screens = manifestMatches
      ? declaredScreens.filter(screen => {
          const byId = registry.resolveScreen(screen.owner_manifest_id, String(screen.id || ""), installedApps);
          if (!byId) return false;
          const byRoute = registry.resolveScreenPath(screen.route, installedApps);
          return byRoute?.screen?.id === screen.id && byRoute?.app?.id === screen.owner_manifest_id;
        })
      : [];
    const primaryScreen = screens.find(screen => screen.primary || screen.navigation?.primary) || screens[0] || null;
    const ownerManifest = manifestRows.find(item => item?.id === (primaryScreen?.owner_manifest_id || appRuntime.manifest_id)) || null;
    const href = safeHref(primaryScreen?.route) || safeHref(row.launch_url);
    const surfaces = [...new Set(screens.map(screen => screen.navigation?.surface).filter(Boolean).map(String))];
    return {
      key: row.id,
      label: row.name,
      href,
      legacy_href: safeHref(row.launch_url),
      // Same-origin work view the New tab can frame in place (an app's standalone mount).
      embed_href: safeHref(row.editor_url),
      sign_in_url: null,
      screens,
      screen_status: screens.length ? "registered" : declaredScreens.length ? "not_registered" : "manifest_missing",
      manifest_id: ownerManifest?.id || appRuntime.manifest_id || null,
      manifest_version: ownerManifest?.version || null,
      surfaces,
      icon_url: row.icon_url || null,
      nav_icon: row.app_icon ? String(row.app_icon).slice(0, 40) : null,
      description: typeof row.description === "string" ? row.description.slice(0, 240) : "",
      kind: "app",
      installable: Boolean(href || screens.length),
      installed,
      enabled,
      pinned: installed && Number(row.pinned) === 1,
      last_opened_at: installed && row.last_opened_at != null ? Number(row.last_opened_at) : null,
      setup_status: !installed ? "not_installed" : !enabled ? "disabled" : screens.length ? "configured" : "screen_unregistered",
    };
  });
}

/**
 * Read installed plugin navigation from the existing plugin installation
 * records. Plugin-owned screen mounts must also be explicitly registered in
 * that installation's config_json.runtime.screen_ids.
 */
export async function listInstalledNavigationPlugins(db, accountId, manifestCatalog = [], installedApps = []) {
  need(db, accountId);
  const { results } = await db.prepare(
    "SELECT p.plugin_key, p.display_name, p.description, p.icon_url, p.metadata_json, " +
    "       i.enabled, i.setup_status, i.config_json, i.instance_key, i.updated_at " +
    "  FROM agentsam_plugin_installations i JOIN agentsam_plugins p ON p.id = i.plugin_id " +
    " WHERE i.account_id = ? " +
    " ORDER BY CASE WHEN i.instance_key = 'default' THEN 0 ELSE 1 END, i.updated_at DESC, p.sort_priority, p.display_name"
  ).bind(accountId).all();

  const uniqueRows = new Map();
  for (const row of results || []) {
    const key = String(row?.plugin_key || "");
    if (KEY_RE.test(key) && !uniqueRows.has(key)) uniqueRows.set(key, row);
  }
  const manifests = Array.isArray(manifestCatalog) ? manifestCatalog.filter(item => item?.id) : [];
  const manifestScreens = manifests.flatMap(manifest =>
    (Array.isArray(manifest.screens) ? manifest.screens : []).map(screen => ({
      ...screen,
      app_id: String(screen.app_id || manifest.id),
      owner_manifest_id: manifest.id,
      owner_manifest_version: manifest.version || null,
    }))
  );
  const registry = createAppRegistry(manifests);
  const pluginInstallations = [...uniqueRows.entries()].map(([key, row]) => {
    const runtime = parseObject(parseObject(row.config_json).runtime);
    const registeredIds = new Set(Array.isArray(runtime.screen_ids) ? runtime.screen_ids.map(String) : []);
    const declaredScreens = manifestScreens.filter(screen =>
      screen.app_id === key && registeredIds.has(String(screen.id)) &&
      (!runtime.manifest_id || runtime.manifest_id === screen.owner_manifest_id)
    );
    return {
      key,
      row,
      runtime,
      declaredScreens,
      installed: true,
      enabled: Number(row.enabled) === 1,
      screens: declaredScreens.map(screen => ({ id: String(screen.id) })),
    };
  });
  const installedRegistry = [
    ...(Array.isArray(installedApps) ? installedApps : []),
    ...pluginInstallations.map(({ key, installed, enabled, screens }) => ({ key, installed, enabled, screens })),
  ];

  return pluginInstallations.map(({ key, row, declaredScreens, enabled }) => {
    const metadata = parseObject(row.metadata_json);
    const app = parseObject(metadata.app);
    const nav = parseObject(app.nav);
    const screens = declaredScreens.filter(screen => {
      const byId = registry.resolveScreen(screen.owner_manifest_id, String(screen.id || ""), installedRegistry);
      if (!byId) return false;
      const byRoute = registry.resolveScreenPath(screen.route, installedRegistry);
      return byRoute?.screen?.id === screen.id && byRoute?.app?.id === screen.owner_manifest_id;
    });
    const primaryScreen = screens.find(screen => screen.primary || screen.navigation?.primary) || screens[0] || null;
    const href = safeHref(primaryScreen?.route) || safeHref(nav.href);
    const surfaces = screens.length
      ? [...new Set(screens.map(screen => String(screen.navigation?.surface || "")).filter(Boolean))]
      : (Array.isArray(app.surfaces) ? [...new Set(app.surfaces.map(String))] : []);
    if (!href || !surfaces.length) return null;
    return {
      key,
      label: String(primaryScreen?.navigation?.label || nav.label || row.display_name || key).slice(0, 80),
      href,
      legacy_href: safeHref(nav.href),
      sign_in_url: null,
      screens,
      screen_status: screens.length ? "registered" : "manifest_missing",
      manifest_id: primaryScreen?.owner_manifest_id || runtimeManifestId(declaredScreens),
      manifest_version: primaryScreen?.owner_manifest_version || null,
      surfaces,
      icon_url: row.icon_url || null,
      nav_icon: String(primaryScreen?.navigation?.icon || nav.icon || "apps").slice(0, 40),
      description: typeof row.description === "string" ? row.description.slice(0, 240) : "",
      kind: "plugin",
      installable: false,
      installed: true,
      enabled,
      pinned: false,
      last_opened_at: null,
      setup_status: String(row.setup_status || "configured"),
    };
  }).filter(Boolean);
}

function runtimeManifestId(screens) {
  return screens.find(screen => screen?.owner_manifest_id)?.owner_manifest_id || null;
}

export async function installNativeAdminApp(db, accountId, pluginKey) {
  need(db, accountId);
  const key = safeKey(pluginKey);
  const app = await db.prepare(
    "SELECT id, launch_url FROM apps WHERE id = ? AND app_type = 'application' AND status = 'active' AND visibility = 'public' LIMIT 1"
  ).bind(key).first();
  const href = safeHref(app?.launch_url);
  if (!app || !href) throw new Error("app_install_unavailable");
  await db.prepare(
    "INSERT INTO agentsam_app_installations (account_id, app_id) VALUES (?, ?) " +
    "ON CONFLICT(account_id, app_id) DO UPDATE SET enabled = 1, updated_at = unixepoch()"
  ).bind(accountId, key).run();
  return { key, installed: true, enabled: true, href, status: "installed" };
}

export async function removeNativeAdminApp(db, accountId, pluginKey) {
  need(db, accountId);
  const key = safeKey(pluginKey);
  const res = await db.prepare(
    "DELETE FROM agentsam_app_installations WHERE account_id = ? AND app_id = ?"
  ).bind(accountId, key).run();
  const removed = (res?.meta?.changes || 0) > 0;
  return { key, removed, installed: false };
}

/** A disabled app stays installed and can be re-enabled by its owner. */
export async function setNativeAdminAppEnabled(db, accountId, pluginKey, enabled) {
  need(db, accountId);
  const key = safeKey(pluginKey);
  if (typeof enabled !== "boolean") throw new Error("app_enabled_invalid");
  const flag = enabled ? 1 : 0;
  const res = await db.prepare(
    "UPDATE agentsam_app_installations SET enabled = ?, updated_at = unixepoch() WHERE account_id = ? AND app_id = ?"
  ).bind(flag, accountId, key).run();
  if (!(res?.meta?.changes > 0)) throw new Error("app_not_installed");
  return { key, installed: true, enabled: Boolean(flag), status: flag ? "installed" : "disabled" };
}

/** Opening an installed, enabled app stamps last_opened_at so the New tab can rank recents. */
export async function touchNativeAdminAppOpened(db, accountId, pluginKey) {
  need(db, accountId);
  const key = safeKey(pluginKey);
  const res = await db.prepare(
    "UPDATE agentsam_app_installations SET last_opened_at = unixepoch() WHERE account_id = ? AND app_id = ? AND enabled = 1"
  ).bind(accountId, key).run();
  if (!(res?.meta?.changes > 0)) throw new Error("app_not_installed");
  return { key, opened: true };
}

/** Pinned apps lead the New tab. Pinning is the account owner's choice and never alters enabled state. */
export async function setNativeAdminAppPinned(db, accountId, pluginKey, pinned) {
  need(db, accountId);
  const key = safeKey(pluginKey);
  if (typeof pinned !== "boolean") throw new Error("app_pinned_invalid");
  const flag = pinned ? 1 : 0;
  const res = await db.prepare(
    "UPDATE agentsam_app_installations SET pinned = ?, updated_at = unixepoch() WHERE account_id = ? AND app_id = ?"
  ).bind(flag, accountId, key).run();
  if (!(res?.meta?.changes > 0)) throw new Error("app_not_installed");
  return { key, installed: true, pinned: Boolean(flag) };
}
