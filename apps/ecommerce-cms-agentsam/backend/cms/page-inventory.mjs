import { resolveCmsSite } from "./site-context.mjs";

/**
 * CMS pages use one page registry with three observed migration states:
 * canonical site-first, legacy shared-D1 site-owned, and migrated shared-D1
 * site-owned. Keep the transition explicit at the SQL boundary; all states
 * resolve ownership through the selected cms_sites record.
 */
export async function cmsPageStorageMode(db) {
  const schema = await db.prepare("PRAGMA table_info(cms_pages)").bind().all();
  const columns = new Set((schema.results || []).map(column => column.name));
  if (columns.has("account_id") && columns.has("legacy_page_id") &&
      columns.has("site_id")) return "site-first";
  if (columns.has("site_id") && !columns.has("account_id")) {
    const legacyPageColumns = [
      "project_id", "project_slug", "workspace_id", "worker_id",
      "person_uuid", "path", "is_homepage", "is_active",
    ];
    return legacyPageColumns.some(column => columns.has(column))
      ? "site-owned-legacy" : "site-owned";
  }
  throw new Error("cms_pages_schema_unsupported");
}

export async function listCanonicalPageRows(db, accountId, siteId = null) {
  if (!accountId) throw new Error("cms_page_inventory_account_required");
  const site = await resolveCmsSite(db, { accountId, siteId });
  const mode = await cmsPageStorageMode(db);

  if (mode === "site-owned" || mode === "site-owned-legacy") {
    const schema = await db.prepare("PRAGMA table_info(cms_pages)").bind().all();
    const columns = new Set((schema.results || []).map(column => column.name));
    const notArchived = columns.has("status") ? "AND p.status <> 'archived'" : "";
    // The production table is site-owned through cms_sites.id; account identity
    // is resolved through the owning site rather than duplicated on every page.
    const { results = [] } = await db.prepare(`
      SELECT p.id, p.site_id, NULL AS legacy_page_id, p.slug, p.route_path,
        p.title, p.status, CASE WHEN typeof(p.updated_at)='integer'
          THEN datetime(p.updated_at, 'unixepoch') ELSE p.updated_at END AS updated_at,
        CASE WHEN p.route_path = '/' THEN 1 ELSE 0 END AS is_homepage,
        p.nav_visible, p.sort_order,
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
