/**
 * Canonical ecommerce CMS page inventory.
 *
 * Page identities and placed-section counts are sourced from the normalized
 * account-scoped data family. Legacy numeric IDs are returned only as
 * compatibility pointers for the still-live storefront/Theme Studio renderer.
 * This module deliberately does not read the legacy pages/page_sections tables.
 */
export async function listCanonicalPageRows(db, accountId) {
  if (!accountId) throw new Error("cms_page_inventory_account_required");
  const { results = [] } = await db.prepare(`
    SELECT p.id, p.legacy_page_id, p.slug, p.title, p.status, p.updated_at,
      (SELECT COUNT(*) FROM cms_page_sections s
         WHERE s.account_id = p.account_id AND s.page_id = p.id
           AND s.status NOT IN ('archived', 'removed')) AS section_count,
      (SELECT s.inline_content_json FROM cms_page_sections s
         WHERE s.account_id = p.account_id AND s.page_id = p.id
           AND s.status NOT IN ('archived', 'removed')
         ORDER BY s.sort_order ASC, s.id ASC LIMIT 1) AS preview_json
    FROM cms_pages p
    WHERE p.account_id = ?
    ORDER BY p.title ASC
  `).bind(accountId).all();
  return results;
}
