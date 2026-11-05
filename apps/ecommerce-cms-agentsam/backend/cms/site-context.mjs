import { DEFAULT_SITE_STORE_SETTINGS } from "./site-settings-contract.mjs";

/**
 * Resolve a CMS site without exposing or duplicating AgentSam provider registries.
 * Account ownership is enforced at the CMS boundary; site IDs are never trusted alone.
 */
export async function ensureDefaultCmsSite(db, accountId, { name = "Default site" } = {}) {
  if (!accountId) throw new Error("cms_site_account_required");
  // Only a genuinely empty merchant account gets a starter site. An
  // existing merchant's sites are never replaced by a platform/default brand.
  const { results: existingSites = [] } = await db.prepare(`
    SELECT id, is_default FROM cms_sites WHERE account_id = ?
    ORDER BY created_at ASC LIMIT 2
  `).bind(accountId).all();
  if (existingSites.length > 1) {
    const selected = await db.prepare(`
      SELECT id, account_id, name, slug, primary_domain, status, is_default
      FROM cms_sites WHERE account_id = ? AND is_default = 1 LIMIT 1
    `).bind(accountId).first();
    if (!selected) throw new Error("cms_site_selection_required");
    return selected;
  }
  if (existingSites.length === 1) {
    await db.prepare("UPDATE cms_sites SET is_default = 1 WHERE account_id = ? AND id = ? AND is_default = 0")
      .bind(accountId, existingSites[0].id).run();
  } else {
    await db.prepare(`
      INSERT OR IGNORE INTO cms_sites (account_id, name, slug, status, is_default, settings_json)
      VALUES (?, ?, 'default', 'draft', 1, ?)
    `).bind(accountId, name, JSON.stringify({ store: { ...DEFAULT_SITE_STORE_SETTINGS } })).run();
  }
  const site = await db.prepare(`
    SELECT id, account_id, name, slug, primary_domain, status, is_default
    FROM cms_sites WHERE account_id = ? AND is_default = 1 LIMIT 1
  `).bind(accountId).first();
  if (!site) throw new Error("cms_default_site_create_failed");
  return site;
}

export async function listCmsSites(db, accountId) {
  if (!accountId) throw new Error("cms_site_account_required");
  // This GET is an inventory, not a setup transaction. In particular, an
  // account containing only one unlisted private marketplace draft must not
  // have that draft promoted to the default site merely by opening the editor.
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
  const inputSettings = input.settings && typeof input.settings === "object" && !Array.isArray(input.settings)
    ? input.settings : {};
  const storeSettings = inputSettings.store && typeof inputSettings.store === "object" && !Array.isArray(inputSettings.store)
    ? inputSettings.store : {};
  const settings = { ...inputSettings, store: { ...DEFAULT_SITE_STORE_SETTINGS, ...storeSettings } };
  await db.prepare(`
    INSERT INTO cms_sites (id, account_id, name, slug, primary_domain, domain_aliases_json, settings_json, status, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).bind(id, accountId, name, slug, primaryDomain, JSON.stringify(aliases),
    JSON.stringify(settings),
    existing ? 0 : 1).run();
  return db.prepare(`
    SELECT id, account_id, name, slug, primary_domain, domain_aliases_json, status, is_default, created_at, updated_at
    FROM cms_sites WHERE id = ? AND account_id = ?
  `).bind(id, accountId).first();
}

/**
 * A marketplace Try action owns its own private draft site. Never make the
 * customer select (or inadvertently edit) an existing domain or app site.
 * Repeated Try for the same exact release resumes the existing draft.
 *
 * This uses the canonical cms_sites table, not a theme-specific site registry.
 */
export async function ensureThemePreviewDraftSite(db, accountId, { slug, version, name }) {
  if (!accountId) throw new Error('cms_site_account_required');
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(slug || '') ||
      !/^\d+\.\d+\.\d+$/.test(version || '')) {
    throw new Error('cms_theme_draft_identity_invalid');
  }
  const siteSlug = 'theme-draft-' + slug + '-' + version.replaceAll('.', '-');
  const settings = {
    kind: 'marketplace-theme-draft',
    source_theme_slug: slug,
    source_release_version: version,
    store: { ...DEFAULT_SITE_STORE_SETTINGS },
  };
  const draftName = (String(name || slug).trim().slice(0, 105) + ' — Draft').slice(0, 120);
  const id = 'cmssite_' + crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  await db.prepare(`
    INSERT INTO cms_sites (id,account_id,name,slug,status,is_default,settings_json)
    VALUES (?,?,?,?,'draft',0,?)
    ON CONFLICT(account_id,slug) DO NOTHING
  `).bind(id,accountId,draftName,siteSlug,JSON.stringify(settings)).run();
  const site = await db.prepare(`
    SELECT id,account_id,name,slug,status,is_default,primary_domain,settings_json
    FROM cms_sites WHERE account_id=? AND slug=? LIMIT 1
  `).bind(accountId,siteSlug).first();
  const props = site ? JSON.parse(site.settings_json || '{}') : {};
  if (!site || site.status !== 'draft' || site.primary_domain ||
      props.kind !== settings.kind || props.source_theme_slug !== slug ||
      props.source_release_version !== version) {
    throw new Error('cms_theme_draft_site_conflict');
  }
  return site;
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
