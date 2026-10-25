/**
 * Account-scoped CAD project representations. The D1 project and registered
 * project_storage prefix are authority; neither a URL slug nor a GLB is.
 * This read path never promotes a draft revision or invokes a native engine.
 */

const BASE = /^\/api\/work\/projects\/([^/]+)\/cad(?:\/assets\/([^/]+)|\/(documents))?$/;
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
    let meta = null;
    try { meta = row.metadata_json ? JSON.parse(row.metadata_json) : null; } catch { meta = null; }
    if (lower.endsWith('.glb')) group.models.push(asset);
    else if (lower.endsWith('.json') && /(?:\.cad-creator\.project|\.design|project|design)\.json$/.test(lower)) {
      group.documents.push(asset);
      if (meta && typeof meta.parentRevision === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(meta.parentRevision)) group.parentRevision = meta.parentRevision;
      if (meta && typeof meta.label === 'string') group.label = meta.label.slice(0, 120);
    }
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
  const isWrite = request.method === 'PUT' && Boolean(match[3]);
  if (!isWrite && (request.method !== 'GET' || match[3])) return response({ ok: false, error: 'method_not_allowed' }, 405);
  if (!env.DB?.prepare) return response({ ok: false, error: 'project_registry_unavailable' }, 503);
  const [, projectId, assetId] = match;
  if (projectId.length > 128 || (assetId && assetId.length > 128)) return response({ ok: false, error: 'invalid_project_reference' }, 400);
  const project = await env.DB.prepare('SELECT id, name, tenant_id FROM projects WHERE id = ? AND owner_user_id = ?')
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
  if (isWrite) {
    const known = await loadRevisions(env, owner, { prefix, currentPrefix, current, bucket });
    return saveDesignDocument(request, env, { owner, project, prefix, bindingName, bucket, current, revisions: known });
  }
  if (assetId) {
    const row = await env.DB.prepare("SELECT id, name, r2_key, content_hash, validation_status FROM agentsam_artifacts WHERE id = ? AND artifact_status IN ('draft','published')")
      .bind(assetId).first();
    if (!row || !(String(row.r2_key).startsWith(prefix) || (currentPrefix && String(row.r2_key).startsWith(currentPrefix))) || row.validation_status === 'failed')
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
  const revisions = await loadRevisions(env, owner, { prefix, currentPrefix, current, bucket });
  return response({ ok: true, project: { id: project.id, name: project.name },
    access: { canWrite: typeof env[bindingName]?.put === 'function' }, revisions });
}

async function loadRevisions(env, owner, { prefix, currentPrefix, current, bucket }) {
  const rows = await env.DB.prepare("SELECT id, name, r2_key, artifact_status, validation_status, content_hash, updated_at, metadata_json FROM agentsam_artifacts WHERE substr(r2_key,1,length(?)) = ? AND artifact_status IN ('draft','published') ORDER BY updated_at DESC LIMIT 400")
    .bind(prefix, prefix).all();
  const revisions = groupCadArtifacts(rows.results || []);
  // One living model: the active viewer is resolved from verified, owner-owned
  // artifacts. Historical revisions remain available but never become projects.
  if (current && currentPrefix && current.modelAssetId) {
    const ids = [current.modelAssetId, current.nativeBimAssetId, current.ifcAssetId, current.documentAssetId]
      .filter(value => typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value));
    const slug = currentPrefix.split('/')[1];
    const result = await env.DB.prepare(
      `SELECT id, name, r2_key, artifact_status, validation_status, content_hash, updated_at
       FROM agentsam_artifacts WHERE id IN (${ids.map(() => '?').join(',')})
       AND user_id = ? AND r2_bucket = ? AND project_key = ? AND artifact_status IN ('draft','published')`
    ).bind(...ids, owner, bucket, slug).all();
    const verified = (id) => (result.results || []).find(row =>
      row.id === id && row.r2_key.startsWith(currentPrefix)
      && row.validation_status === 'asset-verified' && !!row.content_hash);
    const model = verified(current.modelAssetId);
    const document = (result.results || []).find(row => row.id === current.documentAssetId
      && row.r2_key.startsWith(prefix) && row.validation_status === 'asset-verified' && !!row.content_hash);
    if (model) {
      const entry = (row) => ({
        id: row.id, name: row.name, status: row.artifact_status,
        validationStatus: row.validation_status, contentHash: row.content_hash,
      });
      const native = [verified(current.nativeBimAssetId), verified(current.ifcAssetId)]
        .filter(Boolean).map(entry);
      revisions.unshift({
        revision: 'current', label: current.label || 'Current model',
        status: 'draft', updatedAt: Math.max(Number(model.updated_at) || 0, Number(document?.updated_at) || 0),
        bimRevision: current.bimRevision || null, sceneRevision: current.sceneRevision || null,
        models: [entry(model)], documents: document ? [entry(document)] : [], native,
      });
    }
  }
  // A saved edit carries its own design document and inherits the model of the revision it was edited from.
  const byId = new Map(revisions.map((r) => [r.revision, r]));
  const modelsOf = (r, depth = 0) => {
    if (r.models.length) return r.models;
    const parent = r.parentRevision && byId.get(r.parentRevision);
    return parent && depth < 25 ? modelsOf(parent, depth + 1) : [];
  };
  for (const r of revisions) {
    if (r.documents.length && !r.models.length) {
      const inherited = modelsOf(r);
      if (inherited.length) r.models = inherited.map((model) => ({ ...model, stale: true }));
    }
  }
  return revisions;
}

const REVISION_ID = /^[a-zA-Z0-9._-]{1,64}$/;
const MAX_DESIGN_BYTES = 8 * 1024 * 1024;
const sha256Hex = async (buffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * Save an edited design document as a NEW immutable revision. The base revision is never
 * modified. The owner check and the R2 binding come from the same registry the readers use.
 */
async function saveDesignDocument(request, env, { owner, project, prefix, bindingName, bucket, current, revisions }) {
  const assetStore = env[bindingName];
  if (!assetStore || typeof assetStore.get !== 'function' || typeof assetStore.put !== 'function')
    return response({ ok: false, error: 'cad_asset_store_unavailable' }, 503);
  if (!project.tenant_id) return response({ ok: false, error: 'project_tenant_missing' }, 409);
  const base = new URL(request.url).searchParams.get('base') || '';
  if (!REVISION_ID.test(base) || !revisions.some((r) => r.revision === base))
    return response({ ok: false, error: 'cad_base_revision_unknown' }, 400);
  const raw = await request.arrayBuffer();
  if (!raw.byteLength || raw.byteLength > MAX_DESIGN_BYTES) return response({ ok: false, error: 'cad_document_size_invalid' }, 413);
  let doc;
  try { doc = JSON.parse(new TextDecoder().decode(raw)); } catch { return response({ ok: false, error: 'cad_document_not_json' }, 400); }
  if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string' || !Array.isArray(doc.walls) || !Array.isArray(doc.rooms))
    return response({ ok: false, error: 'cad_document_shape_invalid' }, 400);
  if (doc.id !== project.id) return response({ ok: false, error: 'cad_project_id_mismatch' }, 400);
  const baseRevision = revisions.find(row => row.revision === base);
  if (doc.sceneSource) {
    const source = doc.sceneSource;
    if (source.units !== 'm' || source.axes !== 'gltf-y-up' || !baseRevision.models.some(model => model.id === source.assetId && model.contentHash === source.contentHash))
      return response({ ok: false, error: 'cad_scene_source_mismatch' }, 409);
    if (!Array.isArray(doc.sceneElements) || doc.sceneElements.length > 6000 || new Set(doc.sceneElements.map(row => row?.id)).size !== doc.sceneElements.length
      || doc.sceneElements.some(row => !row || typeof row.id !== 'string' || !row.id || row.id.length > 2048
        || typeof row.name !== 'string' || row.name.length > 512 || typeof row.visible !== 'boolean'
        || !Array.isArray(row.offset) || row.offset.length !== 3 || row.offset.some(n => !Number.isFinite(n) || Math.abs(n) > 100000)
        || !Number.isFinite(row.rotation) || Math.abs(row.rotation) > 36000
        || !['min','max'].every(key => Array.isArray(row.bounds?.[key]) && row.bounds[key].length === 3 && row.bounds[key].every(Number.isFinite))
        || (row.color != null && !/^#[0-9a-f]{6}$/i.test(row.color)) || (row.note != null && (typeof row.note !== 'string' || row.note.length > 2000))))
      return response({ ok: false, error: 'cad_scene_elements_invalid' }, 400);
  } else if (doc.sceneElements?.length) return response({ ok: false, error: 'cad_scene_source_required' }, 400);
  if (doc.sceneSettings && (!['exposure','sun','ambient'].every(key => doc.sceneSettings[key] == null || (Number.isFinite(doc.sceneSettings[key]) && doc.sceneSettings[key] >= 0 && doc.sceneSettings[key] <= 20))
    || !['sky','daylight','roofVisible'].every(key => doc.sceneSettings[key] == null || typeof doc.sceneSettings[key] === 'boolean')
    || (doc.sceneSettings.shading != null && !['lit','color'].includes(doc.sceneSettings.shading))))
    return response({ ok: false, error: 'cad_scene_settings_invalid' }, 400);
  if (doc.nativeHistory && (doc.nativeHistory.version !== 1 || !Array.isArray(doc.nativeHistory.operations)
    || doc.nativeHistory.operations.length > 10000 || !Number.isInteger(doc.nativeHistory.cursor)
    || doc.nativeHistory.cursor < 0 || doc.nativeHistory.cursor > doc.nativeHistory.operations.length
    || doc.nativeHistory.operations.some(operation => !operation || typeof operation !== 'object' || typeof operation.type !== 'string')))
    return response({ ok: false, error: 'cad_native_history_invalid' }, 400);
  const strokes = doc.sketchDocument?.nativeStrokes;
  if (strokes != null && (!Array.isArray(strokes) || strokes.length > 5000 || strokes.some(stroke => !stroke || typeof stroke.id !== 'string'
    || !['ink','line','rect'].includes(stroke.kind) || (stroke.purpose != null && !['layout','markup'].includes(stroke.purpose))
    || !Array.isArray(stroke.points) || stroke.points.length > 4096 || stroke.points.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)))))
    return response({ ok: false, error: 'cad_sketch_invalid' }, 400);
  const active = revisions.find(row => row.revision === 'current');
  if (current && active) {
    const expected = active.documents[0]?.contentHash || active.models[0]?.contentHash;
    if (request.headers.get('if-match') !== expected || (base !== 'current' && base !== current.documentRevision))
      return response({ ok: false, error: 'cad_revision_conflict' }, 409);
  }
  const revision = 'd' + Date.now().toString(36) + crypto.randomUUID().slice(0, 4);
  const key = `${prefix}${revision}/source/project.design.json`;
  const sha256 = await sha256Hex(raw);
  const now = Date.now();
  await assetStore.put(key, raw, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { sha256, schema: 'agentsam.cad.design.v1', parentRevision: base },
  });
  const readBack = await assetStore.get(key);
  const verified = readBack ? (await sha256Hex(await readBack.arrayBuffer())) === sha256 : false;
  if (!verified) {
    if (typeof assetStore.delete === 'function') await assetStore.delete(key).catch(() => {});
    return response({ ok: false, error: 'cad_document_readback_failed' }, 502);
  }
  const assetId = 'art_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  const label = `Edit · ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  try {
    await env.DB.prepare(
      "INSERT INTO agentsam_artifacts (id, user_id, tenant_id, name, artifact_type, r2_key, source, file_size_bytes, content_hash, r2_bucket, scope, visibility, project_key, artifact_status, validation_status, mime_type, metadata_json) VALUES (?, ?, ?, 'project.design.json', 'cad-design', ?, 'cad.design.save', ?, ?, ?, 'user', 'private', ?, 'draft', ?, 'application/json', ?)",
    ).bind(assetId, owner, project.tenant_id, key, raw.byteLength, sha256, bucket, prefix.split('/')[1],
      verified ? 'asset-verified' : 'untested', JSON.stringify({ parentRevision: base, label, projectId: project.id })).run();
    if (current && active) {
      const advanced = await env.DB.prepare(
        "UPDATE project_storage SET metadata_json = json_set(metadata_json, '$.current.documentAssetId', ?, '$.current.documentRevision', ?, '$.current.documentHash', ?), updated_at = datetime('now') WHERE project_id = ? AND storage_type = 'r2' AND storage_name = ? AND json_extract(metadata_json, '$.current.modelAssetId') = ? AND coalesce(json_extract(metadata_json, '$.current.documentAssetId'), '') = ?",
      ).bind(assetId, revision, sha256, project.id, bucket, current.modelAssetId, current.documentAssetId || '').run();
      if (advanced.meta?.changes === 0) {
        await env.DB.prepare('DELETE FROM agentsam_artifacts WHERE id = ? AND user_id = ?').bind(assetId, owner).run();
        if (typeof assetStore.delete === 'function') await assetStore.delete(key).catch(() => {});
        return response({ ok: false, error: 'cad_revision_conflict' }, 409);
      }
    }
  } catch {
    if (typeof assetStore.delete === 'function') await assetStore.delete(key).catch(() => {});
    return response({ ok: false, error: 'cad_registry_write_failed' }, 500);
  }
  return response({ ok: true, receipt: {
    revisionId: revision, projectId: project.id, revisionNumber: revisions.filter((r) => r.parentRevision).length + 1,
    timestamp: now, message: label, wallsCount: doc.walls.length, roomsCount: doc.rooms.length,
    parametricCount: Array.isArray(doc.parametricObjects) ? doc.parametricObjects.length : 0,
    sceneElementCount: Array.isArray(doc.sceneElements) ? doc.sceneElements.length : 0,
    assetId, sha256, bytes: raw.byteLength, verified,
  } }, 201);
}
