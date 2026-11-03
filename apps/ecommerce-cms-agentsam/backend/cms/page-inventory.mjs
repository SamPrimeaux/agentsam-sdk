import { resolveCmsSite } from "./site-context.mjs";

/**
 * CMS pages share an existing live D1 table. There are currently two schema
 * contracts in use: canonical site-first and the older project-owned layout.
 * Resolve them at the SQL boundary rather than rebuilding production tables
 * or inventing a second page registry. Both modes enforce site ownership.
 */
export async function cmsPageStorageMode(db) {
  const schema = await db.prepare("PRAGMA table_info(cms_pages)").bind().all();
  const columns = new Set((schema.results || []).map(column => column.name));
  if (columns.has("account_id") && columns.has("legacy_page_id") &&
      columns.has("site_id")) return "site-first";
  if (columns.has("site_id") && !columns.has("account_id")) return "project-site";
  throw new Error("cms_pages_schema_unsupported");
}

export async function listCanonicalPageRows(db, accountId, siteId = null) {
  if (!accountId) throw new Error("cms_page_inventory_account_required");
  const site = await resolveCmsSite(db, { accountId, siteId });
  const mode = await cmsPageStorageMode(db);

  if (mode === "project-site") {
    const schema = await db.prepare("PRAGMA table_info(cms_pages)").bind().all();
    const columns = new Set((schema.results || []).map(column => column.name));
    const notArchived = columns.has("archived_at") ? "AND p.archived_at IS NULL" : "";
    // The production table already has 79 pages with real site IDs; however,
    // it doesn't have the separate account_id/legacy_page_id columns or the
    // section version columns expected by the new CMS v2 test schema.
    const { results = [] } = await db.prepare(`
      SELECT p.id, p.site_id, NULL AS legacy_page_id, p.slug, p.route_path,
        p.title, p.status, CASE WHEN typeof(p.updated_at)='integer'
          THEN datetime(p.updated_at, 'unixepoch') ELSE p.updated_at END AS updated_at,
        p.is_homepage, p.nav_visible, p.sort_order,
        (SELECT COUNT(*) FROM cms_page_sections sec
          WHERE sec.page_id=p.id) AS section_count,
        (SELECT sec.section_data FROM cms_page_sections sec
          WHERE sec.page_id=p.id AND sec.is_visible != 0
          ORDER BY sec.sort_order, sec.id LIMIT 1) AS preview_json
      FROM cms_pages p
      INNER JOIN cms_sites owner ON owner.id=p.site_id
      WHERE owner.account_id=? AND p.site_id=? ${notArchived}
      ORDER BY p.sort_order ASC, p.title ASC
    `).bind(accountId, site.id).all();
    return results;
  }

  const { results = [] } = await db.prepare(`
    SELECT p.id, p.site_id, p.legacy_page_id, p.slug, p.route_path, p.title,
      p.status, p.updated_at, p.is_homepage, p.nav_visible, p.sort_order,
      (SELECT COUNT(*) FROM cms_page_sections sec
        WHERE sec.account_id=p.account_id AND sec.page_id=p.id
          AND sec.status NOT IN ('archived','removed')) AS section_count,
      (SELECT sec.inline_content_json FROM cms_page_sections sec
        WHERE sec.account_id=p.account_id AND sec.page_id=p.id
          AND sec.status NOT IN ('archived','removed')
        ORDER BY sec.sort_order, sec.id LIMIT 1) AS preview_json
    FROM cms_pages p
    WHERE p.account_id=? AND p.site_id=?
    ORDER BY p.sort_order ASC, p.title ASC
  `).bind(accountId, site.id).all();
  return results;
}
