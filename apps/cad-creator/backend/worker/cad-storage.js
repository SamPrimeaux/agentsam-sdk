import appManifest from '../../agentsam.app.json' with { type: 'json' };
/**
 * CAD Creator hosted artifact authority. The Worker holds D1/R2 bindings;
 * neither the browser nor the CAD container receives Cloudflare credentials.
 * Authentication is delegated to the existing OAuth token verification service.
 */
const BUCKET = appManifest.storage.bucketName;
const MAX_BYTES = 25 * 1024 * 1024;
const KEY_PART = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const HEX = /^[a-f0-9]{64}$/;

function reply(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
function valid(value) { return typeof value === 'string' && KEY_PART.test(value) && value !== '..' && value !== '.'; }
function segments(pathname) {
  const match = pathname.match(/^\/api\/cad\/artifacts\/([^/]+)\/([1-9][0-9]*)\/([^/]+)$/);
  if (!match || !match.slice(1).every(valid)) return null;
  return { project: match[1], revision: Number(match[2]), file: match[3] };
}
function projectKey(p) { return `projects/${p.project}/revisions/${p.revision}/${p.file}`; }
function scopesOf(value) {
  if (Array.isArray(value)) return value.map(String);
  return String(value || '').split(/\s+/).filter(Boolean);
}

/** Runtime-owned credential verifier; no client-asserted user/tenant/workspace identifiers. */
export async function resolveCadActor(request, env, { fetchImpl = fetch } = {}) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return { error: 'bearer_required', status: 401 };
  const verifier = env.CAD_AUTH_VERIFIER;
  const verifyURL = env.MCP_TOKEN_VERIFY_URL;
  if (!verifier?.fetch && !verifyURL) return { error: 'cad_oauth_verifier_not_configured', status: 503 };
  let response;
  try {
    const destination = verifier?.fetch
      ? new Request('https://cad-auth.internal/verify', { headers: { authorization, accept: 'application/json' } })
      : new Request(verifyURL, { headers: { authorization, accept: 'application/json' } });
    response = verifier?.fetch
      ? await verifier.fetch(destination)
      : await fetchImpl(destination);
  } catch { return { error: 'cad_oauth_verifier_unavailable', status: 503 }; }
  if (!response.ok) return { error: 'unauthorized', status: 401 };
  const principal = await response.json().catch(() => null);
  if (!principal || principal.ok === false || principal.active !== true
      || typeof principal.sub !== 'string' || !principal.sub.trim()) {
    return { error: 'unauthorized', status: 401 };
  }
  const audience = Array.isArray(principal.aud) ? principal.aud : [principal.aud ?? principal.audience];
  if (!audience.includes('cad-creator')) return { error: 'cad_token_audience_invalid', status: 403 };
  return { principal: {
    actor: principal.sub,
    tenant: principal.tenant_id || null,
    workspace: principal.workspace_id || null,
    projects: Array.isArray(principal.projects) ? principal.projects : [],
    scopes: scopesOf(principal.scope || principal.scopes),
  } };
}

async function authorize(request, env, target, action, deps, resource = 'artifact') {
  const identity = await resolveCadActor(request, env, deps);
  if (identity.error) return { response: reply({ ok: false, error: identity.error }, identity.status) };
  const actor = identity.principal;
  const permission = `cad:${resource}.${action}`;
  if (!actor.scopes.includes(permission)) return { response: reply({ ok: false, error: 'cad_permission_denied' }, 403) };
  // Project authorization is resolved by the trusted issuer, never by a caller's
  // arbitrary account_id, workspace_id, or project slug.
  if (!actor.projects.includes(target.project)) return { response: reply({ ok: false, error: 'cad_project_not_authorized' }, 403) };
  return { actor };
}
const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
  .map(b => b.toString(16).padStart(2, '0')).join('');

/**
 * R2 is committed first; D1 registration is advisory and reflected in a
 * typed delivery receipt. No fake success or D1 rollback of a real R2 object.
 */
export async function handleCadArtifact(request, env, deps = {}) {
  const url = new URL(request.url);
  const target = segments(url.pathname);
  const listing = url.pathname.match(/^\/api\/cad\/artifacts\/([^/]+)\/([1-9][0-9]*)$/);
  if (!target && !(listing && valid(listing[1]) && url.searchParams.get('list') === '1')) return reply({ ok: false, error: 'cad_artifact_route_invalid' }, 404);
  const method = request.method;
  if (!['GET', 'HEAD', 'PUT', 'DELETE'].includes(method)) return reply({ ok: false, error: 'method_not_allowed' }, 405);
  if (!env.WEBSITE_ASSETS || !env.DB) return reply({ ok: false, error: 'cad_storage_bindings_missing' }, 503);
  const access = await authorize(request, env, target || { project: listing[1] }, ['GET', 'HEAD'].includes(method) ? 'read' : method === 'DELETE' ? 'delete' : 'write', deps);
  if (access.response) return access.response;
  if (listing) {
    const prefix = `projects/${listing[1]}/revisions/${listing[2]}/`;
    const cursor = url.searchParams.get('cursor') || undefined;
    const listed = await env.WEBSITE_ASSETS.list({ prefix, ...(cursor ? { cursor } : {}), limit: 1000 });
    return reply({ ok: true, project: listing[1], revision: Number(listing[2]), artifacts: listed.objects.map(o => ({ name: o.key.slice(prefix.length), bytes: o.size, sha256: o.customMetadata?.sha256 || null })), ...(listed.truncated ? { cursor: listed.cursor } : {}) });
  }
  const key = projectKey(target);
  const actor = access.actor;
  if (method === 'HEAD') {
    const object = await env.WEBSITE_ASSETS.head(key);
    return new Response(null, { status: object ? 200 : 404, headers: object ? { 'x-content-sha256': object.customMetadata?.sha256 || '', 'content-length': String(object.size) } : {} });
  }
  if (method === 'GET') {
    const object = await env.WEBSITE_ASSETS.get(key);
    if (!object) return reply({ ok: false, error: 'cad_artifact_not_found' }, 404);
    const bytes = await object.arrayBuffer();
    const digest = await hash(bytes);
    const stored = object.customMetadata?.sha256;
    if (stored && stored !== digest) return reply({ ok: false, error: 'cad_artifact_integrity_failed' }, 409);
    return new Response(bytes, { status: 200, headers: {
      'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
      'etag': '"' + digest + '"', 'x-content-sha256': digest, 'cache-control': 'no-store',
    } });
  }
  if (method === 'DELETE') {
    const existing = await env.WEBSITE_ASSETS.head(key);
    if (!existing) return reply({ ok: false, error: 'cad_artifact_not_found' }, 404);
    await env.WEBSITE_ASSETS.delete(key);
    let db = { registered: false };
    try {
      await env.DB.prepare("UPDATE agentsam_cad_jobs SET status='cancelled',updated_at=unixepoch() WHERE user_id=? AND r2_key=?").bind(actor.actor, key).run();
      db.registered = true;
    } catch { db.error = 'cad_db_update_failed'; }
    return reply({ ok: true, deleted: true, key, db });
  }

  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > MAX_BYTES) return reply({ ok: false, error: 'cad_artifact_size_invalid' }, 413);
  const digest = await hash(data);
  const supplied = request.headers.get('x-content-sha256');
  if (supplied && (!HEX.test(supplied) || supplied !== digest)) return reply({ ok: false, error: 'cad_artifact_hash_mismatch' }, 422);
  const existing = await env.WEBSITE_ASSETS.head(key);
  if (existing && request.headers.get('if-match') !== '"' + existing.customMetadata?.sha256 + '"') {
    return reply({ ok: false, error: 'cad_revision_artifact_exists' }, 409);
  }
  await env.WEBSITE_ASSETS.put(key, data, {
    httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' },
    customMetadata: { sha256: digest, schema: 'agentsam.cad.artifact.v1' },
  });
  const receipt = {
    ok: true, key, project: target.project, revision: target.revision,
    bytes: data.byteLength, sha256: digest, bucketBinding: appManifest.storage.artifactBinding,
    db: { registered: false },
  };
  try {
    const jobId = 'cad_' + crypto.randomUUID().replace(/-/g, '');
    await env.DB.prepare(
      "INSERT INTO agentsam_cad_jobs (id,user_id,engine,status,project_id,task_type,r2_key,r2_bucket,tenant_id,workspace_id,created_at,updated_at) VALUES (?,?,?,'done',?,'cad-project',?,?,?, ?,unixepoch(),unixepoch())"
    ).bind(jobId, actor.actor, 'artifact-delivery', target.project, key, BUCKET, actor.tenant, actor.workspace).run();
    receipt.db = { registered: true, jobId };
    if (actor.tenant) {
      try {
        const artifactId = 'art_' + crypto.randomUUID().replace(/-/g, '');
        await env.DB.prepare("INSERT INTO agentsam_artifacts (id,user_id,tenant_id,workspace_id,name,artifact_type,r2_key,source,file_size_bytes,content_hash,r2_bucket,scope,visibility,project_key,metadata_json) VALUES (?,?,?,?,?,'cad-model',?,'cad.artifact.delivery',?,?,?,'user','private',?,?)")
          .bind(artifactId, actor.actor, actor.tenant, actor.workspace, target.file, key,
                data.byteLength, digest, BUCKET, target.project, JSON.stringify({ revision: target.revision, jobId })).run();
        receipt.db.artifactId = artifactId;
      } catch { receipt.db.artifactError = 'cad_artifact_index_failed'; }
    }
    if (actor.tenant && actor.workspace && /^(model\.|project\.)/.test(target.file)) {
      try {
        const snapshotId = 'scene_' + crypto.randomUUID().replace(/-/g, '');
        await env.DB.prepare("INSERT INTO scene_snapshots (id,workspace_id,user_id,tenant_id,name,project_type,entity_count,r2_key,r2_bucket,project_id,version,cad_job_id) VALUES (?,?,?,?,?,'CAD_PROJECT',0,?,?,?,?,?)")
          .bind(snapshotId, actor.workspace, actor.actor, actor.tenant, target.project, key, BUCKET, target.project, target.revision, jobId).run();
        receipt.db.snapshotId = snapshotId;
      } catch { receipt.db.revisionError = 'cad_revision_registration_failed'; }
    } else if (/^(model\.|project\.)/.test(target.file)) {
      receipt.db.revisionError = 'cad_revision_legacy_scope_unavailable';
    }
  } catch {
    receipt.db = { registered: false, error: 'cad_job_registration_failed' };
  }
  return reply(receipt, 201);
}

/** Evidence file storage for the existing sam.evidence.* store interface. */
export async function handleCadEvidence(request, env, deps = {}) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  if (parts[1] !== 'api' || parts[2] !== 'cad' || parts[3] !== 'evidence'
      || parts.length < 6 || !parts.slice(4).every(valid)) {
    return reply({ ok: false, error: 'cad_evidence_route_invalid' }, 404);
  }
  const [project, runId] = parts.slice(4);
  const relative = parts.slice(4).join('/');
  const target = { project };
  const isList = request.method === 'GET' && url.searchParams.get('list') === '1';
  const method = request.method;
  if (!['GET', 'HEAD', 'PUT', 'DELETE'].includes(method)) return reply({ ok: false, error: 'method_not_allowed' }, 405);
  if (!env.WEBSITE_ASSETS) return reply({ ok: false, error: 'cad_storage_bindings_missing' }, 503);
  const action = method === 'PUT' ? 'write' : method === 'DELETE' ? 'delete' : 'read';
  const access = await authorize(request, env, target, action, deps, 'evidence');
  if (access.response) return access.response;
  const actor = access.actor;
  const key = 'evidence/' + relative;
  if (isList) {
    const cursor = url.searchParams.get('cursor') || undefined;
    const prefix = key + (url.searchParams.get('exact') === '1' ? '' : '/');
    const listed = await env.WEBSITE_ASSETS.list({ prefix, ...(cursor ? { cursor } : {}), limit: 1000 });
    return reply({ ok: true, keys: listed.objects.map(o => o.key.slice('evidence/'.length)),
                   ...(listed.truncated ? { cursor: listed.cursor } : {}) });
  }
  if (parts.length < 7) return reply({ ok: false, error: 'cad_evidence_file_required' }, 400);
  if (method === 'HEAD') {
    const object = await env.WEBSITE_ASSETS.head(key);
    return new Response(null, { status: object ? 200 : 404,
      headers: object ? { 'content-length': String(object.size), 'x-content-sha256': object.customMetadata?.sha256 || '' } : {} });
  }
  if (method === 'GET') {
    const object = await env.WEBSITE_ASSETS.get(key);
    if (!object) return reply({ ok: false, error: 'cad_evidence_not_found' }, 404);
    const bytes = await object.arrayBuffer();
    const digest = await hash(bytes);
    if (object.customMetadata?.sha256 && object.customMetadata.sha256 !== digest)
      return reply({ ok: false, error: 'cad_evidence_integrity_failed' }, 409);
    return new Response(bytes, { status: 200, headers: { 'x-content-sha256': digest,
      'content-type': object.httpMetadata?.contentType || 'application/octet-stream', 'cache-control': 'no-store' } });
  }
  if (method === 'DELETE') {
    if (!await env.WEBSITE_ASSETS.head(key)) return reply({ ok: false, error: 'cad_evidence_not_found' }, 404);
    await env.WEBSITE_ASSETS.delete(key);
    return reply({ ok: true, deleted: true, key });
  }
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > MAX_BYTES) return reply({ ok: false, error: 'cad_evidence_size_invalid' }, 413);
  const digest = await hash(data);
  const supplied = request.headers.get('x-content-sha256');
  if (supplied && supplied !== digest) return reply({ ok: false, error: 'cad_evidence_hash_mismatch' }, 422);
  const existing = await env.WEBSITE_ASSETS.head(key);
  if (existing && request.headers.get('if-match') !== '"' + existing.customMetadata?.sha256 + '"')
    return reply({ ok: false, error: 'cad_evidence_asset_exists' }, 409);
  await env.WEBSITE_ASSETS.put(key, data, {
    httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' },
    customMetadata: { sha256: digest, schema: 'agentsam.evidence.asset.v1' },
  });
  const receipt = { ok: true, key: relative, bytes: data.byteLength, sha256: digest, db: { registered: false } };
  if (!actor.tenant || !env.DB) {
    receipt.db.error = 'cad_evidence_registration_scope_or_db_missing';
    return reply(receipt, 201);
  }
  try {
    const id = 'art_' + crypto.randomUUID().replace(/-/g, '');
    await env.DB.prepare("INSERT INTO agentsam_artifacts (id,user_id,tenant_id,workspace_id,name,artifact_type,r2_key,source,file_size_bytes,content_hash,r2_bucket,scope,visibility,project_key) VALUES (?,?,?,?,?,'cad-evidence',?,'sam.evidence',?,?,?,'user','private',?)")
      .bind(id, actor.actor, actor.tenant, actor.workspace, parts[parts.length - 1], key,
            data.byteLength, digest, BUCKET, project).run();
    receipt.db = { registered: true, artifactId: id };
  } catch { receipt.db.error = 'cad_evidence_registration_failed'; }
  return reply(receipt, 201);
}
