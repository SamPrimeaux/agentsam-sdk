/**
 * Installed theme inventory and preview-selection authority.
 * Reuses cms_artifacts + cms_globals; never creates a parallel theme table.
 * Theme choice is not equivalent to storefront renderer readiness.
 */
import { resolveCmsSite } from "./site-context.mjs";

const DEFAULT = 'heuristic';
const KEY = 'theme';
const VALID = /^[a-z][a-z0-9-]{0,63}$/;

function parsed(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || ''); } catch { return fallback; }
}
async function tenant(env, requested) {
  if (requested) return requested;
  const result = await env.DB.prepare(
    'SELECT account_id FROM cms_pages GROUP BY account_id LIMIT 2'
  ).all();
  if ((result.results || []).length !== 1) throw new Error('theme_account_scope_required');
  return result.results[0].account_id;
}
async function globalRow(env, accountId, siteId) {
  return env.DB.prepare(
    "SELECT id, site_id, inline_content_json, content_version FROM cms_globals WHERE account_id=? AND site_id=? AND global_key=?"
  ).bind(accountId, siteId, KEY).first();
}
function current(row) {
  const value = parsed(row?.inline_content_json);
  return {
    active: typeof value.active === 'string' && VALID.test(value.active) ? value.active : DEFAULT,
    preview: typeof value.preview === 'string' && VALID.test(value.preview) ? value.preview : DEFAULT,
    reviewed: value.reviewed && typeof value.reviewed === 'object' ? value.reviewed : {},
  };
}
async function installed(env, accountId, siteId) {
  const [artifactResult, projectResult] = await Promise.all([
    env.DB.prepare(
      "SELECT id, artifact_key, version, status, manifest_object_key, metadata_json, source_ref, source_kind, created_at FROM cms_artifacts WHERE account_id=? AND artifact_type='theme' AND status='ready' ORDER BY created_at DESC"
    ).bind(accountId).all(),
    env.DB.prepare(
      "SELECT inline_content_json FROM cms_globals WHERE account_id=? AND site_id=? AND global_type='theme-project' AND status!='archived' ORDER BY updated_at DESC"
    ).bind(accountId, siteId).all(),
  ]);
  const projectBySlug = new Map();
  for (const row of projectResult.results || []) {
    const project = parsed(row.inline_content_json, null);
    if (project?.sourceThemeId && !projectBySlug.has(project.sourceThemeId)) {
      projectBySlug.set(project.sourceThemeId, project);
    }
  }
  const bySlug = new Map();
  for (const row of artifactResult.results || []) {
    if (!row.artifact_key.startsWith('theme/')) continue;
    const slug = row.artifact_key.slice(6);
    if (!VALID.test(slug)) continue;
    const metadata = parsed(row.metadata_json);
    const project = projectBySlug.get(slug);
    if (!metadata.project_id && project?.id) metadata.project_id = project.id;
    if (!metadata.preview_url && project?.sourcePreviewUrl) metadata.preview_url = project.sourcePreviewUrl;
    const candidate = { ...row, slug, metadata };
    const previous = bySlug.get(slug);
    if (!previous || Boolean(candidate.metadata.project_id) && !Boolean(previous.metadata.project_id) ||
        (Boolean(candidate.metadata.project_id) === Boolean(previous.metadata.project_id) &&
          String(candidate.created_at || '') > String(previous.created_at || ''))) {
      bySlug.set(slug, candidate);
    }
  }
  return [...bySlug.values()];
}
function appearance(row, state) {
  const slug = row?.slug || DEFAULT;
  const artifact = row || null;
  const isDefault = !artifact;
  return {
    id: artifact?.id || 'runtime:' + DEFAULT,
    slug,
    name: artifact?.metadata?.label || (slug === 'revise' ? 'Revise' : slug === DEFAULT ? 'Heuristic' : slug),
    package_name: artifact?.source_ref || null,
    package_version: artifact?.version || null,
    source_kind: artifact?.source_kind || (isDefault ? 'installed-runtime' : null),
    artifact_id: artifact?.id || null,
    manifest_object_key: artifact?.manifest_object_key || null,
    state: slug === state.active ? 'active' : 'draft',
    preview_selected: slug === state.preview,
    editor_mode: 'canonical-cms',
    preview_href: artifact?.metadata?.preview_url || '/admin/theme-editor?slug=shop',
    edit_href: artifact?.metadata?.project_id
      ? '/admin/theme-project-editor?project=' + encodeURIComponent(artifact.metadata.project_id)
      : '/admin/theme-editor?slug=shop',
    review_ready: Boolean(state.reviewed[slug]),
    // Only the existing Heuristic renderer is connected to public page delivery.
    // A ready R2 bundle alone is never a publication authorization.
    runtime_ready: slug === DEFAULT,
    publish_ready: slug === DEFAULT && Boolean(state.reviewed[slug]),
    last_saved: artifact?.created_at || null,
  };
}
export async function listStoreThemes(env, accountId = null, siteId = null) {
  try {
    const account = await tenant(env, accountId);
    const site = siteId
      ? await resolveCmsSite(env.DB, { accountId: account, siteId })
      : await resolveCmsSite(env.DB, { accountId: account, createDefault: true });
    const [record, artifacts] = await Promise.all([globalRow(env, account, site.id), installed(env, account, site.id)]);
    const state = current(record);
    const themes = [appearance(null, state), ...artifacts.filter(a => a.slug !== DEFAULT).map(a => appearance(a, state))];
    return {
      ok: true, source: 'cms_artifacts+cms_globals', active_theme: themes.find(x => x.state === 'active') || null,
      preview_theme: themes.find(x => x.preview_selected) || null,
      draft_themes: themes.filter(x => x.state !== 'active'), themes,
      content_version: Number(record?.content_version || 0),
    };
  } catch (error) {
    return { ok: false, source: 'cms_theme_unavailable', error: error.message, active_theme: null,
      preview_theme: null, draft_themes: [], themes: [] };
  }
}
export async function getStoreTheme(env, slugOrId, accountId = null, siteId = null) {
  const list = await listStoreThemes(env, accountId, siteId);
  return list.ok ? list.themes.find(theme => theme.slug === slugOrId || theme.id === slugOrId) || null : null;
}
async function saveState(env, accountId, change, expectedVersion = null, siteId = null) {
  const account = await tenant(env, accountId);
  const site = siteId
    ? await resolveCmsSite(env.DB, { accountId: account, siteId })
    : await resolveCmsSite(env.DB, { accountId: account, createDefault: true });
  const row = await globalRow(env, account, site.id);
  const version = Number(row?.content_version || 0);
  if (expectedVersion !== null && Number(expectedVersion) !== version) {
    return { ok: false, status: 409, code: 'theme_version_conflict', content_version: version };
  }
  const state = { ...current(row), ...change };
  const content = JSON.stringify(state);
  if (!row) {
    const id = 'cmsg_' + crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    const inserted = await env.DB.prepare(
      "INSERT INTO cms_globals (id,account_id,site_id,global_key,global_type,status,inline_content_json,content_version) VALUES (?,?,?,'theme','theme','published',?,1) ON CONFLICT(site_id,global_key) DO NOTHING"
    ).bind(id, account, site.id, content).run();
    if (inserted.meta?.changes !== 1) return { ok:false, status:409, code:'theme_version_conflict' };
  } else {
    const changed = await env.DB.prepare(
      "UPDATE cms_globals SET inline_content_json=?,content_version=content_version+1,updated_at=datetime('now') WHERE id=? AND account_id=? AND site_id=? AND content_version=?"
    ).bind(content, row.id, account, site.id, version).run();
    if (changed.meta?.changes !== 1) return { ok:false, status:409, code:'theme_version_conflict' };
  }
  const saved = await globalRow(env, account, site.id);
  // Retain immutable, site-scoped audit snapshots using the existing ledger.
  await env.DB.prepare(
    "INSERT INTO cms_revisions (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,snapshot_json,metadata_json) VALUES (?,?,'global',?,?,'current',?,?)"
  ).bind(account, site.id, saved.id, saved.content_version, content, JSON.stringify({ reason:'theme-selection' })).run();
  return { ok:true, content_version:saved.content_version, state };
}
export async function selectThemePreview(env, slug, accountId = null, expectedVersion = null, siteId = null) {
  if (!VALID.test(String(slug))) return { ok:false, status:400, code:'invalid_theme' };
  if (!await getStoreTheme(env, slug, accountId, siteId)) return { ok:false, status:404, code:'theme_not_installed' };
  const saved = await saveState(env, accountId, { preview:slug }, expectedVersion, siteId);
  return saved.ok ? { ...saved, theme: await getStoreTheme(env,slug,accountId,siteId) } : saved;
}
export async function setThemePublishReady(env, slug, reviewed, _actorId = null, accountId = null, siteId = null) {
  if (!await getStoreTheme(env,slug,accountId,siteId)) return { ok:false,status:404,code:'theme_not_installed' };
  const account = await tenant(env, accountId);
  const site = siteId ? await resolveCmsSite(env.DB,{accountId:account,siteId}) : await resolveCmsSite(env.DB,{accountId:account,createDefault:true});
  const state = current(await globalRow(env,account,site.id));
  const saved = await saveState(env,account,{ reviewed:{...state.reviewed,[slug]:Boolean(reviewed)} },null,site.id);
  return saved.ok ? { ok:true,theme:await getStoreTheme(env,slug,account,site.id) } : saved;
}
export async function publishStoreTheme(env, slug, _actorId = null, accountId = null, siteId = null) {
  const target = await getStoreTheme(env,slug,accountId,siteId);
  if (!target) return { ok:false,status:404,code:'theme_not_installed' };
  if (target.state === 'active') return { ok:true,unchanged:true,active_theme:target };
  if (!target.runtime_ready || !target.publish_ready) {
    return { ok:false,status:409,code:'theme_runtime_not_verified',
      error:'Theme preview is installed, but its complete public renderer and rollback are not verified. The live theme was not changed.' };
  }
  const saved = await saveState(env,accountId,{active:slug},null,siteId);
  if (!saved.ok) return saved;
  const list = await listStoreThemes(env,accountId,siteId);
  return { ok:true,active_theme:list.active_theme,draft_themes:list.draft_themes };
}
