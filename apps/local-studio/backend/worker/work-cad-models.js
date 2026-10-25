/**
 * Account-scoped CAD project representations. The D1 project and registered
 * project_storage prefix are authority; neither a URL slug nor a GLB is.
 * This read path never promotes a draft revision or invokes a native engine.
 */

const BASE = /^\/api\/work\/projects\/([^/]+)\/cad(?:\/assets\/([^/]+))?$/;
const MIME = Object.freeze({ '.glb': 'model/gltf-binary', '.json': 'application/json; charset=utf-8', '.ifc': 'application/octet-stream', '.png': 'image/png', '.blend': 'application/octet-stream' });
const response = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });

export function isWorkCadRequest(pathname) { return BASE.test(pathname); }

export function groupCadArtifacts(rows) {
  const groups = new Map();
  for (const row of rows) {
    const match = String(row.r2_key || '').match(/\/revisions\/([^/]+)\//);
    if (!match) continue;
    const key = match[1];
    let group = groups.get(key);
    if (!group) {
      group = { revision: key, status: 'draft', updatedAt: 0, models: [], documents: [], native: [] };
      groups.set(key, group);
    }
    const name = String(row.name || row.r2_key.split('/').pop());
    const lower = name.toLowerCase();
    const asset = { id: row.id, name, validationStatus: row.validation_status || 'untested', status: row.artifact_status || 'draft', contentHash: row.content_hash || null };
    if (lower.endsWith('.glb')) group.models.push(asset);
    else if (lower.endsWith('.json') && /(?:\.cad-creator\.project|\.design|project|design)\.json$/.test(lower)) group.documents.push(asset);
    else if (/\.(?:ifc|fcstd|step)$/i.test(lower)) group.native.push(asset);
    if (row.artifact_status === 'published') group.status = 'published';
    group.updatedAt = Math.max(group.updatedAt, Number(row.updated_at) || 0);
  }
  return [...groups.values()]
    .map((group) => ({ ...group,
      models: group.models.sort((a, b) => Number(b.validationStatus === 'asset-verified') - Number(a.validationStatus === 'asset-verified')),
      documents: group.documents.sort((a, b) => Number(b.validationStatus === 'asset-verified') - Number(a.validationStatus === 'asset-verified')),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function handleWorkCadRequest(request, env, owner) {
  const match = BASE.exec(new URL(request.url).pathname);
  if (!match) return response({ ok: false, error: 'not_found' }, 404);
  if (request.method !== 'GET') return response({ ok: false, error: 'method_not_allowed' }, 405);
  if (!env.DB?.prepare) return response({ ok: false, error: 'project_registry_unavailable' }, 503);
  const [, projectId, assetId] = match;
  if (projectId.length > 128 || (assetId && assetId.length > 128)) return response({ ok: false, error: 'invalid_project_reference' }, 400);
  const project = await env.DB.prepare('SELECT id, name FROM projects WHERE id = ? AND owner_user_id = ?')
    .bind(projectId, owner).first();
  if (!project) return response({ ok: false, error: 'project_not_found' }, 404);
  const stores = await env.DB.prepare("SELECT storage_name, metadata_json FROM project_storage WHERE project_id = ? AND storage_type = 'r2' AND status = 'active'")
    .bind(projectId).all();
  const records = (stores.results || []).flatMap((store) => {
    try {
      const meta = JSON.parse(store.metadata_json || '{}');
      const prefix = meta.keyPrefix;
      if (typeof prefix !== 'string' || !/^projects\/[a-zA-Z0-9_/-]+\/revisions\/$/.test(prefix)) return [];
      // The installation declares its actual Worker binding; never infer access from the bucket name.
      const bindingName = meta.binding || (store.storage_name === 'cad' ? 'CAD_PROJECT_ASSETS' : null);
      const currentPrefix = meta.currentPrefix;
      if (currentPrefix && (typeof currentPrefix !== 'string' || currentPrefix !== prefix.replace(/revisions\/$/, 'current/'))) return [];
      return typeof bindingName === 'string' && /^[A-Z][A-Z0-9_]+$/.test(bindingName)
        ? [{ prefix, bindingName, currentPrefix, current: meta.current || null, bucket: store.storage_name }] : [];
    } catch { return []; }
  });
  if (!records.length) return response({ ok: false, error: 'cad_storage_not_registered' }, 404);
  const { prefix, bindingName, currentPrefix, current, bucket } = records[0];
  if (assetId) {
    const row = await env.DB.prepare("SELECT id, name, r2_key, content_hash, validation_status FROM agentsam_artifacts WHERE id = ? AND artifact_status IN ('draft','published')")
      .bind(assetId).first();
    if (!row || !String(row.r2_key).startsWith(prefix) || row.validation_status === 'failed')
      return response({ ok: false, error: 'cad_asset_not_registered' }, 404);
    const assetStore = env[bindingName];
    if (!assetStore || typeof assetStore.get !== 'function' || typeof assetStore.put !== 'function')
      return response({ ok: false, error: 'cad_asset_store_unavailable' }, 503);
    const object = await assetStore.get(row.r2_key);
    if (!object) return response({ ok: false, error: 'cad_asset_missing' }, 404);
    const extension = String(row.name || row.r2_key).toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
    return new Response(object.body, { status: 200, headers: {
      'content-type': MIME[extension] || 'application/octet-stream',
      'cache-control': 'private, no-store',
      'x-cad-project-id': projectId,
      'x-cad-artifact-id': row.id,
    } });
  }
  const rows = await env.DB.prepare("SELECT id, name, r2_key, artifact_status, validation_status, content_hash, updated_at FROM agentsam_artifacts WHERE substr(r2_key,1,length(?)) = ? AND artifact_status IN ('draft','published') ORDER BY updated_at DESC LIMIT 400")
    .bind(prefix, prefix).all();
  return response({ ok: true, project: { id: project.id, name: project.name }, revisions: groupCadArtifacts(rows.results || []) });
}
