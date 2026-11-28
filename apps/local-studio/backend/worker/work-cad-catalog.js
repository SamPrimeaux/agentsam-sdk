import { readOauthR2Artifact } from './work-r2-read.js';
/**
 * CAD Creator's studio library transport.
 *
 * Catalog records are owned by studio_templates. Payloads and previews are
 * streamed from the R2 bucket named by each record; no template or asset data
 * is duplicated in the CAD application bundle.
 */
const BASE = /^\/api\/work\/cad\/catalog(?:\/([A-Za-z0-9_-]{3,100})\/(preview|payload|asset))?$/;
const TABS = ['templates', 'objects', 'scenes'];
const TEMPLATE_KINDS = new Set([
  'cad_project_template',
  'page_template', 'page',
  'document_template',
  'spreadsheet_template', 'sheet_template',
  'presentation_template', 'slide_template',
  'image_generation_template', 'image_template',
]);
const SLUG = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, max-age=60' } });

export const tabFor = (kind, specs = {}) => {
  const resourceKind = String(kind || '');
  if (TABS.includes(specs?.tab)) return specs.tab;
  if (TEMPLATE_KINDS.has(resourceKind)) return 'templates';
  if (resourceKind === 'model_3d') return 'scenes';
  return /(composition|scene|bim_project|bim_starter)/.test(resourceKind) ? 'scenes' : 'objects';
};

export const isWorkCadCatalogRequest = (pathname) => BASE.test(pathname);

function parseJson(text) {
  try { const value = JSON.parse(text || '{}'); return value && typeof value === 'object' ? value : {}; }
  catch { return {}; }
}

function parseList(text) {
  try { const value = JSON.parse(text || '[]'); return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : []; }
  catch { return []; }
}

/** `studio-templates/cad-creator/platform/modern_villa/v1/project.json` -> `modern_villa` */
export const payloadSlug = (key) => (String(key || '').match(/\/platform\/([^/]+)\/v\d+\//) || [])[1] || null;

export function toCatalogItem(row) {
  const specs = parseJson(row.specs_json);
  const hasPayload = Boolean(row.payload_r2_key && row.payload_bucket_id);
  const isModel = row.resource_kind === 'model_3d';
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
    previewUrl: row.preview_r2_key && row.preview_bucket_id ? `/api/work/cad/catalog/${row.id}/preview` : null,
    payloadUrl: hasPayload ? `/api/work/cad/catalog/${row.id}/payload` : null,
    assetUrl: isModel && hasPayload ? `/api/work/cad/catalog/${row.id}/asset` : null,
  };
}

function bindingFor(env, bindingName) {
  return /^[A-Z][A-Z0-9_]{1,63}$/.test(bindingName || '') ? env[bindingName] : null;
}

function contentTypeFor(key, fallback = 'application/octet-stream') {
  const lower = String(key || '').toLowerCase();
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.scad')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.glb')) return 'model/gltf-binary';
  if (lower.endsWith('.gltf')) return 'model/gltf+json';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
}

export async function handleWorkCadCatalogRequest(request, env, owner, options = {}) {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (!env.DB?.prepare) return json({ ok: false, error: 'catalog_unavailable' }, 503);
  const match = BASE.exec(new URL(request.url).pathname);
  const id = match?.[1];
  const action = match?.[2];

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
    return json({ ok: true, schema: 'agentsam.cad.quick-add-catalog.v2', items });
  }

  const row = await env.DB.prepare(
    `SELECT s.resource_kind, s.payload_r2_key, s.preview_r2_key,
            pb.binding_name AS payload_binding_name, vb.binding_name AS preview_binding_name,
            pb.bucket_name AS payload_bucket_name, vb.bucket_name AS preview_bucket_name,
            pb.access_mode AS payload_access_mode, vb.access_mode AS preview_access_mode,
            pb.connection_user_id AS payload_connection_user_id, vb.connection_user_id AS preview_connection_user_id,
            pb.connection_account_identifier AS payload_account, vb.connection_account_identifier AS preview_account,
            pb.ownership_type AS payload_ownership, vb.ownership_type AS preview_ownership,
            pb.owner_id AS payload_owner, vb.owner_id AS preview_owner
       FROM studio_templates s
       LEFT JOIN r2_buckets pb ON pb.id = s.payload_bucket_id
       LEFT JOIN r2_buckets vb ON vb.id = s.preview_bucket_id
      WHERE s.id = ? AND s.status = 'active'`,
  ).bind(id).first();

  if (!row) return json({ ok: false, error: 'catalog_item_not_found' }, 404);
  if (action === 'asset' && row.resource_kind !== 'model_3d') return json({ ok: false, error: 'asset_not_available' }, 404);

  const preview = action === 'preview';
  const key = preview ? row.preview_r2_key : row.payload_r2_key;
  const bindingName = preview ? row.preview_binding_name : row.payload_binding_name;
  const prefix = preview ? 'preview_' : 'payload_';
  const missing = () => json({ ok: false, error: preview ? 'preview_not_found' : 'payload_not_found' }, 404);
  if (!key) return missing();
  let object;
  if (row[prefix + 'access_mode'] === 'oauth_api') {
    if (!owner) return json({ ok: false, error: 'unauthorized' }, 401);
    const platform = row[prefix + 'ownership'] === 'platform' && row[prefix + 'owner'] === 'platform';
    if (!platform && row[prefix + 'owner'] !== owner) return missing();
    const connectionOwner = row[prefix + 'connection_user_id'];
    if (!connectionOwner || (!platform && connectionOwner !== owner)) return missing();
    object = await readOauthR2Artifact(env, connectionOwner, {
      r2_bucket: row[prefix + 'bucket_name'],
      metadata_json: JSON.stringify({ cloudflare_account_id: row[prefix + 'account'] }),
    }, key, row[prefix + 'account'], options);
    if (object instanceof Response) return object;
  } else {
    const bucket = bindingFor(env, bindingName);
    if (typeof bucket?.get !== 'function') return missing();
    object = await bucket.get(key);
  }
  if (!object) return json({ ok: false, error: preview ? 'preview_not_found' : 'payload_not_found' }, 404);

  const type = contentTypeFor(key, object.httpMetadata?.contentType);
  return new Response(object.body, {
    headers: {
      'content-type': type,
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=300',
    },
  });
}
