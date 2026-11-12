/**
 * Read-only account-scoped projection for the console's Apps rail and + menu.
 * Registry visibility never implies installation, enablement, or authorization.
 * Do not add a second app catalog here: agentsam_plugins is the source.
 */
export async function listLauncherApps(db, accountId) {
  if (!db?.prepare || !accountId) throw new Error("apps_launcher_context_missing");
  const query = [
    "SELECT p.id AS plugin_id, p.plugin_key, p.plugin_kind, p.display_name, p.description, p.icon_url, p.metadata_json,",
    "       MAX(CASE WHEN i.id IS NOT NULL THEN 1 ELSE 0 END) AS installed,",
    "       MAX(COALESCE(i.enabled, 0)) AS enabled,",
    "       COALESCE(MAX(CASE WHEN i.enabled = 1 THEN i.setup_status END),",
    "                MAX(i.setup_status)) AS setup_status",
    "  FROM agentsam_plugins p",
    "  LEFT JOIN agentsam_plugin_installations i ON i.plugin_id = p.id AND i.account_id = ?",
    "    AND (p.plugin_kind != 'native' OR i.instance_key != 'side-stage-v1')",
    " WHERE json_extract(p.metadata_json, '$.app') IS NOT NULL AND p.plugin_kind = 'native'",
    " GROUP BY p.id",
    " ORDER BY p.sort_priority, p.display_name",
  ].join("\n");
  const result = await db.prepare(query).bind(accountId).all();
  return (result?.results || []).flatMap(row => {
    let app;
    try { app = JSON.parse(row.metadata_json || "{}").app; } catch { return []; }
    if (!app || !Array.isArray(app.surfaces) || !app.surfaces.includes("admin-nav")) return [];
    const surfaces = app.surfaces.filter(surface => surface === "admin-nav" || surface === "side-stage");
    const href = typeof app.nav?.href === "string" &&
      /^\/(?!\/)/.test(app.nav.href) && !/[<>"'\s]/.test(app.nav.href) ? app.nav.href : null;
    const signIn = typeof app.setup?.sign_in_url === "string" &&
      /^https:\/\//.test(app.setup.sign_in_url) ? app.setup.sign_in_url : null;
    return [{
      key: row.plugin_key, plugin_id: row.plugin_id,
      label: typeof app.nav?.label === "string" && app.nav.label.trim()
        ? app.nav.label.trim().slice(0, 64) : row.display_name,
      href, sign_in_url: signIn, surfaces,
      icon_url: row.icon_url || null,
      nav_icon: typeof app.nav?.icon === "string" ? app.nav.icon.slice(0,40) : null,
      description: typeof row.description === "string" ? row.description.slice(0,240) : "",
      kind: row.plugin_kind === "native" ? "app" : "plugin",
      installable: row.plugin_kind === "native" && surfaces.includes("admin-nav") && Boolean(href),
      installed: Number(row.installed) === 1,
      enabled: Number(row.enabled) === 1,
      setup_status: row.setup_status || "not_installed",
    }];
  });
}

/**
 * Install an existing, first-party, manifest-declared native admin app.
 * The registry row is not cloned or changed; an account-owned installation is
 * inserted only if the app actually declares an internal admin destination.
 * MCP connectors continue through their separate OAuth/permissions workflow.
 */
export async function installNativeAdminApp(db, accountId, pluginKey) {
  if (!db?.prepare || !accountId) throw new Error("apps_launcher_context_missing");
  if (typeof pluginKey !== "string" || !/^[a-z0-9][a-z0-9._-]{1,100}$/i.test(pluginKey)) {
    throw new Error("app_install_key_invalid");
  }
  const row = await db.prepare(
    "SELECT id, plugin_key, plugin_kind, metadata_json FROM agentsam_plugins WHERE plugin_key = ? LIMIT 1"
  ).bind(pluginKey).first();
  if (!row) throw new Error("app_install_not_found");
  let app;
  try { app = JSON.parse(row.metadata_json || "{}").app; } catch { /* Invalid catalog data grants nothing. */ }
  const href = app?.nav?.href;
  if (row.plugin_kind !== "native" || !Array.isArray(app?.surfaces) ||
      !app.surfaces.includes("admin-nav") || typeof href !== "string" ||
      href.length > 240 || !/^\/(?!\/)[\w/%?&=.,#:+~-]*$/.test(href)) {
    throw new Error("app_install_not_supported");
  }
  // Do not reinstate a disabled app, overwrite scopes, or reconnect credentials.
  await db.prepare(
    "INSERT OR IGNORE INTO agentsam_plugin_installations " +
    "(account_id,plugin_id,instance_key,enabled,setup_status,health_status,composer_visible,settings_visible) " +
    "VALUES (?,?,'default',1,'configured','healthy',0,1)"
  ).bind(accountId,row.id).run();
  const current = await db.prepare(
    "SELECT id,enabled,setup_status FROM agentsam_plugin_installations " +
    "WHERE account_id=? AND plugin_id=? AND instance_key='default'"
  ).bind(accountId,row.id).first();
  if (!current) throw new Error("app_install_unavailable");
  return {
    key: pluginKey, installed: true, enabled: Number(current.enabled) === 1,
    href, status: Number(current.enabled) === 1 ? "installed" : "disabled",
  };
}


/** Remove only this account's native app installation, never the catalog row,
 * a storefront embed, OAuth grant, or its independent Side Stage preference. */
export async function removeNativeAdminApp(db, accountId, pluginKey) {
  const row = await nativeAdminAppDefinition(db, accountId, pluginKey);
  const existing = await db.prepare(
    "SELECT id FROM agentsam_plugin_installations WHERE account_id=? AND plugin_id=? AND instance_key='default'"
  ).bind(accountId,row.id).first();
  if (!existing) return {key:pluginKey,removed:false,installed:false};
  await db.prepare(
    "DELETE FROM agentsam_plugin_installations WHERE account_id=? AND plugin_id=? AND instance_key='default'"
  ).bind(accountId,row.id).run();
  return {key:pluginKey,removed:true,installed:false};
}

/** A disabled app remains installed and can be re-enabled by its owner. */
export async function setNativeAdminAppEnabled(db, accountId, pluginKey, enabled) {
  if (typeof enabled !== 'boolean') throw new Error('app_enabled_invalid');
  const row = await nativeAdminAppDefinition(db, accountId, pluginKey);
  const existing = await db.prepare(
    "SELECT id FROM agentsam_plugin_installations WHERE account_id=? AND plugin_id=? AND instance_key='default'"
  ).bind(accountId,row.id).first();
  if (!existing) throw new Error('app_not_installed');
  await db.prepare(
    "UPDATE agentsam_plugin_installations SET enabled=?, setup_status=?, updated_at=unixepoch() WHERE account_id=? AND plugin_id=? AND instance_key='default'"
  ).bind(enabled?1:0,enabled?'configured':'disabled',accountId,row.id).run();
  return {key:pluginKey,installed:true,enabled,status:enabled?'installed':'disabled'};
}

async function nativeAdminAppDefinition(db, accountId, pluginKey) {
  if (!db?.prepare || !accountId) throw new Error('apps_launcher_context_missing');
  if (typeof pluginKey !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,100}$/i.test(pluginKey))
    throw new Error('app_install_key_invalid');
  const row = await db.prepare(
    'SELECT id,plugin_kind,metadata_json FROM agentsam_plugins WHERE plugin_key=? LIMIT 1'
  ).bind(pluginKey).first();
  if (!row) throw new Error('app_install_not_found');
  let app;
  try {app=JSON.parse(row.metadata_json||'{}').app;}catch{}
  const href=app?.nav?.href;
  if(row.plugin_kind!=='native'||!Array.isArray(app?.surfaces)||!app.surfaces.includes('admin-nav')||
    typeof href!=='string'||href.length>240||!/^\/(?!\/)[\w/%?&=.,#:+~-]*$/.test(href))
    throw new Error('app_install_not_supported');
  return row;
}
