/**
 * Draft-site-per-try theme workspaces.
 *
 * Every "try theme" / "duplicate" creates its own draft `cms_sites` row plus a
 * `cms_site_themes` row. The immutable project snapshots keep living in R2 and
 * are indexed by `cms_globals` / `cms_revisions` through theme-project-store;
 * `cms_site_themes` is the account's inventory of those drafts. Users can hold
 * as many drafts as they like; nothing here touches a live site or a shared
 * Theme Store release.
 */
import {
  createThemeProject, getThemeProject, installThemeDraft, themeProjectPointer,
} from "./theme-project-store.mjs";

export const DRAFT_SITE_KIND = "marketplace-theme-draft";
const rand = (n) => crypto.randomUUID().replaceAll("-", "").slice(0, n);
const changes = (r) => Number(r?.meta?.changes ?? r?.changes ?? 0);
const dash = (v) => String(v || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

function parse(value) {
  try { const v = JSON.parse(value || "{}"); return v && typeof v === "object" ? v : {}; }
  catch { return {}; }
}

async function uniqueDraftSlug(db, accountId, base) {
  const root = base.slice(0, 70);
  for (let n = 1; n <= 200; n += 1) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const hit = await db.prepare("SELECT 1 AS x FROM cms_sites WHERE account_id=? AND slug=? LIMIT 1")
      .bind(accountId, candidate).first();
    if (!hit) return candidate;
  }
  return `${root}-${rand(8)}`;
}

async function createDraftSite(db, accountId, { name, slug, settings }) {
  const id = `cmssite_${rand(16)}`;
  await db.prepare(
    "INSERT INTO cms_sites (id,account_id,name,slug,status,is_default,settings_json) VALUES (?,?,?,?,'draft',0,?)"
  ).bind(id, accountId, name, slug, JSON.stringify({ kind: DRAFT_SITE_KIND, ...settings })).run();
  return id;
}

export async function discardThemeDraftSite(db, accountId, siteId) {
  // Used only to roll back a draft site created moments ago by a failed try.
  try {
    await db.prepare("DELETE FROM cms_site_themes WHERE account_id=? AND site_id=?").bind(accountId, siteId).run();
    await db.prepare("DELETE FROM cms_sites WHERE account_id=? AND id=? AND status='draft'").bind(accountId, siteId).run();
  } catch (error) {
    console.warn("cms_draft_site_rollback_failed", String(error?.message || error).slice(0, 120));
  }
}

async function catalogSource(db, slug, version) {
  try {
    const product = await db.prepare(
      "SELECT id FROM agentsam_products WHERE slug IN (?,?) AND kind='theme' ORDER BY (slug=?) DESC LIMIT 1"
    ).bind(slug, `theme-${slug}`, slug).first();
    if (!product) return { productId: null, releaseId: null };
    const release = await db.prepare(
      "SELECT id FROM agentsam_product_releases WHERE product_id=? AND version=? LIMIT 1"
    ).bind(product.id, version).first();
    return { productId: product.id, releaseId: release?.id || null };
  } catch { return { productId: null, releaseId: null }; }
}

async function insertSiteTheme(env, accountId, siteId, project, { kind, ref, name }) {
  const pointer = await themeProjectPointer(env, accountId, project.id, siteId);
  if (!pointer?.content_object_key) throw new Error("theme_project_content_pointer_missing");
  const source = kind === "catalog"
    ? await catalogSource(env.DB, project.sourceThemeId, project.sourcePackageVersion)
    : { productId: null, releaseId: null };
  const id = `cmst_${rand(16)}`;
  await env.DB.prepare(`
    INSERT INTO cms_site_themes
      (id,account_id,site_id,name,source_kind,source_product_id,source_release_id,source_ref,source_version,
       status,storage_ref,draft_manifest_key,draft_revision,metadata_json)
    VALUES (?,?,?,?,?,?,?,?,?,'ready','WEBSITE_ASSETS',?,?,?)
  `).bind(id, accountId, siteId, name, kind, source.productId, source.releaseId, ref,
    project.sourcePackageVersion || null, pointer.content_object_key, Number(pointer.content_version || 1),
    JSON.stringify({ project_id: project.id, cms_global_id: pointer.id, content_hash: pointer.content_hash })).run();
  return id;
}

function editorUrl(projectId, siteId) {
  return `/admin/theme-project-editor?project=${encodeURIComponent(projectId)}&site_id=${encodeURIComponent(siteId)}`;
}

/** "Try theme": new draft site + verified theme project + cms_site_themes row. */
export async function installThemeDraftSite(env, accountId, slug, payload, { site: providedSite = null } = {}) {
  if (!accountId) return { ok: false, status: 403, error: "account_required" };
  const version = String(payload?.package_version || "");
  const display = String(payload?.project?.name || slug).trim() || slug;
  const createdHere = !providedSite;
  let siteId = providedSite?.id || null;
  let siteName = providedSite?.name || `${display} — Draft`;
  if (providedSite) {
    if (String(providedSite.account_id || '') !== String(accountId) || providedSite.status !== 'draft' || !siteId)
      return { ok: false, status: 409, error: 'local_studio_draft_site_context_invalid' };
  } else {
    const siteSlug = await uniqueDraftSlug(env.DB, accountId, `theme-draft-${dash(slug)}-${dash(version)}`);
    siteId = await createDraftSite(env.DB, accountId, {
      name: siteName, slug: siteSlug,
      settings: { source_theme_slug: slug, source_release_version: version },
    });
  }
  let result;
  try { result = await installThemeDraft(env, accountId, slug, payload, siteId); }
  catch (error) {
    if (createdHere) await discardThemeDraftSite(env.DB, accountId, siteId);
    throw error;
  }
  if (!result.ok) {
    if (createdHere) await discardThemeDraftSite(env.DB, accountId, siteId);
    return result;
  }
  let themeId;
  try {
    themeId = await insertSiteTheme(env, accountId, siteId, result.project,
      { kind: "catalog", ref: null, name: display });
  } catch (error) {
    if (createdHere) await discardThemeDraftSite(env.DB, accountId, siteId);
    throw error;
  }
  return {
    ok: true, installed: true, unchanged: false, project: result.project,
    site_id: siteId, site_name: siteName, theme_id: themeId,
    editor_url: editorUrl(result.project.id, siteId),
  };
}

/** Duplicate an owned draft into a fresh, independent draft site. */
export async function duplicateThemeDraftSite(env, accountId, siteId, projectId, name = null) {
  if (!accountId) return { ok: false, status: 403, error: "account_required" };
  const origin = await env.DB.prepare(
    "SELECT id,name,slug,settings_json FROM cms_sites WHERE id=? AND account_id=? AND status!='archived' LIMIT 1"
  ).bind(siteId, accountId).first();
  if (!origin) return { ok: false, status: 404, error: "theme_draft_not_found" };
  const found = await getThemeProject(env, accountId, projectId, siteId);
  if (!found.ok) return found;
  const copyName = typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : `${found.project.name} — Copy`;
  const newSiteId = await createDraftSite(env.DB, accountId, {
    name: copyName, slug: await uniqueDraftSlug(env.DB, accountId, `${dash(origin.slug).slice(0, 56)}-copy`),
    settings: { ...parse(origin.settings_json), kind: DRAFT_SITE_KIND, cloned_from_site_id: siteId },
  });
  const copy = {
    ...structuredClone(found.project), id: `copy_${rand(12)}`, name: copyName,
    revision: 0, createdAt: null, updatedAt: null, clonedFromThemeProject: found.project.id,
  };
  const created = await createThemeProject(env, accountId, copy, newSiteId);
  if (!created.ok) { await discardThemeDraftSite(env.DB, accountId, newSiteId); return created; }
  let themeId;
  try {
    themeId = await insertSiteTheme(env, accountId, newSiteId, created.project,
      { kind: "canvas", ref: `${siteId}:${projectId}`, name: copyName });
  } catch (error) { await discardThemeDraftSite(env.DB, accountId, newSiteId); throw error; }
  return {
    ok: true, project: created.project, site_id: newSiteId, theme_id: themeId,
    editor_url: editorUrl(created.project.id, newSiteId),
  };
}

/** Inventory of the account's draft theme workspaces (newest first). */
export async function listThemeDraftSites(env, accountId) {
  if (!accountId) return { ok: false, status: 403, error: "account_required" };
  const { results = [] } = await env.DB.prepare(`
    SELECT t.id AS theme_id, t.site_id, t.name, t.source_kind, t.source_version, t.draft_revision,
           t.metadata_json, t.updated_at, s.slug AS site_slug
    FROM cms_site_themes t
    JOIN cms_sites s ON s.id=t.site_id AND s.account_id=t.account_id
    WHERE t.account_id=? AND t.status='ready' AND s.status='draft'
      AND json_extract(s.settings_json,'$.kind')=?
    ORDER BY t.updated_at DESC, t.created_at DESC LIMIT 200
  `).bind(accountId, DRAFT_SITE_KIND).all();
  return {
    ok: true,
    drafts: results.map((r) => {
      const meta = parse(r.metadata_json);
      return {
        theme_id: r.theme_id, site_id: r.site_id, site_slug: r.site_slug, project_id: meta.project_id || null,
        name: r.name, source_kind: r.source_kind, source_version: r.source_version,
        revision: r.draft_revision, updated_at: r.updated_at,
        editor_url: meta.project_id ? editorUrl(meta.project_id, r.site_id) : null,
      };
    }),
  };
}

/** Archive an owned draft (never a live/active site). Snapshots stay in R2. */
export async function archiveThemeDraftSite(env, accountId, siteId, projectId) {
  if (!accountId) return { ok: false, status: 403, error: "account_required" };
  const site = await env.DB.prepare(
    "SELECT id,status,settings_json FROM cms_sites WHERE id=? AND account_id=? LIMIT 1"
  ).bind(siteId, accountId).first();
  if (!site) return { ok: false, status: 404, error: "theme_draft_not_found" };
  if (site.status !== "draft" || parse(site.settings_json).kind !== DRAFT_SITE_KIND)
    return { ok: false, status: 409, error: "theme_draft_not_deletable" };
  // Never archive a whole draft site through a forged/wrong project ID, or
  // when several independent theme projects share the same draft site.
  const inventory = await env.DB.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN json_extract(metadata_json,'$.project_id')=? THEN 1 ELSE 0 END) AS matches
    FROM cms_site_themes WHERE account_id=? AND site_id=? AND status='ready'
  `).bind(projectId, accountId, siteId).first();
  if (!inventory?.matches) return { ok: false, status: 404, error: "theme_draft_not_found" };
  if (Number(inventory.total) !== 1)
    return { ok: false, status: 409, error: "theme_draft_has_multiple_projects" };

  const live = await env.DB.prepare(
    "SELECT 1 AS x FROM cms_site_themes WHERE account_id=? AND site_id=? AND is_live=1 LIMIT 1"
  ).bind(accountId, siteId).first();
  if (live) return { ok: false, status: 409, error: "theme_draft_is_live" };
  await env.DB.prepare("UPDATE cms_site_themes SET status='archived',updated_at=datetime('now') WHERE account_id=? AND site_id=?")
    .bind(accountId, siteId).run();
  const archived = await env.DB.prepare(
    "UPDATE cms_sites SET status='archived',updated_at=datetime('now') WHERE id=? AND account_id=? AND status='draft'"
  ).bind(siteId, accountId).run();
  return changes(archived) === 1 ? { ok: true, archived: true } : { ok: false, status: 409, error: "theme_draft_not_deletable" };
}

/** Keep the inventory row aligned with a newly saved revision. Never fatal. */
export async function syncSiteThemeRevision(env, accountId, siteId, projectId) {
  try {
    const pointer = await themeProjectPointer(env, accountId, projectId, siteId);
    if (!pointer?.content_object_key) return;
    await env.DB.prepare(`
      UPDATE cms_site_themes SET draft_manifest_key=?, draft_revision=?, updated_at=datetime('now')
      WHERE account_id=? AND site_id=? AND status='ready' AND json_extract(metadata_json,'$.project_id')=?
    `).bind(pointer.content_object_key, Number(pointer.content_version || 1), accountId, siteId, projectId).run();
  } catch (error) {
    console.warn("cms_site_theme_sync_failed", String(error?.message || error).slice(0, 120));
  }
}
