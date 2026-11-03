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

/**
 * Only return concrete, registered projects. CMS source is discovered through
 * project_id, and external Workers through project.worker_id; never infer
 * a site from the current host, fixtures, or a user-supplied hostname.
 */
export async function listAuthorizedCmsSites(db, actorUserId, { remoteWorkerNames = [] } = {}) {
  const actor = cmsActorRequired(actorUserId);
  const configuredRemoteWorkers = new Set(remoteWorkerNames);
  if (!db?.prepare) throw new Error('cms_db_binding_unavailable');
  const result = await db.prepare(`
    SELECT p.id AS project_id, p.name, p.domain, p.worker_id, p.metadata_json,
           p.tenant_id, t.workspace_id,
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
           END AS role,
           (
             SELECT cp.project_slug FROM cms_pages cp
             WHERE cp.project_id = p.id AND cp.is_active = 1
             ORDER BY cp.is_homepage DESC, cp.created_at ASC LIMIT 1
           ) AS cms_slug
    FROM projects p
    JOIN tenants t ON t.id = p.tenant_id AND t.is_active = 1
    WHERE (p.worker_id IS NOT NULL
      OR EXISTS(SELECT 1 FROM cms_pages cp WHERE cp.project_id = p.id AND cp.is_active = 1))
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
    const slug = row.cms_slug || meta.cms_slug || meta.site_slug || workerId;
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
      slug,
      name: row.name,
      domain: typeof domain === 'string' ? domain : null,
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

  // The platform also registers sites directly in cms_sites. Its public SDK
  // pages have real site_id + project_slug records even when no corresponding
  // row exists in the older projects/tenants catalog. The /api/admin/cms/sites
  // endpoint already recognizes them; /api/cms/sites must not silently hide
  // an account's own website from its installed HTML-source editor.
  //
  // The exact authenticated account is the ownership authority here. Do not
  // discover sites by hostname, global D1 visibility, or Cloudflare access.
  // Worker-owned sites with no locally owned pages remain remote-only and
  // still require an explicitly configured, signed CMS bridge.
  let ownedRows = [];
  try {
    ({ results: ownedRows = [] } = await db.prepare(`
      SELECT s.id, s.account_id, s.slug, s.name, s.primary_domain,
        s.worker_id, s.status, p.project_id, p.project_slug
      FROM cms_sites s
      LEFT JOIN cms_pages p ON p.id = (
        SELECT cp.id FROM cms_pages cp
        WHERE cp.site_id = s.id AND cp.is_active = 1
        ORDER BY cp.is_homepage DESC, cp.created_at ASC LIMIT 1
      )
      WHERE s.account_id = ? AND s.status != 'archived'
        AND (s.worker_id IS NULL OR p.id IS NOT NULL)
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
      slug: row.slug,
      name: row.name,
      domain: row.primary_domain || null,
      project_id: row.project_id || row.id,
      tenant_id: null,
      workspace_id: null,
      worker_id: row.worker_id || null,
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
  const site = sites.find((candidate) => candidate.slug === slug);
  if (!site) return { ok: false, status: 404, error: 'cms_site_not_found_or_not_authorized' };
  if (access !== 'read' && !site.can_edit) {
    return { ok: false, status: 403, error: 'cms_site_write_forbidden' };
  }
  if (access === 'publish' && !site.can_publish) {
    return { ok: false, status: 403, error: 'cms_site_publish_forbidden' };
  }
  return { ok: true, site };
}
