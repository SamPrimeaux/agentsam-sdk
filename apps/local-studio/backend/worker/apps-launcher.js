/**
 * Read-only account-scoped projection for the console's Apps rail and + menu.
 * Registry visibility never implies installation, enablement, or authorization.
 * Do not add a second app catalog here: agentsam_plugins is the source.
 */
export async function listLauncherApps(db, accountId) {
  if (!db?.prepare || !accountId) throw new Error("apps_launcher_context_missing");
  const query = [
    "SELECT p.plugin_key, p.display_name, p.icon_url, p.metadata_json,",
    "       MAX(CASE WHEN i.id IS NOT NULL THEN 1 ELSE 0 END) AS installed,",
    "       MAX(COALESCE(i.enabled, 0)) AS enabled,",
    "       COALESCE(MAX(CASE WHEN i.enabled = 1 THEN i.setup_status END),",
    "                MAX(i.setup_status)) AS setup_status",
    "  FROM agentsam_plugins p",
    "  LEFT JOIN agentsam_plugin_installations i ON i.plugin_id = p.id AND i.account_id = ?",
    " WHERE json_extract(p.metadata_json, '$.app') IS NOT NULL",
    " GROUP BY p.id",
    " ORDER BY p.sort_priority, p.display_name",
  ].join("\n");
  const result = await db.prepare(query).bind(accountId).all();
  return (result?.results || []).flatMap(row => {
    let app;
    try { app = JSON.parse(row.metadata_json || "{}").app; } catch { return []; }
    if (!app || !Array.isArray(app.surfaces)) return [];
    const surfaces = app.surfaces.filter(surface => surface === "admin-nav" || surface === "add-apps");
    if (!surfaces.length) return [];
    const href = typeof app.nav?.href === "string" &&
      /^\/(?!\/)/.test(app.nav.href) && !/[<>"'\s]/.test(app.nav.href) ? app.nav.href : null;
    const signIn = typeof app.setup?.sign_in_url === "string" &&
      /^https:\/\//.test(app.setup.sign_in_url) ? app.setup.sign_in_url : null;
    return [{
      key: row.plugin_key,
      label: typeof app.nav?.label === "string" && app.nav.label.trim()
        ? app.nav.label.trim().slice(0, 64) : row.display_name,
      href, sign_in_url: signIn, surfaces,
      icon_url: row.icon_url || null,
      installed: Number(row.installed) === 1,
      enabled: Number(row.enabled) === 1,
      setup_status: row.setup_status || "not_installed",
    }];
  });
}
