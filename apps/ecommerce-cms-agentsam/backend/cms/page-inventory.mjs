import { resolveCmsSite } from "./site-context.mjs";

/**
 * Canonical Ecommerce CMS page inventory.
 *
 * A page belongs to exactly one account-owned site. Sections inherit their site
 * through page_id; this inventory never reads the legacy pages/page_sections tables.
 */
export async function listCanonicalPageRows(db, accountId, siteId = null) {
  if (!accountId) throw new Error("cms_page_inventory_account_required");
  const site = await resolveCmsSite(db, { accountId, siteId });
  const { results = [] } = await db.prepare(`
    SELECT p.id, p.site_id, p.legacy_page_id, p.slug, p.route_path, p.title,
      p.status, p.updated_at, p.is_homepage, p.nav_visible, p.sort_order,
      (SELECT COUNT(*) FROM cms_page_sections s
         WHERE s.account_id = p.account_id AND s.page_id = p.id
           AND s.status NOT IN ('archived', 'removed')) AS section_count,
      (SELECT s.inline_content_json FROM cms_page_sections s
         WHERE s.account_id = p.account_id AND s.page_id = p.id
           AND s.status NOT IN ('archived', 'removed')
         ORDER BY s.sort_order ASC, s.id ASC LIMIT 1) AS preview_json
    FROM cms_pages p
    WHERE p.account_id = ? AND p.site_id = ?
    ORDER BY p.sort_order ASC, p.title ASC
  `).bind(accountId, site.id).all();
  return results;
}
