/**
 * Account-scoped Apps launcher. One spine: `apps` is the catalog and
 * `agentsam_app_installations` is what an account has added to its admin.
 * Plugins live in agentsam_plugins and never appear here.
 */
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

export async function listLauncherApps(db, accountId) {
  need(db, accountId);
  const { results } = await db.prepare(
    "SELECT a.id, a.name, a.description, a.icon_url, a.app_icon, a.launch_url, a.editor_url, " +
    "       i.id AS install_id, COALESCE(i.enabled, 0) AS enabled, COALESCE(i.pinned, 0) AS pinned, i.last_opened_at " +
    "  FROM apps a LEFT JOIN agentsam_app_installations i ON i.app_id = a.id AND i.account_id = ? " +
    " WHERE a.app_type = 'application' AND a.status = 'active' AND a.visibility = 'public' " +
    " ORDER BY a.featured DESC, a.name"
  ).bind(accountId).all();
  return (results || []).map(row => {
    const href = safeHref(row.launch_url);
    const installed = row.install_id != null;
    const enabled = Number(row.enabled) === 1;
    return {
      key: row.id,
      label: row.name,
      href,
      // Same-origin work view the New tab can frame in place (an app's standalone mount).
      embed_href: safeHref(row.editor_url),
      sign_in_url: null,
      surfaces: ["admin-nav"],
      icon_url: row.icon_url || null,
      nav_icon: row.app_icon ? String(row.app_icon).slice(0, 40) : null,
      description: typeof row.description === "string" ? row.description.slice(0, 240) : "",
      kind: "app",
      installable: Boolean(href),
      installed,
      enabled,
      pinned: installed && Number(row.pinned) === 1,
      last_opened_at: installed && row.last_opened_at != null ? Number(row.last_opened_at) : null,
      setup_status: !installed ? "not_installed" : enabled ? "configured" : "disabled",
    };
  });
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
