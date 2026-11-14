/**
 * Account-scoped Theme Studio drafts.
 *
 * These are authoring workspaces, not CMS sites. They have no site_id, do not
 * create cms_sites, and can be fully edited before a publish destination exists.
 * Immutable project snapshots remain in R2; D1 owns the account-scoped pointer
 * and revision history.
 */
import { validateThemeProjectPayload } from './theme-project-store.mjs';
import { fillMissingThemeChrome } from '../../frontend/theme-editor/starter-chrome.mjs';
import { readR2Json, writeR2Json } from './r2-store.js';

const SAFE_SLUG = /^(?:[a-z][a-z0-9-]{0,63}|404)$/;
const PACKAGE_NAME = new RegExp("^@inneranimalmedia/[a-z0-9-]+$");
const PACKAGE_VERSION = new RegExp("^[0-9]+[.][0-9]+[.][0-9]+(?:[-+][A-Za-z0-9.-]+)?$");

function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}
function parseObject(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch { return fallback; }
}
async function hashText(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function summary(project) {
  return {
    id: project.id,
    name: project.name,
    packageName: project.sourcePackage || null,
    sourceThemeId: project.sourceThemeId || null,
    sourcePackageVersion: project.sourcePackageVersion || null,
    sourcePreviewUrl: project.sourcePreviewUrl || null,
    version: project.version || '0.1.0',
    revision: Number(project.revision || 0),
    createdAt: project.createdAt || null,
    updatedAt: project.updatedAt || null,
    pages: (project.pages || []).map(({ slug, title }) => ({ slug, title })),
  };
}
function studioR2Key(accountId, projectId, revision, hash) {
  return `cms/accounts/${encodeURIComponent(accountId)}/studio/theme-projects/${encodeURIComponent(projectId)}/revisions/${String(revision).padStart(6, '0')}-${hash.slice(0, 16)}.json`;
}
async function studioRow(env, accountId, projectId) {
  return env.DB.prepare(`
    SELECT id,account_id,project_id,status,inline_content_json,content_object_key,
      content_version,content_hash,metadata_json,created_at,updated_at
    FROM cms_theme_studio_projects
    WHERE account_id=? AND project_id=? AND status!='archived' LIMIT 1
  `).bind(accountId, projectId).first();
}
async function projectFromRow(env, row) {
  if (!row?.content_object_key) throw Object.assign(new Error('theme_studio_content_pointer_missing'), { status: 503 });
  const value = await readR2Json(env, row.content_object_key);
  if (!value) throw Object.assign(new Error('theme_studio_content_unavailable'), { status: 503 });
  const project = validateThemeProjectPayload(value);
  if (project.id !== row.project_id) throw Object.assign(new Error('theme_studio_project_identity_mismatch'), { status: 409 });
  project.revision = Number(row.content_version || 0);
  return project;
}
async function writeStudioRevision(env, accountId, row, project, revision, reason) {
  const serialized = JSON.stringify(project);
  const contentHash = await hashText(serialized);
  const key = studioR2Key(accountId, project.id, revision, contentHash);
  if (!await writeR2Json(env, key, project)) return { ok: false, status: 503, error: 'cms_r2_unavailable' };
  const now = new Date().toISOString();
  const inline = JSON.stringify(summary(project));
  const metadata = JSON.stringify({
    source: 'theme-studio', reason,
    package: project.sourcePackage || null,
    version: project.sourcePackageVersion || null,
    release_sha256: project.sourceReleaseSha256 || null,
  });
  if (!row) {
    const id = 'ctsp_' + crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    const inserted = await env.DB.prepare(`
      INSERT INTO cms_theme_studio_projects
        (id,account_id,project_id,status,inline_content_json,content_object_key,content_version,content_hash,metadata_json,created_at,updated_at)
      VALUES (?,?,?,'draft',?,?,?,?,?,?,?)
      ON CONFLICT(account_id,project_id) DO NOTHING
    `).bind(id, accountId, project.id, inline, key, revision, contentHash, metadata, now, now).run();
    if (changes(inserted) !== 1) return { ok: false, status: 409, error: 'theme_studio_project_exists' };
    row = await studioRow(env, accountId, project.id);
  } else {
    const updated = await env.DB.prepare(`
      UPDATE cms_theme_studio_projects
      SET inline_content_json=?,content_object_key=?,content_version=?,content_hash=?,metadata_json=?,status='draft',updated_at=?
      WHERE id=? AND account_id=? AND content_version=? AND status!='archived'
    `).bind(inline, key, revision, contentHash, metadata, now, row.id, accountId, revision - 1).run();
    if (changes(updated) !== 1) return { ok: false, status: 409, error: 'theme_studio_version_conflict' };
  }
  await env.DB.prepare(`
    INSERT OR IGNORE INTO cms_theme_studio_revisions
      (account_id,project_row_id,revision_number,revision_kind,content_object_key,content_hash,snapshot_json,metadata_json)
    VALUES (?,?,?,'draft',?,?,?,?)
  `).bind(accountId, row.id, revision, key, contentHash,
    JSON.stringify({ project_id: project.id, name: project.name, revision }), metadata).run();
  return { ok: true, project, row, content_object_key: key, content_hash: contentHash };
}

export async function listStudioThemeProjects(env, accountId) {
  if (!accountId) return { ok: false, status: 403, error: 'account_required' };
  const result = await env.DB.prepare(`
    SELECT inline_content_json FROM cms_theme_studio_projects
    WHERE account_id=? AND status!='archived' ORDER BY updated_at DESC
  `).bind(accountId).all();
  const projects = (result.results || []).map(row => parseObject(row.inline_content_json, null))
    .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string');
  return { ok: true, source: 'cms_theme_studio_projects+r2', projects };
}

export async function getStudioThemeProject(env, accountId, projectId) {
  if (!accountId) return { ok: false, status: 403, error: 'account_required' };
  if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(projectId))
    return { ok: false, status: 400, error: 'theme_project_id_invalid' };
  try {
    const row = await studioRow(env, accountId, projectId);
    if (!row) return { ok: false, status: 404, error: 'theme_studio_project_not_found' };
    return { ok: true, project: await projectFromRow(env, row) };
  } catch (error) {
    return { ok: false, status: error.status || 503, error: String(error.message || error) };
  }
}

export async function saveStudioThemeProject(env, accountId, projectId, value, expectedVersion) {
  if (!accountId) return { ok: false, status: 403, error: 'account_required' };
  if (!env?.WEBSITE_ASSETS) return { ok: false, status: 503, error: 'cms_r2_unavailable' };
  let project;
  try { project = validateThemeProjectPayload(value); }
  catch (error) { return { ok: false, status: 400, error: error.message || 'theme_project_invalid' }; }
  if (project.id !== projectId) return { ok: false, status: 400, error: 'theme_project_identity_mismatch' };
  const row = await studioRow(env, accountId, projectId);
  if (!row) return { ok: false, status: 404, error: 'theme_studio_project_not_found' };
  const currentVersion = Number(row.content_version || 0);
  if (!Number.isInteger(Number(expectedVersion)) || Number(expectedVersion) !== currentVersion)
    return { ok: false, status: 409, error: 'theme_studio_version_conflict', current_version: currentVersion };
  let existing;
  try { existing = await projectFromRow(env, row); }
  catch (error) { return { ok: false, status: error.status || 503, error: String(error.message || error) }; }
  const now = new Date().toISOString();
  project = {
    ...project,
    revision: currentVersion + 1,
    createdAt: project.createdAt || existing.createdAt || now,
    updatedAt: now,
  };
  const saved = await writeStudioRevision(env, accountId, row, project, currentVersion + 1, 'save');
  return saved.ok ? { ok: true, project } : saved;
}

function safePreviewUrl(value, slug, version) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, 'https://theme.invalid');
    const local = url.origin === 'https://theme.invalid' && url.pathname.startsWith(`/themes/${slug}/`);
    const released = url.origin === 'https://themes.inneranimalmedia.com' &&
      url.pathname.startsWith(`/theme-packages/${slug}/${version}/preview/`);
    if ((!local && !released) || url.pathname.split('/').includes('..') ||
        url.username || url.password || url.search || url.hash) return null;
    return released ? url.href : url.pathname;
  } catch { return null; }
}

export async function installThemeStudioDraft(env, accountId, slug, payload = {}) {
  if (!accountId) return { ok: false, status: 403, error: 'account_required' };
  if (!env?.WEBSITE_ASSETS) return { ok: false, status: 503, error: 'cms_r2_unavailable' };
  if (!SAFE_SLUG.test(String(slug))) return { ok: false, status: 400, error: 'theme_slug_invalid' };
  let project;
  try { project = validateThemeProjectPayload(payload.project); }
  catch (error) { return { ok: false, status: 400, error: error.message || 'theme_project_invalid' }; }
  const packageName = String(payload.package_name || '');
  const packageVersion = String(payload.package_version || '');
  const packageLeaf = packageName.split('/').pop() || '';
  const packageSlug = packageLeaf.startsWith('theme-') ? packageLeaf.slice(6) : packageLeaf;
  const previewUrl = safePreviewUrl(payload.preview_url || project.sourcePreviewUrl, slug, packageVersion);
  if (!PACKAGE_NAME.test(packageName) || packageSlug !== slug || !PACKAGE_VERSION.test(packageVersion))
    return { ok: false, status: 400, error: 'theme_package_identity_invalid' };
  if (project.id !== `theme_${slug}` || project.sourceThemeId !== slug || project.sourcePackage !== packageName)
    return { ok: false, status: 400, error: 'theme_project_source_mismatch' };
  project.sourcePackageVersion = packageVersion;
  project.sourcePreviewUrl = previewUrl;

  const existingRow = await studioRow(env, accountId, project.id);
  if (existingRow) {
    try {
      const existing = await projectFromRow(env, existingRow);
      if (existing.sourceThemeId === slug && existing.sourcePackage === packageName)
        return { ok: true, installed: true, unchanged: true, project: existing };
      return { ok: false, status: 409, error: 'theme_studio_project_conflict' };
    } catch (error) {
      return { ok: false, status: error.status || 503, error: String(error.message || error) };
    }
  }

  try { project = validateThemeProjectPayload(fillMissingThemeChrome(project, 'Your website')); }
  catch (error) { return { ok: false, status: 400, error: error.message || 'theme_project_invalid' }; }
  const now = new Date().toISOString();
  project = { ...project, revision: 1, createdAt: project.createdAt || now, updatedAt: now };
  const saved = await writeStudioRevision(env, accountId, null, project, 1, 'install');
  if (!saved.ok) {
    if (saved.error === 'theme_studio_project_exists') {
      const existing = await getStudioThemeProject(env, accountId, project.id);
      if (existing.ok) return { ok: true, installed: true, unchanged: true, project: existing.project };
    }
    return saved;
  }
  return { ok: true, installed: true, unchanged: false, project };
}

export async function createStudioThemeProject(env, accountId, value) {
  if (!accountId) return { ok: false, status: 403, error: 'account_required' };
  if (!env?.WEBSITE_ASSETS) return { ok: false, status: 503, error: 'cms_r2_unavailable' };
  let project;
  try { project = validateThemeProjectPayload(value); }
  catch (error) { return { ok: false, status: 400, error: error.message || 'theme_project_invalid' }; }
  const now = new Date().toISOString();
  project = { ...project, revision: 1, createdAt: project.createdAt || now, updatedAt: now };
  const saved = await writeStudioRevision(env, accountId, null, project, 1, 'create');
  if (!saved.ok && saved.error === 'theme_studio_project_exists') {
    const existing = await getStudioThemeProject(env, accountId, project.id);
    if (existing.ok) return { ok: true, unchanged: true, project: existing.project };
  }
  return saved.ok ? { ok: true, project } : saved;
}

export async function listStudioThemeProjectHistory(env, accountId, projectId) {
  if (!accountId) return { ok: false, status: 403, error: 'account_required' };
  const row = await studioRow(env, accountId, projectId);
  if (!row) return { ok: false, status: 404, error: 'theme_studio_project_not_found' };
  const result = await env.DB.prepare(`
    SELECT revision_number,revision_kind,content_hash,created_at,metadata_json
    FROM cms_theme_studio_revisions
    WHERE account_id=? AND project_row_id=? ORDER BY revision_number DESC LIMIT 100
  `).bind(accountId, row.id).all();
  return { ok: true, revisions: (result.results || []).map(entry => ({
    id: String(entry.revision_number), version: String(entry.content_hash || ''),
    created_at: entry.created_at, kind: entry.revision_kind,
    metadata: parseObject(entry.metadata_json),
  })) };
}

export async function getStudioThemeProjectSnapshot(env, accountId, projectId, revision) {
  if (!accountId) return { ok: false, status: 403, error: 'account_required' };
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1)
    return { ok: false, status: 400, error: 'theme_project_revision_invalid' };
  const row = await studioRow(env, accountId, projectId);
  if (!row) return { ok: false, status: 404, error: 'theme_studio_project_not_found' };
  const prior = await env.DB.prepare(`
    SELECT content_object_key FROM cms_theme_studio_revisions
    WHERE account_id=? AND project_row_id=? AND revision_number=? LIMIT 1
  `).bind(accountId, row.id, Number(revision)).first();
  if (!prior?.content_object_key) return { ok: false, status: 404, error: 'theme_project_revision_not_found' };
  const project = await readR2Json(env, prior.content_object_key);
  if (!project || project.id !== projectId)
    return { ok: false, status: 503, error: 'theme_project_revision_unavailable' };
  return { ok: true, project };
}
