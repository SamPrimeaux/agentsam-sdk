/**
 * Quick-add catalog for CAD Creator: the "+" menu and Templates gallery.
 * Platform catalog rows live in studio_templates; preview images stream from
 * whichever R2 bucket the row names, resolved through r2_buckets.binding_name.
 * Read-only. Callers are already authenticated by work-service.
 */
const BASE = /^\/api\/work\/cad\/catalog(?:\/([A-Za-z0-9_-]{3,100})\/preview)?$/;
const APPS = ['cad-creator', 'samsketch'];
/** resource_kind decides the gallery tab: placeable things are Objects, whole compositions are Scenes. */
export const CATALOG_TAB = Object.freeze({
  cad_stock_object: 'objects',
  source_part: 'objects',
  cad_project_template: 'scenes',
  scene_composition: 'scenes',
});
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, max-age=60' } });

export const isWorkCadCatalogRequest = (pathname) => BASE.test(pathname);

function parseJson(text) {
  try { const v = JSON.parse(text || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** `studio-templates/cad-creator/platform/modern_villa/v1/project.json` -> `modern_villa` */
export const payloadSlug = (key) => (String(key || '').match(/\/platform\/([^/]+)\/v\d+\//) || [])[1] || null;

export function toCatalogItem(row) {
  const tab = CATALOG_TAB[row.resource_kind];
  if (!tab) return null;
  return {
    id: row.id,
    tab,
    kind: row.resource_kind,
    app: row.app_id,
    category: row.category,
    pack: row.pack_title || row.pack_slug || null,
    title: row.title,
    description: row.description || '',
    specs: parseJson(row.specs_json),
    renderer: row.renderer_key || null,
    ref: payloadSlug(row.payload_r2_key),
    previewUrl: row.preview_r2_key && row.preview_bucket_id ? `/api/work/cad/catalog/${row.id}/preview` : null,
  };
}

export async function handleWorkCadCatalogRequest(request, env) {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (!env.DB?.prepare) return json({ ok: false, error: 'catalog_unavailable' }, 503);
  const match = BASE.exec(new URL(request.url).pathname);
  const id = match?.[1];
  if (!id) {
    const rows = await env.DB.prepare(
      `SELECT id, app_id, resource_kind, pack_slug, pack_title, category, title, description, specs_json,
              payload_r2_key, preview_bucket_id, preview_r2_key, renderer_key
         FROM studio_templates
        WHERE status = 'active' AND app_id IN (${APPS.map(() => '?').join(',')})
        ORDER BY app_id, sort_order, title`,
    ).bind(...APPS).all();
    const items = (rows.results || []).map(toCatalogItem).filter(Boolean);
    return json({ ok: true, schema: 'agentsam.cad.quick-add-catalog.v1', items });
  }
  const row = await env.DB.prepare(
    `SELECT s.preview_r2_key, b.binding_name FROM studio_templates s
       JOIN r2_buckets b ON b.id = s.preview_bucket_id
      WHERE s.id = ? AND s.status = 'active' AND s.app_id IN (${APPS.map(() => '?').join(',')})`,
  ).bind(id, ...APPS).first();
  const bucket = row && /^[A-Z][A-Z0-9_]{1,63}$/.test(row.binding_name || '') ? env[row.binding_name] : null;
  if (!row?.preview_r2_key || typeof bucket?.get !== 'function') return json({ ok: false, error: 'preview_not_found' }, 404);
  const object = await bucket.get(row.preview_r2_key);
  if (!object) return json({ ok: false, error: 'preview_not_found' }, 404);
  const type = object.httpMetadata?.contentType || (row.preview_r2_key.endsWith('.webp') ? 'image/webp' : 'image/png');
  return new Response(object.body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=3600' } });
}
