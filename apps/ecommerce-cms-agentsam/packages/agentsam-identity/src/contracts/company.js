/** Default single-tenant company row for identity scaffolds. */
export const DEFAULT_COMPANY_ID = 'co_default';
export const DEFAULT_COMPANY_SLUG = 'default';

export function normalizeCompanyRow(row) {
  if (!row) return null;
  let meta = {};
  if (row.meta_json) {
    try {
      meta = JSON.parse(String(row.meta_json));
    } catch {
      meta = {};
    }
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    legalName: row.legal_name || null,
    logoUrl: row.logo_url || null,
    faviconUrl: row.favicon_url || null,
    primaryColor: row.primary_color || null,
    authBgColor: row.auth_bg_color || null,
    supportEmail: row.support_email || null,
    websiteUrl: row.website_url || null,
    tagline: row.tagline || null,
    meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
