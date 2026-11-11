/**
 * Account-owned, runtime-editable presentation of the installed app navigation.
 * The packaged host projection is an allowed starting catalog, not a persisted
 * per-customer menu. Edits change labels, icons, ordering and links without
 * rebuilding assets; they cannot install apps or grant route permissions.
 */
const ICONS = Object.freeze([
  'home', 'projects', 'content', 'analytics', 'tickets', 'store', 'products',
  'orders', 'customers', 'apps', 'settings', 'messageSquare', 'box', 'film',
  'layers', 'globe', 'growth', 'database', 'library', 'mail', 'help',
]);
const ICON_SET = new Set(ICONS);
const GROUPS = ['primary', 'channels', 'apps', 'utilities'];
const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
});
const clientError = (message) => Object.assign(new Error(message), { status: 400 });

export function listNavigationEntries(base) {
  const items = [];
  const walk = (rows, section, path = '', depth = 0) => {
    for (const node of Array.isArray(rows) ? rows : []) {
      if (!node || typeof node.id !== 'string') continue;
      const key = section + '/' + path + node.id;
      items.push({
        key, section, depth, id: node.id,
        label: node.label || node.name || node.id,
        href: node.href || '',
        icon: node.icon || '',
      });
      walk(node.children, section, path + node.id + '/', depth + 1);
    }
  };
  for (const section of GROUPS) walk(base?.[section], section);
  return items;
}

export function normalizeNavigationOverrides(value, base) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw clientError('navigation_overrides_invalid');
  if (Object.keys(value).length > 160) throw clientError('navigation_override_limit_exceeded');
  const allowed = new Set(listNavigationEntries(base).map(entry => entry.key));
  const result = {};
  for (const [key, row] of Object.entries(value)) {
    if (!allowed.has(key)) throw clientError('navigation_destination_not_installed');
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw clientError('navigation_override_invalid');
    if (Object.keys(row).some(name => !['label', 'icon', 'href', 'hidden', 'order'].includes(name))) throw clientError('navigation_field_unknown');
    const out = {};
    if ('label' in row) {
      const label = String(row.label || '').trim();
      if (!label || label.length > 80 || /[<>\u0000-\u001f]/.test(label)) throw clientError('navigation_label_invalid');
      out.label = label;
    }
    if ('icon' in row) {
      if (!ICON_SET.has(row.icon)) throw clientError('navigation_icon_invalid');
      out.icon = row.icon;
    }
    if ('href' in row) {
      const href = row.href;
      if (typeof href !== 'string' || href.length > 240 || !/^\/(?!\/)[\w/%?&=.,#:+~-]*$/.test(href) || /[\\\u0000-\u001f]/.test(href)) {
        throw clientError('navigation_href_invalid');
      }
      out.href = href;
    }
    if ('hidden' in row) {
      if (typeof row.hidden !== 'boolean') throw clientError('navigation_hidden_invalid');
      out.hidden = row.hidden;
    }
    if ('order' in row) {
      if (!Number.isInteger(row.order) || row.order < 0 || row.order > 1000) throw clientError('navigation_order_invalid');
      out.order = row.order;
    }
    if (Object.keys(out).length) result[key] = out;
  }
  return result;
}

export function applyNavigationOverrides(base, overrides) {
  const mapGroup = (nodes, section, path = '') => {
    if (!Array.isArray(nodes)) return [];
    return nodes.map((item, index) => {
      const key = section + '/' + path + item.id;
      const override = overrides[key] || {};
      if (override.hidden) return null;
      return {
        ...item, ...Object.fromEntries(Object.entries(override).filter(([name]) => ['label','icon','href'].includes(name))),
        children: item.children ? mapGroup(item.children, section, path + item.id + '/') : item.children,
        __order: override.order ?? index,
        __index: index,
      };
    }).filter(Boolean).sort((a,b) => a.__order-b.__order || a.__index-b.__index)
      .map(({__order,__index,...item}) => item);
  };
  return {
    ...base,
    ...Object.fromEntries(GROUPS.map(section => [section, mapGroup(base[section], section)])),
    source: 'account-navigation-overrides',
  };
}

async function loadBase(request, env) {
  if (typeof env?.ASSETS?.fetch !== 'function') throw new Error('navigation_assets_unavailable');
  const url = new URL('/admin/data/navigation.json', request.url);
  const response = await env.ASSETS.fetch(new Request(url));
  if (!response.ok || !(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    throw new Error('navigation_catalog_unavailable');
  }
  const data = await response.json();
  if (data.schema !== 'agentsam.host-navigation.v1' || !Array.isArray(data.apps)) throw new Error('navigation_catalog_invalid');
  return data;
}
async function loadRow(env, accountId) {
  return env.DB.prepare('SELECT overrides_json, updated_at_ms FROM agentsam_platform_navigation_overrides WHERE account_id = ?')
    .bind(accountId).first();
}
function originAllowed(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin || Boolean(request.headers.get('authorization'));
}
export async function handleStudioNavigation(request, env, accountId) {
  if (!accountId) return json({ok:false,error:'unauthorized'},401);
  if (!env?.DB) return json({ok:false,error:'navigation_database_unavailable'},503);
  if (!['GET','PATCH'].includes(request.method)) return json({ok:false,error:'method_not_allowed'},405);
  if (request.method === 'PATCH' && !originAllowed(request)) return json({ok:false,error:'origin_not_allowed'},403);
  try {
    const defaults = await loadBase(request, env);
    let row = await loadRow(env, accountId);
    if (request.method === 'PATCH') {
      const raw = await request.text();
      if (raw.length > 64_000) throw clientError('navigation_payload_too_large');
      let body;
      try { body = JSON.parse(raw); } catch { throw clientError('invalid_json'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw clientError('invalid_json');
      const expected = body.expectedRevision;
      if (!Number.isSafeInteger(expected) || expected < 0) throw clientError('navigation_revision_required');
      if ((row?.updated_at_ms || 0) !== expected) return json({ok:false,error:'navigation_stale_revision'},409);
      const overrides = normalizeNavigationOverrides(body.overrides, defaults);
      const now = Math.max(Date.now(), expected + 1);
      const written = await env.DB.prepare(
        `INSERT INTO agentsam_platform_navigation_overrides(account_id,overrides_json,updated_at_ms) VALUES(?,?,?)
         ON CONFLICT(account_id) DO UPDATE SET overrides_json=excluded.overrides_json, updated_at_ms=excluded.updated_at_ms
         WHERE agentsam_platform_navigation_overrides.updated_at_ms = ?`
      ).bind(accountId, JSON.stringify(overrides), now, expected).run();
      if (!written.meta?.changes) return json({ok:false,error:'navigation_stale_revision'},409);
      row = { overrides_json: JSON.stringify(overrides), updated_at_ms: now };
    }
    let saved = {};
    try { saved = JSON.parse(row?.overrides_json || '{}'); } catch { throw new Error('navigation_configuration_invalid'); }
    const overrides = normalizeNavigationOverrides(saved, defaults);
    return json({
      ok:true, ...applyNavigationOverrides(defaults,overrides),
      defaults, overrides, revision:row?.updated_at_ms || 0,
      entries:listNavigationEntries(defaults), iconChoices:ICONS,
    });
  } catch (error) {
    const status = error?.status || 503;
    if (status === 400) return json({ok:false,error:error.message},400);
    console.error('platform_navigation_error', String(error?.message || error).slice(0,160));
    return json({ok:false,error:'navigation_store_unavailable'},503);
  }
}
