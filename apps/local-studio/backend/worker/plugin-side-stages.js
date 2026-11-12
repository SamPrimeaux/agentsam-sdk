/**
 * Runtime Side Stage projection from the canonical plugin registry.
 * Core tools are implemented by host-owned renderers but registered as data;
 * optional plugins can contribute a sandboxed web stage or a tool workspace.
 *
 * Account scope is auth_users.id, provided by the authenticated caller.
 */
const TOKEN = /^[a-z][a-z0-9-]{0,63}$/;
const CORE_RENDERERS = new Set([
  "goal", "chat", "browser", "files", "artifacts", "app",
  "design", "media", "database", "terminal",
]);
const ICONS = new Set([
  "target", "users", "globe", "file-code", "box", "layers",
  "layout", "film", "database", "square-terminal", "plug", "panel-right",
]);
const LABEL_LIMIT = 90;

function safeObject(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed : {};
  } catch { return {}; }
}

function safeEmbedUrl(href, source) {
  if (typeof href !== "string" || typeof source !== "string") return null;
  try {
    const target = new URL(href);
    const catalog = new URL(source);
    if (target.protocol !== "https:" || catalog.protocol !== "https:" ||
        target.origin !== catalog.origin || target.username ||
        target.password || target.hash || target.search) return null;
    return target.href;
  } catch { return null; }
}

/**
 * A trusted remote catalog may offer only a sandboxed view or a read-only
 * workspace contribution; never a native host component or code import.
 */
export function normalizeCatalogSideStage(candidate, source) {
  if (candidate == null) return null;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) ||
      candidate.version !== 1 || !TOKEN.test(candidate.id)) {
    throw new Error("plugin_side_stage_invalid");
  }
  if (candidate.renderer === "workspace") {
    return {version:1,id:candidate.id,renderer:"workspace",icon:"plug"};
  }
  if (candidate.renderer === "embed") {
    const href = safeEmbedUrl(candidate.href, source);
    if (!href) throw new Error("plugin_side_stage_url_invalid");
    return {version:1,id:candidate.id,renderer:"embed",href,icon:"plug"};
  }
  throw new Error("plugin_side_stage_renderer_invalid");
}

/** Reject untrusted catalog metadata rather than turning it into host controls. */
export function projectSideStageContribution(row) {
  const metadata = safeObject(row.metadata_json);
  const stage = safeObject(metadata.side_stage);
  if (stage.version !== 1 || typeof stage.id !== "string" ||
      !TOKEN.test(stage.id)) return null;
  const core = row.plugin_kind === "native" &&
    row.family_key === "core" && stage.renderer === "builtin";
  const renderer = stage.renderer;
  let tabKind;
  let href;
  if (core) {
    if (!CORE_RENDERERS.has(stage.tab_kind)) return null;
    tabKind = stage.tab_kind;
  } else if (renderer === "workspace") {
    tabKind = "plugin";
  } else if (renderer === "embed") {
    tabKind = "plugin";
    href = safeEmbedUrl(stage.href, metadata.source);
    if (!href) return null;
  } else {
    return null;
  }
  const id = String(row.plugin_key || "");
  const pluginId = String(row.id || "");
  if (!TOKEN.test(id) || !/^plg_[a-f0-9]{8,}$/i.test(pluginId)) return null;
  const label = String(row.display_name || "").trim().slice(0, LABEL_LIMIT);
  if (!label) return null;
  return {
    id,
    pluginId,
    stageId: stage.id,
    label,
    description: String(row.description || "").trim().slice(0, 240),
    icon: ICONS.has(stage.icon) ? stage.icon : "plug",
    iconUrl: /^https:\/\//.test(row.icon_url || "") ? row.icon_url : null,
    tabKind,
    renderer,
    ...(href ? {href} : {}),
    // A surface enabled preference is separate from its available runtime authority.
    ready: true,
  };
}

/** Idempotent per-account registration: core panels are ordinary installed plugins. */
export async function ensureCoreSideStageInstallations(db, accountId) {
  if (!accountId) throw new Error("side_stage_account_required");
  await db.prepare(`
    INSERT OR IGNORE INTO agentsam_plugin_installations
      (account_id,plugin_id,instance_key,enabled,setup_status,health_status,
       composer_visible,settings_visible)
    SELECT ?,p.id,'side-stage-v1',1,'configured','healthy',0,1
    FROM agentsam_plugins p
    WHERE p.family_key='core' AND p.plugin_kind='native'
      AND json_extract(p.metadata_json,'$.side_stage.renderer')='builtin'
  `).bind(accountId).run();
}

export async function listAccountSideStages(db, accountId, options = {}) {
  const includeDisabled = options.includeDisabled === true;
  await ensureCoreSideStageInstallations(db, accountId);
  const result = await db.prepare(`
    SELECT p.id,p.plugin_key,p.family_key,p.plugin_kind,p.display_name,
           p.description,p.icon_url,p.metadata_json,p.sort_priority,
           COALESCE(own.enabled, 1) AS stage_enabled,
           CASE WHEN p.family_key='core' AND p.plugin_kind='native' THEN 1
                ELSE EXISTS (
                  SELECT 1 FROM agentsam_plugin_installations live
                  WHERE live.plugin_id=p.id AND live.account_id=?
                    AND live.instance_key<>'side-stage-v1'
                    AND live.enabled=1 AND live.setup_status='connected'
                ) END AS installed_and_ready
    FROM agentsam_plugins p
    LEFT JOIN agentsam_plugin_installations own
      ON own.plugin_id=p.id AND own.account_id=?
     AND own.instance_key='side-stage-v1'
    WHERE json_type(p.metadata_json,'$.side_stage')='object'
    ORDER BY p.sort_priority,p.display_name
  `).bind(accountId, accountId).all();
  return (result.results || [])
    .filter(row => Number(row.installed_and_ready) === 1 &&
      (includeDisabled || Number(row.stage_enabled) === 1))
    .map(row => {
      const stage = projectSideStageContribution(row);
      return stage ? {...stage,enabled:Number(row.stage_enabled) === 1} : null;
    })
    .filter(Boolean);
}

export async function readAccountSideStageCatalog(db, accountId) {
  if (!db?.prepare) throw new Error("side_stage_database_unavailable");
  if (!accountId) throw new Error("side_stage_account_required");
  return {ok:true,side_stage_catalog:await listAccountSideStages(db, accountId, {includeDisabled:true})};
}

/** Only account-owned installation state is mutable, not global plugin definitions. */
export async function updateAccountSideStage(db, accountId, pluginId, enabled) {
  if (!accountId) throw new Error('side_stage_account_required');
  if (!/^plg_[a-f0-9]{8,}$/i.test(String(pluginId))) throw new Error('side_stage_plugin_invalid');
  if (typeof enabled !== 'boolean') throw new Error('side_stage_enabled_required');
  await ensureCoreSideStageInstallations(db, accountId);
  const exists = await db.prepare(`
    SELECT p.id FROM agentsam_plugins p
    JOIN agentsam_plugin_installations i ON i.plugin_id=p.id
    WHERE p.id=? AND i.account_id=? AND i.instance_key='side-stage-v1'
      AND p.family_key='core' AND p.plugin_kind='native'
      AND json_extract(p.metadata_json,'$.side_stage.renderer')='builtin'
    LIMIT 1
  `).bind(pluginId,accountId).first();
  if (!exists) throw new Error('side_stage_not_found');
  await db.prepare(`
    UPDATE agentsam_plugin_installations
    SET enabled=?,updated_at=unixepoch()
    WHERE account_id=? AND plugin_id=? AND instance_key='side-stage-v1'
  `).bind(enabled?1:0,accountId,pluginId).run();
  return {ok:true,pluginId,enabled};
}
