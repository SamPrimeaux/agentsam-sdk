/**
 * Quick-add catalog for CAD Creator: the "+" menu and Templates gallery.
 * Platform catalog rows live in studio_templates; preview images stream from
 * whichever R2 bucket the row names, resolved through r2_buckets.binding_name.
 * Read-only. Callers are already authenticated by work-service.
 * Every active row is served; `?app=` and `?kind=` narrow it. Nothing is allowlisted in code.
 */
const BASE = /^\/api\/work\/cad\/catalog(?:\/([A-Za-z0-9_-]{3,100})\/(preview|payload))?$/;
const TABS = ['objects', 'scenes'];
/**
 * Which gallery tab a row belongs to is row data: `specs.tab`. Rows that do not say fall back to a
 * structural rule on resource_kind (compositions, templates and scenes are Scenes, the rest are Objects),
 * so a new kind appears in the catalog without a Worker change.
 */
export const tabFor = (kind, specs) => {
  if (TABS.includes(specs?.tab)) return specs.tab;
  return /(composition|template|scene)/.test(String(kind || '')) ? 'scenes' : 'objects';
};
const SLUG = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, max-age=60' } });

export const isWorkCadCatalogRequest = (pathname) => BASE.test(pathname);

function parseJson(text) {
  try { const v = JSON.parse(text || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

function parseList(text) {
  try { const v = JSON.parse(text || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}

/** `studio-templates/cad-creator/platform/modern_villa/v1/project.json` -> `modern_villa` */
export const payloadSlug = (key) => (String(key || '').match(/\/platform\/([^/]+)\/v\d+\//) || [])[1] || null;

export function toCatalogItem(row) {
  const specs = parseJson(row.specs_json);
  return {
    id: row.id,
    tab: tabFor(row.resource_kind, specs),
    kind: row.resource_kind,
    app: row.app_id,
    category: row.category,
    pack: row.pack_title || row.pack_slug || null,
    title: row.title,
    description: row.description || '',
    specs,
    compatibleApps: parseList(row.compatible_apps_json),
    renderer: row.renderer_key || null,
    ref: payloadSlug(row.payload_r2_key),
    // Authenticated resource URL works for templates outside legacy /platform/ paths.
    payloadUrl: row.payload_r2_key && row.payload_bucket_id ? '/api/work/cad/catalog/' + row.id + '/payload' : null,
    previewUrl: row.preview_r2_key && row.preview_bucket_id ? `/api/work/cad/catalog/${row.id}/preview` : null,
  };
}

export async function handleWorkCadCatalogRequest(request, env) {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (!env.DB?.prepare) return json({ ok: false, error: 'catalog_unavailable' }, 503);
  const match = BASE.exec(new URL(request.url).pathname);
  const id = match?.[1];
  if (!id) {
    const params = new URL(request.url).searchParams;
    const app = params.get('app'), kind = params.get('kind');
    if ((app && !SLUG.test(app)) || (kind && !SLUG.test(kind))) return json({ ok: false, error: 'bad_filter' }, 400);
    const where = ["status = 'active'"], binds = [];
    if (kind) { where.push('resource_kind = ?'); binds.push(kind); }
    if (app) {
      where.push(`(app_id = ? OR (json_valid(compatible_apps_json) AND EXISTS (SELECT 1 FROM json_each(compatible_apps_json) WHERE value IN (?, '*'))))`);
      binds.push(app, app);
    }
    const rows = await env.DB.prepare(
      `SELECT id, app_id, resource_kind, pack_slug, pack_title, category, title, description, specs_json,
              compatible_apps_json, payload_bucket_id, payload_r2_key, preview_bucket_id, preview_r2_key, renderer_key
         FROM studio_templates
        WHERE ${where.join(' AND ')}
        ORDER BY sort_order, title`,
    ).bind(...binds).all();
    const items = (rows.results || []).map(toCatalogItem);
    return json({ ok: true, schema: 'agentsam.cad.quick-add-catalog.v1', items });
  }
  // Resolve the bucket via the registered resource. Never accept caller-provided keys.
  const resource = match[2];
  const column = resource === 'payload' ? 'payload' : 'preview';
  const row = await env.DB.prepare(
    'SELECT s.' + column + '_r2_key AS object_key, b.binding_name FROM studio_templates s ' +
    'JOIN r2_buckets b ON b.id = s.' + column + '_bucket_id ' +
    "WHERE s.id = ? AND s.status = 'active'",
  ).bind(id).first();
  const bucket = row && /^[A-Z][A-Z0-9_]{1,63}$/.test(row.binding_name || '') ? env[row.binding_name] : null;
  if (!row?.object_key || typeof bucket?.get !== 'function') return json({ ok: false, error: resource + '_not_found' }, 404);
  const object = await bucket.get(row.object_key);
  if (!object) return json({ ok: false, error: resource + '_not_found' }, 404);
  const type = object.httpMetadata?.contentType
    || (row.object_key.endsWith('.json') ? 'application/json'
      : row.object_key.endsWith('.webp') ? 'image/webp'
      : row.object_key.endsWith('.png') ? 'image/png'
      : 'application/octet-stream');
  return new Response(object.body, {
    headers: { 'content-type': type, 'cache-control': 'private, max-age=60', 'x-content-type-options': 'nosniff' },
  });
}
