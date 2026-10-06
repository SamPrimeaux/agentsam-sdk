/**
 * Authorized CMS site discovery for the shared D1 database.
 *
 * A route slug alone is never proof of access: every CMS read/write must be
 * checked against a validated IAM user and the site's owner/workspace roster.
 * Catalog queries do not expose unpublished CMS content.
 */
export const CMS_AUTHORIZED_SITES_SQL = `
SELECT
  cp.project_slug AS slug,
  COALESCE(MAX(NULLIF(p.name, '')), cp.project_slug) AS name,
  MAX(NULLIF(p.domain, '')) AS domain,
  COUNT(DISTINCT cp.id) AS page_count
FROM cms_pages cp
LEFT JOIN projects p
  ON p.id = cp.project_slug
  OR p.project_id = cp.project_slug
  OR p.id = 'proj_' || cp.project_slug
WHERE COALESCE(cp.is_active, 1) = 1
  AND (
    p.owner_user_id = ?
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.user_id = ?
        AND COALESCE(wm.is_active, 1) = 1
        AND wm.workspace_id = COALESCE(NULLIF(cp.workspace_id, ''), p.workspace_id)
    )
    OR EXISTS (
      SELECT 1
      FROM workspaces w
      WHERE w.user_id = ?
        AND w.id = COALESCE(NULLIF(cp.workspace_id, ''), p.workspace_id)
    )
  )
GROUP BY cp.project_slug
ORDER BY name COLLATE NOCASE, slug
LIMIT 250
`;

export async function listAuthorizedCmsSites(db, userId) {
  if (!db || typeof db.prepare !== 'function' || typeof userId !== 'string' || !userId.trim()) {
    return [];
  }
  const { results = [] } = await db
    .prepare(CMS_AUTHORIZED_SITES_SQL)
    .bind(userId, userId, userId)
    .all();
  return results
    .filter((site) => typeof site.slug === 'string' && site.slug.trim())
    .map((site) => ({
      id: site.slug,
      slug: site.slug,
      name: site.name || site.slug,
      domain: site.domain || null,
      page_count: Number(site.page_count || 0),
    }));
}

export function canAccessCmsSite(sites, slug) {
  return typeof slug === 'string' && sites.some((site) => site.slug === slug);
}
