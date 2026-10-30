/**
 * Account-scoped CMS theme registry for the reusable AgentSam Theme Studio.
 * Shared catalog rows are read-only. Customization creates or updates a
 * private account-owned row. Ownership comes only from the validated session.
 */
const answer = (payload, status = 200) => Response.json(payload, {
  status,
  headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
});

const DEFAULT_CSS_VARS = {
  '--bg-canvas': '#0f172a', '--bg-surface': '#1e293b', '--bg-panel': '#273449',
  '--bg-nav': '#111827', '--bg-shell': '#0b1220', '--color-primary': '#3b82f6',
  '--accent': '#60a5fa', '--text-main': '#e2e8f0', '--text-muted': '#94a3b8',
  '--border': '#334155',
};

function objectJson(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch { return fallback; }
}
function arrayJson(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return fallback;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : fallback; }
  catch { return fallback; }
}
function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 100);
  return name.length ? name : null;
}
function cleanFamily(value, fallback = 'custom') {
  if (typeof value !== 'string') return fallback;
  return value.trim().replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 60) || fallback;
}
function sanitizeCssVars(value, fallback = DEFAULT_CSS_VARS) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...fallback };
  const entries = Object.entries(value);
  if (entries.length > 160) throw new Error('theme_token_limit_exceeded');
  const output = {};
  for (const [key, raw] of entries) {
    if (!/^--[a-zA-Z0-9_-]{1,78}$/.test(key)) throw new Error('theme_token_name_invalid');
    if (typeof raw !== 'string' || raw.length > 120) throw new Error('theme_token_value_invalid');
    const token = raw.trim();
    if (!token || /[;{}<>\u0000-\u001f]/.test(token) || /(?:url\s*\(|expression\s*\(|javascript:|@import)/i.test(token)) {
      throw new Error('theme_token_value_invalid');
    }
    output[key] = token;
  }
  return output;
}
function getCssVars(row) {
  const saved = objectJson(row?.css_vars_json, {});
  if (Object.keys(saved).length) return saved;
  const config = objectJson(row?.config, {});
  if (config.cssVars && typeof config.cssVars === 'object' && !Array.isArray(config.cssVars)) return config.cssVars;
  const inline = Object.fromEntries(Object.entries(config).filter(([key, value]) => key.startsWith('--') && typeof value === 'string'));
  return Object.keys(inline).length ? inline : {};
}
function themeSwatches(cssVars) {
  return ['--bg-canvas', '--bg-surface', '--bg-panel', '--bg-nav', '--color-primary', '--accent', '--text-main']
    .map(key => cssVars[key]).filter(value => typeof value === 'string' && value.length <= 120).slice(0, 7);
}
function publicTheme(row, accountId, activeThemeId = null) {
  const owned = Boolean(accountId && row.account_id === accountId);
  const cssVars = getCssVars(row);
  const archived = row.status === 'archived';
  return {
    id: String(row.id), name: String(row.name || 'Untitled theme'),
    packageName: owned ? 'Your saved theme' : 'Shared theme library',
    category: String(row.theme_family || 'custom'),
    version: row.status === 'draft' ? 'Draft' : 'Theme preset',
    source: owned ? 'account-custom' : 'catalog',
    status: String(row.status || 'active'), slug: String(row.slug || ''),
    themeFamily: String(row.theme_family || 'custom'), cssVars,
    swatches: themeSwatches(cssVars), previewImageUrl: row.preview_image_url || null,
    visibility: String(row.visibility || (owned ? 'private' : 'public')),
    accountOwned: owned, aliasOfThemeId: row.alias_of_theme_id || null,
    capabilities: { preview: true, editable: owned && !archived, duplicable: !archived, publishable: false },
    active: String(row.id) === String(activeThemeId || ''),
  };
}
function requestOriginAllowed(request, url) {
  const origin = request.headers.get('origin');
  if (origin) return origin === url.origin;
  return Boolean(request.headers.get('authorization'));
}
async function readJsonObject(request) {
  const raw = await request.text();
  if (raw.length > 128_000) throw new Error('theme_payload_too_large');
  let body;
  try { body = JSON.parse(raw); } catch { throw new Error('invalid_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_json_object');
  return body;
}
async function accountExists(db, accountId) {
  const row = await db.prepare('SELECT id FROM accounts WHERE id = ? LIMIT 1').bind(accountId).first();
  return Boolean(row?.id);
}
async function readAccessibleTheme(db, accountId, id) {
  return db.prepare(
    `SELECT * FROM cms_themes
     WHERE id = ? AND (
       (account_id IS NULL AND workspace_id IS NULL AND visibility = 'public' AND status = 'active')
       OR account_id = ?
     ) LIMIT 1`,
  ).bind(id, accountId).first();
}
async function activeThemeId(db, accountId) {
  const row = await db.prepare(
    `SELECT theme_id FROM cms_theme_preferences
     WHERE account_id = ? AND scope = 'account' AND is_active = 1
     ORDER BY updated_at DESC, id DESC LIMIT 1`,
  ).bind(accountId).first();
  return row?.theme_id || null;
}
function safeSlug(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'theme';
}
async function listThemes(db, accountId) {
  const rows = await db.prepare(
    `SELECT * FROM cms_themes
     WHERE (account_id IS NULL AND workspace_id IS NULL AND visibility = 'public' AND status = 'active')
        OR account_id = ?
     ORDER BY CASE WHEN account_id IS NULL THEN 0 ELSE 1 END, sort_order ASC, lower(name) ASC
     LIMIT 500`,
  ).bind(accountId).all();
  const activeId = await activeThemeId(db, accountId).catch(() => null);
  return { themes: (rows.results || []).map(row => publicTheme(row, accountId, activeId)), activeThemeId: activeId, accountId };
}
async function createTheme(db, accountId, body) {
  const allowed = new Set(['name', 'source_theme_id', 'theme_family', 'css_vars']);
  if (Object.keys(body).some(key => !allowed.has(key))) throw new Error('theme_fields_not_allowed');
  const name = cleanName(body.name);
  if (!name) throw new Error('theme_name_required');
  const sourceId = typeof body.source_theme_id === 'string' ? body.source_theme_id.trim() : '';
  const source = sourceId ? await readAccessibleTheme(db, accountId, sourceId) : null;
  if (sourceId && (!source || source.status === 'archived')) throw new Error('theme_source_not_found');
  const sourceVars = source ? getCssVars(source) : DEFAULT_CSS_VARS;
  const cssVars = body.css_vars === undefined ? sanitizeCssVars(sourceVars, DEFAULT_CSS_VARS) : sanitizeCssVars(body.css_vars, sourceVars);
  const family = cleanFamily(body.theme_family, source?.theme_family || 'custom');
  const config = objectJson(source?.config, {});
  config.cssVars = cssVars;
  config.themeFamily = family;
  const id = 'theme-' + crypto.randomUUID();
  const slug = 'custom-' + safeSlug(name) + '-' + crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const now = new Date().toISOString();
  const nowUnix = Math.floor(Date.now() / 1000);
  const copyJson = (field, fallback = {}) => JSON.stringify(source ? objectJson(source[field], fallback) : fallback);
  const tags = source ? arrayJson(source.tags_json, []) : ['custom'];
  const tokens = source ? objectJson(source.tokens_json, cssVars) : cssVars;
  await db.prepare(
    `INSERT INTO cms_themes (
      id,name,slug,config,theme_family,sort_order,workspace_id,monaco_theme,monaco_bg,
      tokens_json,css_vars_json,brand_json,layout_json,typography_json,components_json,motion_json,
      status,visibility,updated_at,created_at_unix,tags_json,account_id,alias_of_theme_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, name, slug, JSON.stringify(config), family, 100, null,
    source?.monaco_theme || 'vs-dark', source?.monaco_bg || '#1e293b',
    JSON.stringify(tokens), JSON.stringify(cssVars), copyJson('brand_json'), copyJson('layout_json'),
    copyJson('typography_json'), copyJson('components_json'), copyJson('motion_json'),
    'active', 'private', now, nowUnix, JSON.stringify(tags), accountId, sourceId || null,
  ).run();
  return publicTheme(await db.prepare('SELECT * FROM cms_themes WHERE id = ?').bind(id).first(), accountId, null);
}
async function updateTheme(db, accountId, id, body) {
  const allowed = new Set(['name', 'theme_family', 'css_vars']);
  if (Object.keys(body).some(key => !allowed.has(key))) throw new Error('theme_fields_not_allowed');
  const current = await db.prepare(
    `SELECT * FROM cms_themes WHERE id = ? AND account_id = ? AND visibility = 'private' AND status != 'archived' LIMIT 1`,
  ).bind(id, accountId).first();
  if (!current) return null;
  if (!Object.keys(body).length) throw new Error('theme_update_empty');
  const name = body.name === undefined ? current.name : cleanName(body.name);
  if (!name) throw new Error('theme_name_required');
  const family = cleanFamily(body.theme_family, current.theme_family || 'custom');
  const cssVars = body.css_vars === undefined ? getCssVars(current) : sanitizeCssVars(body.css_vars, getCssVars(current));
  const config = objectJson(current.config, {});
  config.cssVars = cssVars;
  config.themeFamily = family;
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE cms_themes SET name = ?, theme_family = ?, config = ?, css_vars_json = ?,
       updated_at = ? WHERE id = ? AND account_id = ? AND visibility = 'private' AND status != 'archived'`,
  ).bind(name, family, JSON.stringify(config), JSON.stringify(cssVars), now, id, accountId).run();
  return publicTheme(await db.prepare('SELECT * FROM cms_themes WHERE id = ?').bind(id).first(), accountId, null);
}
async function applyTheme(db, accountId, id) {
  const row = await readAccessibleTheme(db, accountId, id);
  if (!row || row.status === 'archived') return null;
  const now = new Date().toISOString();
  const prefId = 'tp-account-' + crypto.randomUUID();
  await db.batch([
    db.prepare(
      `UPDATE cms_theme_preferences SET is_active = 0, updated_at = ?
       WHERE account_id = ? AND scope = 'account' AND is_active = 1`,
    ).bind(now, accountId),
    db.prepare(
      `INSERT INTO cms_theme_preferences
       (id,account_id,user_id,workspace_id,project_id,page_id,theme_id,theme_slug,scope,is_active,created_at,updated_at,site_id)
       VALUES (?, ?, NULL, NULL, NULL, NULL, ?, ?, 'account', 1, ?, ?, NULL)`,
    ).bind(prefId, accountId, row.id, row.slug, now, now),
  ]);
  return { theme: publicTheme(row, accountId, row.id), activeThemeId: row.id };
}
async function archiveTheme(db, accountId, id) {
  const row = await db.prepare(
    `SELECT * FROM cms_themes WHERE id = ? AND account_id = ? AND visibility = 'private' LIMIT 1`,
  ).bind(id, accountId).first();
  if (!row) return { error: 'theme_not_found', status: 404 };
  if (row.status === 'archived') return { theme: publicTheme(row, accountId, null) };
  const activePreference = await db.prepare(
    'SELECT id FROM cms_theme_preferences WHERE theme_id = ? AND is_active = 1 LIMIT 1',
  ).bind(id).first();
  if (activePreference) return { error: 'theme_in_use_select_another_theme_first', status: 409 };
  const sitesTable = await db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cms_sites' LIMIT 1`,
  ).first();
  if (sitesTable) {
    const siteRef = await db.prepare('SELECT id FROM cms_sites WHERE theme_id = ? LIMIT 1').bind(id).first();
    if (siteRef) return { error: 'theme_in_use_by_site', status: 409 };
  }
  await db.prepare(
    `UPDATE cms_themes SET status = 'archived', updated_at = ?
     WHERE id = ? AND account_id = ? AND visibility = 'private'`,
  ).bind(new Date().toISOString(), id, accountId).run();
  return { theme: publicTheme(await db.prepare('SELECT * FROM cms_themes WHERE id = ?').bind(id).first(), accountId, null) };
}
async function restoreTheme(db, accountId, id) {
  const row = await db.prepare(
    `SELECT * FROM cms_themes WHERE id = ? AND account_id = ? AND visibility = 'private' AND status = 'archived' LIMIT 1`,
  ).bind(id, accountId).first();
  if (!row) return null;
  await db.prepare(
    `UPDATE cms_themes SET status = 'active', updated_at = ?
     WHERE id = ? AND account_id = ? AND visibility = 'private' AND status = 'archived'`,
  ).bind(new Date().toISOString(), id, accountId).run();
  return publicTheme(await db.prepare('SELECT * FROM cms_themes WHERE id = ?').bind(id).first(), accountId, null);
}

export async function handleStudioThemes(request, env, accountId) {
  if (!accountId) return answer({ ok: false, error: 'unauthorized' }, 401);
  if (!env?.DB) return answer({ ok: false, error: 'theme_database_unavailable' }, 503);
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/studio\/themes(?:\/([^/]+)(?:\/(apply|restore))?)?\/?$/);
  if (!match) return answer({ ok: false, error: 'not_found' }, 404);
  const rawId = match[1] || '';
  let id = '';
  try { id = rawId ? decodeURIComponent(rawId) : ''; }
  catch { return answer({ ok: false, error: 'theme_id_invalid' }, 400); }
  const action = match[2] || '';
  const method = request.method.toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return answer({ ok: false, error: 'method_not_allowed' }, 405);
  if (method !== 'GET' && !requestOriginAllowed(request, url)) return answer({ ok: false, error: 'origin_not_allowed' }, 403);
  try {
    if (method !== 'GET' && !(await accountExists(env.DB, accountId))) return answer({ ok: false, error: 'account_not_found' }, 403);
    if (method === 'GET' && !id) return answer({ ok: true, ...(await listThemes(env.DB, accountId)) });
    if (method === 'GET' && id && !action) {
      const row = await readAccessibleTheme(env.DB, accountId, id);
      if (!row) return answer({ ok: false, error: 'theme_not_found' }, 404);
      const activeId = await activeThemeId(env.DB, accountId).catch(() => null);
      return answer({ ok: true, theme: publicTheme(row, accountId, activeId) });
    }
    if (method === 'POST' && !id) {
      const theme = await createTheme(env.DB, accountId, await readJsonObject(request));
      return answer({ ok: true, theme }, 201);
    }
    if ((method === 'PUT' || method === 'PATCH') && id && !action) {
      const theme = await updateTheme(env.DB, accountId, id, await readJsonObject(request));
      if (!theme) return answer({ ok: false, error: 'theme_not_found_or_not_owned' }, 404);
      return answer({ ok: true, theme });
    }
    if (method === 'DELETE' && id && !action) {
      const result = await archiveTheme(env.DB, accountId, id);
      if (result.error) return answer({ ok: false, error: result.error }, result.status);
      return answer({ ok: true, theme: result.theme });
    }
    if (method === 'POST' && id && action === 'apply') {
      const result = await applyTheme(env.DB, accountId, id);
      if (!result) return answer({ ok: false, error: 'theme_not_found_or_not_available' }, 404);
      return answer({ ok: true, ...result });
    }
    if (method === 'POST' && id && action === 'restore') {
      const theme = await restoreTheme(env.DB, accountId, id);
      if (!theme) return answer({ ok: false, error: 'archived_theme_not_found_or_not_owned' }, 404);
      return answer({ ok: true, theme });
    }
    return answer({ ok: false, error: 'method_not_allowed' }, 405);
  } catch (error) {
    const code = String(error?.message || '');
    const clientErrors = new Set([
      'invalid_json', 'invalid_json_object', 'theme_payload_too_large', 'theme_fields_not_allowed',
      'theme_name_required', 'theme_token_limit_exceeded', 'theme_token_name_invalid',
      'theme_token_value_invalid', 'theme_source_not_found', 'theme_update_empty',
    ]);
    if (clientErrors.has(code)) return answer({ ok: false, error: code }, 400);
    console.error('studio_theme_registry_error', code || 'unknown_error');
    return answer({ ok: false, error: 'theme_store_unavailable' }, 503);
  }
}
