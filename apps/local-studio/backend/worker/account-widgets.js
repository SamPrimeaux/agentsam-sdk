/**
 * Local Studio's host adapter for packaged Workbench widgets.
 *
 * Widget code comes exclusively from the compiled Workbench registry.
 * D1 is the account-scoped catalog projection and installation/layout/preferences
 * authority, not an executable-code registry or runtime data source.
 */
import { BUILTIN_WIDGET_DEFINITIONS, WIDGET_GALLERY_DEFINITIONS } from '../../../../packages/agentsam-workbench/src/widgets/registry.ts';

import { validReleaseWidgetConfiguration } from '../../../../packages/agentsam-workbench/src/widgets/release-snapshots.ts';
import { SUPPORTED_WIDGET_DATA_ADAPTERS } from './widget-data-adapters.js';

const BUILTIN = new Map(BUILTIN_WIDGET_DEFINITIONS.map(def => [def.id, def]));
// The store-chat embed is a separate storefront surface, not a New Tab widget.
// This is the compiled Workbench surface allowlist; D1 never loads code by itself.
const STAGE_WIDGET_KEYS = new Set(WIDGET_GALLERY_DEFINITIONS.map(def => def.id));
const SURFACES = new Set(['agentsam_stage', 'widgets_home', 'home', 'dock']);
const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,100}$/i;
const MAX_BODY = 4096;

const respond = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
});
function fail(code, status = 400) { return respond({ ok: false, error: code }, status); }
function safeSurface(value) {
  if (typeof value !== 'string' || !SURFACES.has(value)) throw Error('widget_surface_invalid');
  return value;
}
function safeKey(value) {
  if (typeof value !== 'string' || !KEY_RE.test(value)) throw Error('widget_key_invalid');
  return value;
}
function parseJson(value, fallback) {
  try { return JSON.parse(value ?? '') ?? fallback; } catch { return fallback; }
}
function readyDefinition(row) {
  const compiled = BUILTIN.get(row?.widget_key);
  const catalogAdapter = String(row?.data_adapter_key || '').trim();
  const compiledAdapter = String(compiled?.data?.source || '').trim();
  const adapterReady = catalogAdapter === compiledAdapter &&
    (!catalogAdapter || SUPPORTED_WIDGET_DATA_ADAPTERS.has(catalogAdapter));
  return row?.is_enabled === 1 &&
    compiled?.availability === 'ready' &&
    compiled.componentKey === row.component_key &&
    adapterReady &&
    (Array.isArray(compiled.sizes) && compiled.sizes.length) ? compiled : null;
}
function validatedConfiguration(key, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('widget_configuration_invalid');
  const keys = Object.keys(value);
  if (key === 'countdown') {
    if (keys.some(k => k !== 'durationMs') || keys.length !== 1 ||
        !Number.isInteger(value.durationMs) ||
        value.durationMs < 60_000 || value.durationMs > 86_400_000) throw Error('widget_configuration_invalid');
    return { durationMs: value.durationMs };
  }
  if (key === 'clock') {
    if (keys.some(k => k !== 'timeZone') || keys.length !== 1 ||
        typeof value.timeZone !== 'string' || value.timeZone.length > 100) throw Error('widget_configuration_invalid');
    try { new Intl.DateTimeFormat('en', {timeZone:value.timeZone}); }
    catch { throw Error('widget_configuration_invalid'); }
    return {timeZone:value.timeZone};
  }
  if (key === 'media') {
    if(keys.some(k=>!['mode','url','title'].includes(k))||!['photo','video','ambient','audio'].includes(value.mode)||typeof value.title!=='string'||value.title.length>240||typeof value.url!=='string'||value.url.length>1600||/[\x00-\x20\\"'<>]/.test(value.url))throw Error('widget_configuration_invalid');
    let valid=/^\/(?!\/)(?:media|api\/media|assets|brand)\//.test(value.url)&&!value.url.includes('..');
    if(!valid){try{const u=new URL(value.url);valid=u.protocol==='https:'&&!u.username&&!u.password;}catch{}}
    if(!valid)throw Error('widget_configuration_invalid');
    return {mode:value.mode,url:value.url,title:value.title};
  }
  if (key === 'artifact-preview') {
    if (keys.length !== 1 || !['cover','preview','list'].includes(value.previewMode)) throw Error('widget_configuration_invalid');
    return {previewMode:value.previewMode};
  }
  if (key === 'pull-request-summary' || key === 'release-readiness') {
    if (!validReleaseWidgetConfiguration(key,value)) throw Error('widget_configuration_invalid');
    const normalized = {};
    if (typeof value.repository === 'string' && value.repository.trim()) normalized.repository = value.repository.trim();
    if (key === 'pull-request-summary' && value.pullNumber !== undefined && value.pullNumber !== null && value.pullNumber !== '')
      normalized.pullNumber = Number(value.pullNumber);
    if (key === 'release-readiness' && typeof value.ref === 'string' && value.ref.trim()) normalized.ref = value.ref.trim();
    if (typeof value.githubAccount === 'string' && value.githubAccount.trim()) normalized.githubAccount = value.githubAccount.trim();
    return normalized;
  }
  if (keys.length) throw Error('widget_configuration_invalid');
  return {};
}
function parseSafeBody(body, method) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('widget_request_invalid');
  const permitted = method === 'PATCH'
    ? ['key', 'surface', 'pinned', 'hidden', 'sizeClass', 'orderIndex', 'configuration']
    : ['key', 'surface'];
  if (Object.keys(body).some(key => !permitted.includes(key))) throw Error('widget_request_invalid');
  safeKey(body.key);
  safeSurface(body.surface);
  if (method === 'PATCH') {
    const changes = Object.keys(body).filter(k => !['key', 'surface'].includes(k));
    if (!changes.length) throw Error('widget_request_invalid');
    for (const k of ['pinned', 'hidden']) {
      if (k in body && typeof body[k] !== 'boolean') throw Error('widget_request_invalid');
    }
    if ('orderIndex' in body &&
      (!Number.isInteger(body.orderIndex) || body.orderIndex < 0 || body.orderIndex > 1000))
      throw Error('widget_request_invalid');
  }
  return body;
}
async function catalogRow(db, key) {
  return db.prepare('SELECT widget_key, component_key, is_enabled, default_size, supported_sizes_json, data_adapter_key FROM agentsam_widget_catalog WHERE widget_key = ?')
    .bind(key).first();
}
async function installedRow(db, accountId, key, surface) {
  return db.prepare("SELECT i.id, i.widget_key, i.pinned, i.hidden FROM agentsam_widget_installations i WHERE i.account_id = ? AND i.widget_key = ? AND i.surface = ? AND i.instance_key = 'default'")
    .bind(accountId,key,surface).first();
}
export async function listAccountWidgets(db, accountId, surface = 'agentsam_stage') {
  if (!db?.prepare || !accountId) throw Error('widget_context_missing');
  safeSurface(surface);
  const { results } = await db.prepare(
    "SELECT c.widget_key, c.name, c.description, c.category, c.icon_key, c.package_name, c.component_key, c.default_size, " +
    "c.supported_sizes_json, c.data_adapter_key, c.action_adapter_key, c.is_enabled, " +
    "i.id AS installation_id, i.enabled AS installed_enabled, i.pinned, i.hidden, " +
    "l.size_class, l.order_index, l.is_docked, l.collapsed, p.preferences_json " +
    "FROM agentsam_widget_catalog c " +
    "LEFT JOIN agentsam_widget_installations i ON i.widget_key = c.widget_key AND i.account_id = ? AND i.surface = ? AND i.instance_key = 'default' " +
    "LEFT JOIN agentsam_widget_layouts l ON l.installation_id = i.id AND l.breakpoint = 'base' " +
    "LEFT JOIN agentsam_widget_preferences p ON p.installation_id = i.id " +
    "WHERE c.is_enabled = 1 ORDER BY c.category, c.name"
  ).bind(accountId,surface).all();
  return (results ?? []).filter(row => STAGE_WIDGET_KEYS.has(row.widget_key)).map(row => {
    const def = readyDefinition(row);
    return {
      key: row.widget_key, title: row.name, description: row.description ?? '',
      ownerPackage: row.package_name ?? null,
      category: row.category, icon: row.icon_key ?? null,
      componentKey: def?.componentKey ?? null,
      available: Boolean(def), availability: def ? 'ready' : 'concept',
      sizes: def ? [...def.sizes] : parseJson(row.supported_sizes_json, ['small']),
      installed: Boolean(row.installation_id), installationId: row.installation_id ?? null,
      pinned: Boolean(row.pinned), hidden: Boolean(row.hidden),
      sizeClass: row.size_class ?? row.default_size ?? 'small',
      orderIndex: row.order_index ?? 0,
      configuration: parseJson(row.preferences_json, {}),
    };
  });
}
export async function installAccountWidget(db, accountId, body) {
  if (!db?.prepare || !accountId) throw Error('widget_context_missing');
  const { key, surface } = parseSafeBody(body,'POST');
  const catalog = await catalogRow(db,key);
  if (!catalog || !STAGE_WIDGET_KEYS.has(key)) throw Error('widget_not_found');
  if (!readyDefinition(catalog)) throw Error('widget_not_ready');
  await db.prepare(
    "INSERT INTO agentsam_widget_installations(account_id, widget_key, surface, instance_key, enabled, hidden) " +
    "VALUES (?, ?, ?, 'default', 1, 0) ON CONFLICT(account_id, widget_key, surface, instance_key) " +
    "DO UPDATE SET enabled = 1, hidden = 0, updated_at = unixepoch()"
  ).bind(accountId,key,surface).run();
  const row = await installedRow(db,accountId,key,surface);
  if (!row) throw Error('widget_install_failed');
  const def = readyDefinition(catalog);
  const size = def.sizes.includes(catalog.default_size) ? catalog.default_size : def.sizes[0];
  const nextOrder = await db.prepare(
    "SELECT COALESCE(MAX(l.order_index), -1) + 1 AS n FROM agentsam_widget_layouts l " +
    "JOIN agentsam_widget_installations i ON i.id = l.installation_id " +
    "WHERE i.account_id = ? AND i.surface = ? AND l.breakpoint = 'base'"
  ).bind(accountId,surface).first();
  await db.prepare(
    "INSERT INTO agentsam_widget_layouts(installation_id, breakpoint, size_class, order_index) VALUES (?, 'base', ?, ?) " +
    "ON CONFLICT(installation_id, breakpoint) DO NOTHING"
  ).bind(row.id,size,Number(nextOrder?.n ?? 0)).run();
  return { key, surface, installed: true, installationId: row.id };
}
export async function changeAccountWidget(db, accountId, body) {
  if (!db?.prepare || !accountId) throw Error('widget_context_missing');
  const {key,surface} = parseSafeBody(body,'PATCH');
  const row = await installedRow(db,accountId,key,surface);
  if (!row) throw Error('widget_not_installed');
  const catalog = await catalogRow(db,key);
  const def = readyDefinition(catalog);
  if (!def) throw Error('widget_not_ready');
  if ('sizeClass' in body && !def.sizes.includes(body.sizeClass)) throw Error('widget_size_invalid');
  const updates = [];
  const binds = [];
  for (const [prop,col] of [['pinned','pinned'],['hidden','hidden']]) {
    if (prop in body) {updates.push(col + ' = ?');binds.push(body[prop]?1:0);}
  }
  if (updates.length) {
    await db.prepare(
      'UPDATE agentsam_widget_installations SET ' + updates.join(', ') +
      ', updated_at = unixepoch() WHERE id = ? AND account_id = ?'
    ).bind(...binds,row.id,accountId).run();
  }
  if ('sizeClass' in body || 'orderIndex' in body) {
    await db.prepare(
      "INSERT INTO agentsam_widget_layouts(installation_id, breakpoint, size_class, order_index) " +
      "VALUES (?, 'base', ?, ?) ON CONFLICT(installation_id, breakpoint) DO UPDATE SET " +
      "size_class = CASE WHEN ? THEN excluded.size_class ELSE agentsam_widget_layouts.size_class END, " +
      "order_index = CASE WHEN ? THEN excluded.order_index ELSE agentsam_widget_layouts.order_index END, " +
      "updated_at = unixepoch()"
    ).bind(row.id, body.sizeClass ?? def.sizes[0], body.orderIndex ?? 0,
      Number('sizeClass' in body), Number('orderIndex' in body)).run();
  }
  if ('configuration' in body) {
    const previous = await db.prepare('SELECT preferences_json FROM agentsam_widget_preferences WHERE installation_id=?')
      .bind(row.id).first();
    const merged = {...parseJson(previous?.preferences_json,{}),...body.configuration};
    const config = validatedConfiguration(key,merged);
    await db.prepare(
      'INSERT INTO agentsam_widget_preferences(installation_id,preferences_json) VALUES (?, ?) ' +
      'ON CONFLICT(installation_id) DO UPDATE SET preferences_json = excluded.preferences_json,updated_at = unixepoch()'
    ).bind(row.id,JSON.stringify(config)).run();
  }
  return { key, surface, updated: true };
}
export async function removeAccountWidget(db, accountId, body) {
  if (!db?.prepare || !accountId) throw Error('widget_context_missing');
  const {key,surface} = parseSafeBody(body,'DELETE');
  const result = await db.prepare(
    "DELETE FROM agentsam_widget_installations WHERE account_id = ? AND widget_key = ? AND surface = ? AND instance_key = 'default'"
  ).bind(accountId,key,surface).run();
  return { key, surface, removed: Boolean(result?.meta?.changes) };
}
/**
 * Persist a complete visible New Tab order in one SQL statement. The account/
 * surface predicate prevents ordering another user's installations; pins stay
 * grouped before non-pinned cards as in the current Workbench presentation.
 */
export async function reorderAccountWidgets(db, accountId, body) {
  if (!db?.prepare || !accountId) throw Error('widget_context_missing');
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !['surface','order'].includes(k)))
    throw Error('widget_request_invalid');
  const surface = safeSurface(body.surface);
  const order = body.order;
  if (!Array.isArray(order) || order.length > 50 || order.some(key => typeof key !== 'string' || !KEY_RE.test(key)) ||
      new Set(order).size !== order.length) throw Error('widget_order_invalid');
  const { results = [] } = await db.prepare(
    "SELECT widget_key, pinned FROM agentsam_widget_installations WHERE account_id = ? AND surface = ? AND instance_key = 'default' AND enabled = 1 AND hidden = 0"
  ).bind(accountId, surface).all();
  if (results.length !== order.length || order.some(key => !results.some(row => row.widget_key === key)))
    throw Error('widget_order_stale');
  const pinned = new Set(results.filter(row => row.pinned).map(row => row.widget_key));
  let unpinnedSeen = false;
  for (const key of order) {
    if (!pinned.has(key)) unpinnedSeen = true;
    else if (unpinnedSeen) throw Error('widget_order_pin_boundary');
  }
  if (!order.length) return { surface, order: [] };
  // One UPDATE makes swaps and longer drag moves atomic; no transient duplicate
  // ranks, unlike independent PATCH requests from the old up/down buttons.
  const caseExpr = order.map(() => 'WHEN ? THEN ?').join(' ');
  await db.prepare(
    'UPDATE agentsam_widget_layouts SET order_index = (' +
    'SELECT CASE widget_key ' + caseExpr + ' ELSE agentsam_widget_layouts.order_index END ' +
    'FROM agentsam_widget_installations WHERE id = agentsam_widget_layouts.installation_id' +
    '), updated_at = unixepoch() WHERE breakpoint = ? AND installation_id IN (' +
    "SELECT id FROM agentsam_widget_installations WHERE account_id = ? AND surface = ? AND instance_key = 'default' AND enabled = 1 AND hidden = 0)"
  ).bind(...order.flatMap((key, i) => [key, i]), 'base', accountId, surface).run();
  return { surface, order };
}

export async function handleAccountWidgetsRequest(request, db, accountId) {
  if (!accountId) return fail('unauthorized',401);
  if (!db?.prepare) return fail('widgets_unavailable',503);
  const method = request.method.toUpperCase();
  if (!['GET','POST','PATCH','DELETE','PUT'].includes(method)) return fail('method_not_allowed',405);
  const url = new URL(request.url);
  if (method !== 'GET') {
    if (request.headers.get('origin') && request.headers.get('origin') !== url.origin)
      return fail('origin_not_allowed',403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      return fail('json_content_type_required',415);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return fail('widget_request_invalid',413);
  }
  try {
    if (method === 'GET') return respond({
      ok:true, surface:safeSurface(url.searchParams.get('surface') ?? 'agentsam_stage'),
      widgets: await listAccountWidgets(db,accountId,url.searchParams.get('surface') ?? 'agentsam_stage'),
    });
    const raw = await request.text();
    if (raw.length > MAX_BODY) return fail('widget_request_invalid',413);
    const body = JSON.parse(raw);
    const result = method === 'POST' ? await installAccountWidget(db,accountId,body)
      : method === 'PUT' ? await reorderAccountWidgets(db,accountId,body)
      : method === 'PATCH' ? await changeAccountWidget(db,accountId,body)
      : await removeAccountWidget(db,accountId,body);
    return respond({ok:true,...result},method === 'POST'?201:200);
  } catch (error) {
    const code = String(error?.message ?? 'widget_request_failed');
    const invalid = code.startsWith('widget_') && (
      code.endsWith('_invalid') || code === 'widget_order_stale' || code === 'widget_order_pin_boundary' || code === 'widget_not_ready' || code === 'widget_not_installed' || code === 'widget_not_found');
    const status = code === 'widget_not_installed'||code === 'widget_not_found' ? 404 :
      code === 'widget_not_ready' || code === 'widget_order_stale' ? 409 : invalid || error instanceof SyntaxError ? 400 : 503;
    return fail(error instanceof SyntaxError ? 'widget_request_invalid' :
      status === 503 ? 'widget_request_failed' : code,status);
  }
}
