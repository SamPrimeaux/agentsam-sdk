import { mergeSiteSettings } from '@inneranimalmedia/agentsam-cms/site-settings';

/**
 * Authorized site inventory for the Local Studio CMS.
 *
 * The shared D1 project/tenant/membership records determine which sites an IAM
 * account may see and edit. A client-supplied site slug is NEVER an authorization
 * assertion. External Worker sites retain their original CMS/database authority.
 */
const SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
const WRITERS = new Set(['owner', 'admin', 'editor']);
const PUBLISHERS = new Set(['owner', 'admin']);

export function assertCmsSlug(value) {
  const slug = typeof value === 'string' ? value.trim() : '';
  if (!SLUG.test(slug)) throw new Error('invalid_cms_site_slug');
  return slug;
}

export function cmsActorRequired(actorUserId) {
  if (typeof actorUserId !== 'string' || !/^au_[a-z0-9_-]{4,}$/i.test(actorUserId)) {
    throw new Error('cms_authentication_required');
  }
  return actorUserId;
}

function asJson(value) {
  try { return typeof value === 'string' ? JSON.parse(value || '{}') : value || {}; }
  catch { return {}; }
}



/** Create a website only inside the authenticated Local Studio account. */
export async function createAuthorizedCmsSite(db, actorUserId, input = {}) {
  const accountId = cmsActorRequired(actorUserId);
  if (!db?.prepare) throw new Error('cms_db_binding_unavailable');
  const name = String(input.name || '').trim();
  const slug = String(input.slug || '').trim().toLowerCase();
  if (!name || name.length > 120) throw new Error('cms_site_name_invalid');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) throw new Error('cms_site_slug_invalid');
  const primaryDomain = input.primary_domain == null || input.primary_domain === ''
    ? null : String(input.primary_domain).trim().toLowerCase();
  const aliases = Array.isArray(input.domain_aliases)
    ? [...new Set(input.domain_aliases.map(value => String(value).trim().toLowerCase()).filter(Boolean))]
    : [];
  const validDomain = value => value.length <= 253 &&
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
  if (primaryDomain && !validDomain(primaryDomain)) throw new Error('cms_site_domain_invalid');
  if (aliases.some(value => !validDomain(value))) throw new Error('cms_site_domain_alias_invalid');
  const existing = await db.prepare('SELECT id FROM cms_sites WHERE account_id = ? LIMIT 1')
    .bind(accountId).first();
  const id = String(input.id || `cmssite_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('cms_site_id_invalid');
  const settings = mergeSiteSettings(input.settings || {});
  const status = input.status === 'draft' ? 'draft' : 'active';
  const isDefault = input.is_default === true ? 1 : input.is_default === false ? 0 : (existing ? 0 : 1);
  await db.prepare(`
    INSERT INTO cms_sites (
      id, account_id, name, slug, primary_domain, domain_aliases_json,
      settings_json, status, is_default
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, accountId, name, slug, primaryDomain, JSON.stringify(aliases),
    JSON.stringify(settings), status, isDefault).run();
  if (isDefault) {
    await db.prepare('UPDATE cms_sites SET is_default = 0 WHERE account_id = ? AND id <> ?')
      .bind(accountId, id).run();
  }
  const site = await db.prepare(`
    SELECT id, account_id, name, slug, primary_domain, domain_aliases_json,
      settings_json, status, is_default, created_at, updated_at
    FROM cms_sites WHERE id = ? AND account_id = ?
  `).bind(id, accountId).first();
  if (!site) throw new Error('cms_site_create_failed');
  return site;
}

/**
 * External Worker sites are discovered from registered projects. Local/shared
 * CMS sites are discovered from cms_sites. Page rows are never used to infer
 * site identity; cms_pages.site_id is the sole page ownership boundary.
 */
export async function listAuthorizedCmsSites(db, actorUserId, { remoteWorkerNames = [] } = {}) {
  const actor = cmsActorRequired(actorUserId);
  const configuredRemoteWorkers = new Set(remoteWorkerNames);
  if (!db?.prepare) throw new Error('cms_db_binding_unavailable');
  const result = await db.prepare(`
    SELECT p.id AS project_id, p.name, p.domain, p.worker_id, p.metadata_json,
           p.tenant_id, t.workspace_id, t.owner_account_id AS account_id,
           CASE
             WHEN t.owner_account_id = ? THEN 'owner'
             WHEN EXISTS (
               SELECT 1 FROM memberships m
               WHERE m.workspace_id = t.workspace_id AND m.account_id = ?
                 AND m.role IN ('owner', 'admin')
             ) THEN 'admin'
             WHEN EXISTS (
               SELECT 1 FROM memberships m
               WHERE m.workspace_id = t.workspace_id AND m.account_id = ?
                 AND m.role = 'member'
             ) THEN 'editor'
             WHEN EXISTS (
               SELECT 1 FROM project_permissions pp
               WHERE pp.project_id = p.id AND pp.tenant_id = p.tenant_id
                 AND pp.subject_type = 'user' AND pp.subject_id = ?
                 AND pp.permission_level IN ('owner', 'approver')
                 AND (pp.expires_at IS NULL OR pp.expires_at > unixepoch())
             ) THEN 'editor'
             ELSE 'viewer'
           END AS role
    FROM projects p
    JOIN tenants t ON t.id = p.tenant_id AND t.is_active = 1
    WHERE p.worker_id IS NOT NULL
      AND (
        t.owner_account_id = ?
        OR EXISTS(
          SELECT 1 FROM memberships m WHERE m.workspace_id = t.workspace_id
            AND m.account_id = ? AND m.role IN ('owner','admin','member')
        )
        OR EXISTS(
          SELECT 1 FROM project_permissions pp
          WHERE pp.project_id = p.id AND pp.tenant_id = p.tenant_id
            AND pp.subject_type = 'user' AND pp.subject_id = ?
            AND pp.permission_level IN ('owner', 'approver','executor','viewer')
            AND (pp.expires_at IS NULL OR pp.expires_at > unixepoch())
        )
      )
    ORDER BY p.name ASC
  `).bind(actor, actor, actor, actor, actor, actor, actor).all();

  const projects = (result.results || []).map((row) => {
    const meta = asJson(row.metadata_json);
    const workerId = typeof row.worker_id === 'string' ? row.worker_id.trim() : '';
    const slug = meta.cms_slug || meta.site_slug || workerId;
    if (!slug || !SLUG.test(slug)) return null;
    // A remote Worker owns its own D1 and release process. Do not substitute
    // a stale/archived projection from the shared CMS database for that source.
    const source = workerId ? 'worker' : 'shared-d1';
    // Owning a Worker does not prove it has a CMS. Only installed CMS bridge
    // capabilities count; arbitrary API/services must not appear as websites.
    if (source === 'worker' && !configuredRemoteWorkers.has(workerId)) return null;
    const domain = meta.target_domain || meta.site || row.domain || null;
    return {
      id: row.project_id,
      account_id: row.account_id,
      slug,
      name: row.name,
      domain: typeof domain === 'string' ? domain : null,
      primary_domain: typeof domain === 'string' ? domain : null,
      domain_aliases_json: meta.domain_aliases_json || null,
      settings_json: meta.settings_json ? JSON.stringify(meta.settings_json) : null,
      status: 'active',
      is_default: false,
      page_count: null,
      project_id: row.project_id,
      tenant_id: row.tenant_id,
      workspace_id: row.workspace_id,
      worker_id: workerId || null,
      source,
      role: row.role,
      can_edit: WRITERS.has(row.role),
      can_publish: PUBLISHERS.has(row.role),
    };
  }).filter(Boolean);

  // Local/shared-D1 sites are owned directly by cms_sites. Page rows are only
  // checked by site_id to determine whether a Worker-backed site has local
  // content; no project_id/project_slug aliases are read from cms_pages.
  //
  // The exact authenticated account is the ownership authority here. Do not
  // discover sites by hostname, global D1 visibility, or Cloudflare access.
  // Worker-owned sites with no locally owned pages remain remote-only and
  // still require an explicitly configured, signed CMS bridge.
  let ownedRows = [];
  try {
    ({ results: ownedRows = [] } = await db.prepare(`
      SELECT s.id, s.account_id, s.slug, s.name, s.primary_domain,
        s.domain_aliases_json, s.settings_json, s.worker_id, s.status, s.is_default, s.updated_at,
        (SELECT COUNT(*) FROM cms_pages cp
          WHERE cp.site_id = s.id AND cp.status <> 'archived') AS page_count,
        EXISTS(
          SELECT 1 FROM cms_pages cp
          WHERE cp.site_id = s.id AND cp.status <> 'archived'
        ) AS has_pages
      FROM cms_sites s
      WHERE s.account_id = ? AND s.status != 'archived'
        AND (s.worker_id IS NULL OR EXISTS(
          SELECT 1 FROM cms_pages cp
          WHERE cp.site_id = s.id AND cp.status <> 'archived'
        ))
      ORDER BY s.name ASC
    `).bind(actor).all());
  } catch (error) {
    // A standalone legacy project CMS may not yet have cms_sites. It can
    // still list its signed Worker projects; other query failures must surface.
    if (!/no such table:\s*cms_sites/i.test(String(error))) throw error;
  }
  const bySlug = new Map(projects.map(site => [site.slug, site]));
  for (const row of ownedRows) {
    if (!SLUG.test(String(row.slug || ''))) continue;
    const existing = bySlug.get(row.slug);
    if (existing?.source === 'worker') continue;
    bySlug.set(row.slug, {
      id: row.id,
      account_id: row.account_id,
      slug: row.slug,
      name: row.name,
      domain: row.primary_domain || null,
      primary_domain: row.primary_domain || null,
      domain_aliases_json: row.domain_aliases_json || null,
      settings_json: row.settings_json || null,
      worker_id: row.worker_id || null,
      status: row.status || 'active',
      is_default: row.is_default === true || row.is_default === 1 || row.is_default === '1',
      updated_at: row.updated_at || null,
      page_count: Number(row.page_count || 0),
      source: 'shared-d1',
      role: 'owner',
      can_edit: true,
      can_publish: true,
    });
  }
  return [...bySlug.values()].sort((a, b) =>
    String(a.name || a.slug).localeCompare(String(b.name || b.slug)));
}

export function configuredCmsWorkers(env) {
  let bindings;
  try { bindings = JSON.parse(String(env.CMS_SITE_BRIDGES || '{}')); }
  catch { return []; }
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) return [];
  return Object.entries(bindings)
    .filter(([worker, binding]) =>
      typeof worker === 'string' &&
      typeof binding === 'string' &&
      /^[A-Z][A-Z0-9_]{1,63}$/.test(binding) &&
      env[binding] && typeof env[binding].fetch === 'function')
    .map(([worker]) => worker);
}

export async function requireCmsSiteAccess(db, actorUserId, siteSlug, access = 'read', opts = {}) {
  const slug = assertCmsSlug(siteSlug);
  const sites = await listAuthorizedCmsSites(db, actorUserId, opts);
  const site = sites.find((candidate) => candidate.slug === slug || candidate.id === slug);
  if (!site) return { ok: false, status: 404, error: 'cms_site_not_found_or_not_authorized' };
  if (access !== 'read' && !site.can_edit) {
    return { ok: false, status: 403, error: 'cms_site_write_forbidden' };
  }
  if (access === 'publish' && !site.can_publish) {
    return { ok: false, status: 403, error: 'cms_site_publish_forbidden' };
  }
  return { ok: true, site };
}


/** Resolve only an explicitly selected, authorized Local Studio site. */
export async function resolveCmsSiteAccess(db, actorUserId, selector = null, access = 'read', opts = {}) {
  if (!selector) return { ok: false, status: 400, error: 'cms_site_required' };
  const key = assertCmsSlug(selector);
  return requireCmsSiteAccess(db, actorUserId, key, access, opts);
}

/** Read only an explicit site selector; generic page/project slugs are ignored. */
export async function readCmsSiteSelector(request) {
  const url = new URL(request.url);
  const fromUrl = url.searchParams.get('site_id') || url.searchParams.get('site') || url.searchParams.get('site_slug');
  if (fromUrl) return fromUrl;
  if (['GET', 'HEAD'].includes(request.method)) return null;
  const contentType = request.headers.get('content-type') || '';
  try {
    const clone = request.clone();
    if (contentType.includes('application/json')) {
      const body = await clone.json();
      return body?.site_id || body?.siteId || body?.site_slug || body?.siteSlug || null;
    }
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const body = await clone.formData();
      return body.get('site_id') || body.get('siteId') || body.get('site_slug') || body.get('siteSlug') || null;
    }
  } catch { /* The original request remains available to its handler. */ }
  return null;
}

/**
 * The editor's Side Assistant carries the selected site inside client context;
 * the caller must validate that selector against Local Studio site authority, not as a top-level request field. Extract only an
 * explicit site ID from that editor context; the caller must still authorize it
 * against cms_sites before entering the site scope.
 */
export async function readCmsAssistantSiteSelector(request) {
  const direct = await readCmsSiteSelector(request);
  if (direct) return direct;
  if (['GET', 'HEAD'].includes(request.method)) return null;
  try {
    const body = await request.clone().json();
    const context = body?.context && typeof body.context === 'object' && !Array.isArray(body.context)
      ? body.context : {};
    const resource = context.selected_resource;
    if (resource?.type === 'section' && resource?.surface === 'theme-studio') {
      const siteId = resource.site_id || context.site_id || context.siteId;
      if (!siteId) throw new Error('cms_assistant_site_required');
      return String(siteId);
    }
    return context.site_id || context.siteId || null;
  } catch (error) {
    if (error?.message === 'cms_assistant_site_required') throw error;
    return null;
  }
}
