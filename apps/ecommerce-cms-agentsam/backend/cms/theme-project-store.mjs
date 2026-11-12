/**
 * Account-scoped theme project storage on the canonical CMS v2 primitives.
 * D1 holds identity/version pointers; immutable project snapshots live in R2.
 * No local-only theme project table or parallel theme database is introduced.
 */
import { validateThemeProject } from "../../frontend/theme-editor/project.mjs";
import { validateThemeSettings } from "./theme-style-contract.mjs";
import { fillMissingThemeChrome } from "../../frontend/theme-editor/starter-chrome.mjs";
import { readR2Json, writeR2Json } from "./r2-store.js";
import { resolveCmsSite } from "./site-context.mjs";

const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/;
// System route `404` is a canonical editor template; its leading digit must
// not invalidate an otherwise safe theme project during startup repair.
const SAFE_SLUG = /^(?:[a-z][a-z0-9-]{0,63}|404)$/;
const PACKAGE_NAME = /^@inneranimalmedia\/[a-z0-9-]+$/;
const PACKAGE_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/;
const MAX_PROJECT_BYTES = 8 * 1024 * 1024;

export function themeProjectGlobalKey(id) {
  if (!SAFE_ID.test(String(id)) || ["__proto__", "constructor", "prototype"].includes(String(id))) {
    throw new Error("theme_project_id_invalid");
  }
  return `theme-project:${id}`;
}

function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function parseObject(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value || "");
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function hashText(value) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}

export function validateThemeProjectPayload(value) {
  const project = validateThemeProject(value);
  // Installed theme controls share the site CMS validation contract before
  // storing a new immutable project revision. UI validation is not a gate.
  if (project.themeSettings !== undefined && !validateThemeSettings(project.themeSettings).ok)
    throw new Error("theme_project_settings_invalid");
  if (!SAFE_ID.test(String(project.id)) || ["__proto__", "constructor", "prototype"].includes(String(project.id))) {
    throw new Error("theme_project_id_invalid");
  }
  if (typeof project.name !== "string" || !project.name.trim() || project.name.trim().length > 160) {
    throw new Error("theme_project_name_invalid");
  }
  if (!Array.isArray(project.pages) || project.pages.length < 1 || project.pages.length > 80) {
    throw new Error("theme_project_pages_invalid");
  }
  for (const page of project.pages) {
    if (!SAFE_SLUG.test(String(page.slug)) || typeof page.title !== "string" || page.title.length > 200) {
      throw new Error("theme_project_page_invalid");
    }
    if (!Array.isArray(page.sections) || page.sections.length > 120) {
      throw new Error("theme_project_sections_invalid");
    }
  }
  // Extra workspace files are JSON data in the site's immutable project
  // snapshot, never arbitrary filesystem paths. Enforce this at the API
  // boundary; the editor's client-side path guard is only UX validation.
  const files = project.files ?? [];
  const directories = project.directories ?? [];
  if (!Array.isArray(files) || files.length > 500 || !Array.isArray(directories) || directories.length > 500) {
    throw new Error("theme_project_files_invalid");
  }
  const seen = new Set();
  const safeRelativePath = (value, { directory = false } = {}) => {
    if (typeof value !== "string" || !value || value.length > 500 || value.includes("\\") || value.startsWith("/")) return false;
    if (directory && value.endsWith("/")) value = value.slice(0, -1);
    if (!value || value.split("/").some(part => !part || part === "." || part === ".." || /[\u0000-\u001f<>:\"|?*]/.test(part))) return false;
    return true;
  };
  const reserved = new Set(["settings/tokens.json"]);
  for (const page of project.pages) {
    reserved.add(`pages/${page.slug}/index.html`);
    for (const section of page.sections || []) reserved.add(`pages/${page.slug}/sections/${section.key}.html`);
  }
  for (const entry of files) {
    if (!entry || !safeRelativePath(entry.path) || typeof entry.content !== "string" || seen.has(entry.path) || reserved.has(entry.path)) {
      throw new Error("theme_project_file_invalid");
    }
    seen.add(entry.path);
  }
  const directorySet = new Set();
  for (const path of directories) {
    if (!safeRelativePath(path, { directory: true }) || directorySet.has(path)) throw new Error("theme_project_directory_invalid");
    directorySet.add(path);
  }
  const serialized = JSON.stringify(project);
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROJECT_BYTES) {
    throw new Error("theme_project_too_large");
  }
  return project;
}

function projectSummary(project) {
  return {
    id: project.id,
    name: project.name,
    packageName: project.sourcePackage || null,
    sourceThemeId: project.sourceThemeId || null,
    sourcePackageVersion: project.sourcePackageVersion || null,
    sourcePreviewUrl: project.sourcePreviewUrl || null,
    version: project.version || "0.1.0",
    revision: Number(project.revision || 0),
    createdAt: project.createdAt || null,
    updatedAt: project.updatedAt || null,
    pages: (project.pages || []).map(({ slug, title }) => ({ slug, title })),
  };
}

function projectR2Key(accountId, siteId, projectId, revision, hash) {
  // Scope each owned draft's immutable snapshot to its actual website. Older
  // snapshots remain readable via their existing D1 content_object_key.
  return `cms/accounts/${encodeURIComponent(accountId)}/sites/${encodeURIComponent(siteId)}/theme-projects/${encodeURIComponent(projectId)}/revisions/${String(revision).padStart(6, '0')}-${hash.slice(0,16)}.json`;
}

async function projectRow(env, accountId, id, siteId = null) {
  const site = siteId
    ? await resolveCmsSite(env.DB, { accountId, siteId })
    : await resolveCmsSite(env.DB, { accountId, createDefault: true });
  return env.DB.prepare(
    "SELECT id,account_id,site_id,global_key,global_type,status,inline_content_json,content_object_key,content_version,content_hash,created_at,updated_at FROM cms_globals WHERE account_id=? AND site_id=? AND global_key=? AND global_type='theme-project' AND status!='archived' LIMIT 1"
  ).bind(accountId, site.id, themeProjectGlobalKey(id)).first();
}

async function projectFromRow(env, row) {
  if (!row) return null;
  if (!row.content_object_key) throw Object.assign(new Error("theme_project_content_pointer_missing"), { status: 503 });
  const value = await readR2Json(env, row.content_object_key);
  if (!value) throw Object.assign(new Error("theme_project_content_unavailable"), { status: 503 });
  const project = validateThemeProjectPayload(value);
  if (project.id !== String(row.global_key).slice("theme-project:".length)) {
    throw Object.assign(new Error("theme_project_identity_mismatch"), { status: 409 });
  }
  project.revision = Number(row.content_version || 0);
  return project;
}

async function writeRevision(env, accountId, row, project, revision, reason, siteId = null) {
  const site = row?.site_id
    ? { id: row.site_id }
    : siteId
      ? await resolveCmsSite(env.DB, { accountId, siteId })
      : await resolveCmsSite(env.DB, { accountId, createDefault: true });
  const serialized = JSON.stringify(project);
  const contentHash = await hashText(serialized);
  const key = projectR2Key(accountId, site.id, project.id, revision, contentHash);
  if (!await writeR2Json(env, key, project)) {
    return { ok: false, status: 503, code: "cms_r2_unavailable" };
  }
  const summary = projectSummary(project);
  const inline = JSON.stringify(summary);
  if (!row) {
    const globalId = "cmsg_" + crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    const inserted = await env.DB.prepare(
      "INSERT INTO cms_globals (id,account_id,site_id,global_key,global_type,status,inline_content_json,content_object_key,content_version,content_hash,metadata_json) VALUES (?,?,?,?,'theme-project','draft',?,?,?,?,?) ON CONFLICT(site_id,global_key) DO NOTHING"
    ).bind(globalId, accountId, site.id, themeProjectGlobalKey(project.id), inline, key, revision, contentHash,
      JSON.stringify({ source: "theme-store", schema: project.schema })).run();
    if (changes(inserted) !== 1) return { ok: false, status: 409, code: "theme_project_exists" };
    row = await projectRow(env, accountId, project.id, site.id);
  } else {
    const updated = await env.DB.prepare(
      "UPDATE cms_globals SET inline_content_json=?,content_object_key=?,content_version=?,content_hash=?,status='draft',updated_at=datetime('now') WHERE id=? AND account_id=? AND site_id=? AND content_version=?"
    ).bind(inline, key, revision, contentHash, row.id, accountId, site.id, revision - 1).run();
    if (changes(updated) !== 1) return { ok: false, status: 409, code: "theme_project_version_conflict" };
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO cms_revisions (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key,content_hash,snapshot_json,metadata_json) VALUES (?,?, 'global',?,?,'draft',?,?,?,?)"
  ).bind(accountId, site.id, row.id, revision, key, contentHash,
    JSON.stringify({ project_id: project.id, name: project.name, revision }),
    JSON.stringify({ source: "theme-store", reason,
      package: project.sourcePackage || null, version: project.sourcePackageVersion || null,
      release_sha256: project.sourceReleaseSha256 || null })).run();
  // Record actual ownership/adoption/editing against the existing CMS activity
  // spine; model-token usage tables are not theme adoption analytics.
  // Activity logging must not make an already persisted revision appear lost.
  try {
    await env.DB.prepare(
      "INSERT INTO cms_activity_log (id,site_id,actor_account_id,action,resource_type,resource_id,details_json) VALUES (?,?,?,?,?,?,?)"
    ).bind("cmsact_" + crypto.randomUUID().replaceAll("-", "").slice(0, 16),
      site.id,accountId,reason === "install" ? "theme.installed" :
        reason === "save" ? "theme.draft.saved" : "theme.draft.created",
      "theme-project",project.id,
      JSON.stringify({
        sku: project.sourceThemeId ? "iam.theme." + project.sourceThemeId : null,
        source_release_sha256: project.sourceReleaseSha256 || null,
        package_version: project.sourcePackageVersion || null,
        revision,content_hash:contentHash,r2_key:key,
      })).run();
  } catch (error) {
    console.warn("cms_theme_activity_log_unavailable", String(error?.message || error).slice(0, 100));
  }
  return { ok: true, project, row, content_object_key: key, content_hash: contentHash };
}

export async function listThemeProjects(env, accountId, siteId = null) {
  if (!accountId) return { ok: false, status: 403, error: "account_required" };
  const site = siteId
    ? await resolveCmsSite(env.DB, { accountId, siteId })
    : await resolveCmsSite(env.DB, { accountId, createDefault: true });
  const result = await env.DB.prepare(
    "SELECT inline_content_json FROM cms_globals WHERE account_id=? AND site_id=? AND global_type='theme-project' AND status!='archived' ORDER BY updated_at DESC"
  ).bind(accountId, site.id).all();
  const projects = (result.results || []).map((row) => parseObject(row.inline_content_json, null)).filter((item) =>
    item && SAFE_ID.test(String(item.id)) && typeof item.name === "string"
  );
  return { ok: true, source: "cms_globals+r2", projects };
}

export async function getThemeProject(env, accountId, id, siteId = null) {
  if (!accountId) return { ok: false, status: 403, error: "account_required" };
  if (!SAFE_ID.test(String(id))) return { ok: false, status: 400, error: "theme_project_id_invalid" };
  try {
    const row = await projectRow(env, accountId, id, siteId);
    if (!row) return { ok: false, status: 404, error: "theme_project_not_found" };
    const project = await projectFromRow(env, row);
    return { ok: true, project };
  } catch (error) {
    const message = String(error?.message || error || "theme_project_read_failed");
    return { ok: false, status: error.status || (message.includes("not_found") ? 404 : 503), error: message };
  }
}

/** Existing CMS revision pointers are the only history authority. */
export async function listThemeProjectHistory(env, accountId, id, siteId = null) {
  if (!accountId) return { ok: false, status: 403, error: 'account_required' };
  if (!SAFE_ID.test(String(id))) return { ok: false, status: 400, error: 'theme_project_id_invalid' };
  try {
    const row = await projectRow(env, accountId, id, siteId);
    if (!row) return { ok: false, status: 404, error: 'theme_project_not_found' };
    const result = await env.DB.prepare(
      "SELECT revision_number,revision_kind,content_hash,created_at,metadata_json FROM cms_revisions WHERE account_id=? AND site_id=? AND entity_type='global' AND entity_id=? ORDER BY revision_number DESC LIMIT 100"
    ).bind(accountId, row.site_id, row.id).all();
    return { ok: true, revisions: (result.results || []).map(entry => ({
      id: String(entry.revision_number), version: String(entry.content_hash || ''),
      created_at: entry.created_at, kind: entry.revision_kind,
      metadata: parseObject(entry.metadata_json),
    })) };
  } catch (error) {
    return { ok: false, status: error.status || 503, error: String(error.message || error) };
  }
}

export async function getThemeProjectSnapshot(env, accountId, id, revision, siteId = null) {
  if (!accountId) return { ok: false, status: 403, error: 'account_required' };
  if (!SAFE_ID.test(String(id)) || !Number.isSafeInteger(Number(revision)) || Number(revision) < 1)
    return { ok: false, status: 400, error: 'theme_project_revision_invalid' };
  try {
    const row = await projectRow(env, accountId, id, siteId);
    if (!row) return { ok: false, status: 404, error: 'theme_project_not_found' };
    const prior = await env.DB.prepare(
      "SELECT content_object_key FROM cms_revisions WHERE account_id=? AND site_id=? AND entity_type='global' AND entity_id=? AND revision_number=? LIMIT 1"
    ).bind(accountId, row.site_id, row.id, Number(revision)).first();
    if (!prior?.content_object_key) return { ok: false, status: 404, error: 'theme_project_revision_not_found' };
    const project = await readR2Json(env, prior.content_object_key);
    if (!project || project.id !== id) return { ok: false, status: 503, error: 'theme_project_revision_unavailable' };
    return { ok: true, project };
  } catch (error) {
    return { ok: false, status: error.status || 503, error: String(error.message || error) };
  }
}

export async function createThemeProject(env, accountId, value, siteId = null) {
  if (!accountId) return { ok: false, status: 403, error: "account_required" };
  if (!env.WEBSITE_ASSETS) return { ok: false, status: 503, error: "cms_r2_unavailable" };
  let project;
  try { project = validateThemeProjectPayload(value); }
  catch (error) { return { ok: false, status: 400, error: error.message || "theme_project_invalid" }; }
  if (await projectRow(env, accountId, project.id, siteId)) {
    return { ok: false, status: 409, error: "theme_project_exists" };
  }
  const now = new Date().toISOString();
  project = { ...project, revision: 1, createdAt: project.createdAt || now, updatedAt: now };
  const saved = await writeRevision(env, accountId, null, project, 1, "create", siteId);
  if (!saved.ok) {
    if (saved.code === "theme_project_exists") {
      const existing = await getThemeProject(env, accountId, project.id, siteId);
      if (existing.ok) return { ok: true, unchanged: true, project: existing.project };
    }
    return { ok: false, status: saved.status || 503, error: saved.code || "theme_project_create_failed" };
  }
  return { ok: true, project };
}

function safePreviewUrl(value, slug, version) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, "https://theme.invalid");
    const local = url.origin === "https://theme.invalid" &&
      url.pathname.startsWith(`/themes/${slug}/`);
    const released = url.origin === "https://themes.inneranimalmedia.com" &&
      url.pathname.startsWith(`/theme-packages/${slug}/${version}/preview/`);
    if ((!local && !released) || url.pathname.split("/").includes("..") ||
        url.username || url.password || url.search || url.hash) return null;
    return released ? url.href : url.pathname;
  } catch { return null; }
}

export async function installThemeDraft(env, accountId, slug, payload = {}, siteId = null) {
  if (!accountId) return { ok: false, status: 403, error: "account_required" };
  if (!env.WEBSITE_ASSETS) return { ok: false, status: 503, error: "cms_r2_unavailable" };
  if (!SAFE_SLUG.test(String(slug))) return { ok: false, status: 400, error: "theme_slug_invalid" };

  let project;
  try { project = validateThemeProjectPayload(payload.project); }
  catch (error) { return { ok: false, status: 400, error: error.message || "theme_project_invalid" }; }

  const packageName = String(payload.package_name || "");
  const packageVersion = String(payload.package_version || "");
  const packageLeaf = packageName.split("/").pop() || "";
  const packageSlug = packageLeaf.startsWith("theme-") ? packageLeaf.slice(6) : packageLeaf;
  const previewUrl = safePreviewUrl(payload.preview_url || project.sourcePreviewUrl, slug, packageVersion);
  if (!PACKAGE_NAME.test(packageName) || packageSlug !== slug || !PACKAGE_VERSION.test(packageVersion)) {
    return { ok: false, status: 400, error: "theme_package_identity_invalid" };
  }
  if (project.id !== `theme_${slug}` || project.sourceThemeId !== slug || project.sourcePackage !== packageName) {
    return { ok: false, status: 400, error: "theme_project_source_mismatch" };
  }
  project.sourcePackageVersion = packageVersion;
  project.sourcePreviewUrl = previewUrl;

  // The stable project ID is the idempotency key for one package's installed draft.
  const existingRow = await projectRow(env, accountId, project.id, siteId);
  if (existingRow) {
    try {
      const existing = await projectFromRow(env, existingRow);
      if (existing.sourceThemeId === slug && existing.sourcePackage === packageName) {
        return { ok: true, installed: true, unchanged: true, project: existing };
      }
      return { ok: false, status: 409, error: "theme_project_install_conflict" };
    } catch (error) {
      return { ok: false, status: error.status || 503, error: error.message || "theme_project_read_failed" };
    }
  }

  // Fill only chrome absent from the package. Installed projects remain immutable on repeat install.
  let site;
  try { site = await resolveCmsSite(env.DB, { accountId, siteId, createDefault: !siteId }); }
  catch { return { ok: false, status: 404, error: "cms_site_not_found" }; }
  try { project = validateThemeProjectPayload(fillMissingThemeChrome(project, site.name)); }
  catch (error) { return { ok: false, status: 400, error: error.message || "theme_project_invalid" }; }

  const artifactKey = `theme/${slug}`;
  const artifactResult = await env.DB.prepare(
    "SELECT id,source_ref,content_hash,manifest_object_key,metadata_json,version,status FROM cms_artifacts WHERE account_id=? AND artifact_key=? AND version=? LIMIT 1"
  ).bind(accountId, artifactKey, packageVersion).first();
  if (artifactResult && artifactResult.source_ref !== packageName) {
    return { ok: false, status: 409, error: "theme_artifact_source_conflict" };
  }

  const prefix = `cms/accounts/${encodeURIComponent(accountId)}/theme-packages/${slug}/${encodeURIComponent(packageVersion)}`;
  // Content-addressed release record: site edits are saved separately.
  const manifest = {
    schema: "agentsam.theme-install.v1",
    slug,
    packageName,
    packageVersion,
    projectId: project.id,
    previewUrl,
    pages: project.pages.map(({ slug: pageSlug, title }) => ({ slug: pageSlug, title })),
    delivery: project.sourceReleaseSha256 ? "verified-theme-store-release" : "bundled-package-assets",
    sourceReleaseSha256: project.sourceReleaseSha256 || null,
  };
  const manifestHash = await hashText(JSON.stringify(manifest));
  const manifestKey = `${prefix}/manifests/${manifestHash}.json`;
  if (artifactResult && artifactResult.content_hash !== manifestHash) {
    return { ok: false, status: 409, error: "theme_release_manifest_conflict" };
  }
  if (!artifactResult && !await writeR2Json(env, manifestKey, manifest)) {
    return { ok: false, status: 503, error: "cms_r2_unavailable" };
  }

  if (!artifactResult) {
    const artifactId = "cma_" + crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    await env.DB.prepare(
      "INSERT INTO cms_artifacts (id,account_id,artifact_key,artifact_type,version,object_prefix,manifest_object_key,content_hash,content_mode,status,source_kind,source_ref,metadata_json) VALUES (?,?,?,'theme',?,?,?,?,'manifest','ready','package',?,?) ON CONFLICT(account_id,artifact_key,version) DO NOTHING"
    ).bind(artifactId, accountId, artifactKey, packageVersion, prefix, manifestKey, manifestHash, packageName,
      JSON.stringify({ label: project.name, project_id: project.id, preview_url: previewUrl, sourceThemeId: slug })).run();
  }

  const now = new Date().toISOString();
  project = { ...project, revision: 1, createdAt: project.createdAt || now, updatedAt: now };
  const saved = await writeRevision(env, accountId, null, project, 1, "install", siteId);
  if (!saved.ok) {
    if (saved.code === "theme_project_exists") {
      const existing = await getThemeProject(env, accountId, project.id, siteId);
      if (existing.ok && existing.project.sourceThemeId === slug && existing.project.sourcePackage === packageName) {
        return { ok: true, installed: true, unchanged: true, project: existing.project };
      }
    }
    return { ok: false, status: saved.status || 503, error: saved.code || "theme_install_failed" };
  }
  return { ok: true, installed: true, unchanged: false, project };
}

export async function saveThemeProject(env, accountId, id, value, expectedVersion, siteId = null) {
  if (!accountId) return { ok: false, status: 403, error: "account_required" };
  if (!env.WEBSITE_ASSETS) return { ok: false, status: 503, error: "cms_r2_unavailable" };
  if (!SAFE_ID.test(String(id))) return { ok: false, status: 400, error: "theme_project_id_invalid" };
  let project;
  try { project = validateThemeProjectPayload(value); }
  catch (error) { return { ok: false, status: 400, error: error.message || "theme_project_invalid" }; }
  if (project.id !== id) return { ok: false, status: 400, error: "theme_project_identity_mismatch" };

  const row = await projectRow(env, accountId, id, siteId);
  if (!row) return { ok: false, status: 404, error: "theme_project_not_found" };
  const currentVersion = Number(row.content_version || 0);
  const expected = Number(expectedVersion);
  if (!Number.isInteger(expected) || expected !== currentVersion) {
    return { ok: false, status: 409, error: "theme_project_version_conflict", current_version: currentVersion };
  }

  const now = new Date().toISOString();
  project = {
    ...project,
    revision: currentVersion + 1,
    createdAt: project.createdAt || (await projectFromRow(env, row)).createdAt || now,
    updatedAt: now,
  };
  const saved = await writeRevision(env, accountId, row, project, currentVersion + 1, "save", siteId);
  if (!saved.ok) return { ok: false, status: saved.status || 503, error: saved.code || "theme_project_save_failed" };
  return { ok: true, project };
}
