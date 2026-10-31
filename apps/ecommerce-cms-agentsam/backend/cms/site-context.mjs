/**
 * Resolve a CMS site without exposing or duplicating AgentSam provider registries.
 * Account ownership is enforced at the CMS boundary; site IDs are never trusted alone.
 */
export async function ensureDefaultCmsSite(db, accountId, { name = "Default site" } = {}) {
  if (!accountId) throw new Error("cms_site_account_required");
  await db.prepare(`
    INSERT OR IGNORE INTO cms_sites (account_id, name, slug, status, is_default)
    VALUES (?, ?, 'default', 'active', 1)
  `).bind(accountId, name).run();
  const site = await db.prepare(`
    SELECT id, account_id, name, slug, primary_domain, status, is_default
    FROM cms_sites WHERE account_id = ? AND is_default = 1 LIMIT 1
  `).bind(accountId).first();
  if (!site) throw new Error("cms_default_site_create_failed");
  return site;
}

export async function listCmsSites(db, accountId) {
  if (!accountId) throw new Error("cms_site_account_required");
  await ensureDefaultCmsSite(db, accountId);
  const { results = [] } = await db.prepare(`
    SELECT id, account_id, name, slug, primary_domain, domain_aliases_json, status, is_default, created_at, updated_at
    FROM cms_sites WHERE account_id = ?
    ORDER BY is_default DESC, created_at ASC, name ASC
  `).bind(accountId).all();
  return results;
}

export async function createCmsSite(db, accountId, input = {}) {
  if (!accountId) throw new Error("cms_site_account_required");
  const name = String(input.name || "").trim();
  const slug = String(input.slug || "").trim().toLowerCase();
  if (!name || name.length > 120) throw new Error("cms_site_name_invalid");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80)
    throw new Error("cms_site_slug_invalid");
  const primaryDomain = input.primary_domain == null || input.primary_domain === ""
    ? null : String(input.primary_domain).trim().toLowerCase();
  const aliases = Array.isArray(input.domain_aliases)
    ? [...new Set(input.domain_aliases.map(value => String(value).trim().toLowerCase()).filter(Boolean))]
    : [];
  const validDomain = value => value.length <= 253 &&
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
  if (primaryDomain && !validDomain(primaryDomain)) throw new Error("cms_site_domain_invalid");
  if (aliases.some(value => !validDomain(value))) throw new Error("cms_site_domain_alias_invalid");
  const existing = await db.prepare("SELECT id FROM cms_sites WHERE account_id = ? LIMIT 1").bind(accountId).first();
  const id = String(input.id || `cmssite_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error("cms_site_id_invalid");
  await db.prepare(`
    INSERT INTO cms_sites (id, account_id, name, slug, primary_domain, domain_aliases_json, settings_json, status, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).bind(id, accountId, name, slug, primaryDomain, JSON.stringify(aliases),
    JSON.stringify(input.settings && typeof input.settings === "object" && !Array.isArray(input.settings) ? input.settings : {}),
    existing ? 0 : 1).run();
  return db.prepare(`
    SELECT id, account_id, name, slug, primary_domain, domain_aliases_json, status, is_default, created_at, updated_at
    FROM cms_sites WHERE id = ? AND account_id = ?
  `).bind(id, accountId).first();
}

export async function resolveCmsSite(db, { accountId = null, siteId = null, hostname = null, createDefault = false } = {}) {
  if (siteId) {
    const row = await db.prepare(`
      SELECT id, account_id, name, slug, primary_domain, status, is_default
      FROM cms_sites WHERE id = ? AND (? IS NULL OR account_id = ?) LIMIT 1
    `).bind(siteId, accountId, accountId).first();
    if (!row) throw new Error("cms_site_not_found");
    return row;
  }

  if (hostname) {
    const host = String(hostname).trim().toLowerCase();
    const row = await db.prepare(`
      SELECT id, account_id, name, slug, primary_domain, status, is_default
      FROM cms_sites s
      WHERE (lower(s.primary_domain) = ?
         OR EXISTS (
           SELECT 1 FROM json_each(s.domain_aliases_json) alias
           WHERE lower(trim(CAST(alias.value AS TEXT))) = ?
         ))
        AND (? IS NULL OR s.account_id = ?)
      ORDER BY s.is_default DESC, s.created_at ASC
      LIMIT 1
    `).bind(host, host, accountId, accountId).first();
    if (row && (!accountId || row.account_id === accountId)) return row;
  }

  if (!accountId) throw new Error("cms_site_context_required");
  let row = await db.prepare(`
    SELECT id, account_id, name, slug, primary_domain, status, is_default
    FROM cms_sites WHERE account_id = ? AND is_default = 1 LIMIT 1
  `).bind(accountId).first();
  if (row) return row;
  if (createDefault) return ensureDefaultCmsSite(db, accountId);

  const { results = [] } = await db.prepare(`
    SELECT id, account_id, name, slug, primary_domain, status, is_default
    FROM cms_sites WHERE account_id = ? AND status = 'active'
    ORDER BY created_at ASC LIMIT 2
  `).bind(accountId).all();
  if (results.length === 1) return results[0];
  if (results.length > 1) throw new Error("cms_site_required");
  throw new Error("cms_site_not_found");
}
