/**
 * Delegate a specifically authorized CMS operation to the owning Worker.
 *
 * The service binding name is resolved from deploy-time bindings, never from a
 * user URL, personal CF token, site name heuristic or shared D1 shadow.
 */
import { signCmsBridgeRequest } from '../../../../ecommerce-cms-agentsam/backend/cms/studio-bridge-protocol.js';
import { isAllowedStudioCmsBridgeRoute } from '../../../../ecommerce-cms-agentsam/backend/cms/studio-bridge.js';

function response(error, status) {
  return Response.json({ ok: false, error }, { status, headers: { 'cache-control': 'no-store' } });
}

function bindingForWorker(env, workerName) {
  let mapping;
  try { mapping = JSON.parse(String(env.CMS_SITE_BRIDGES || '{}')); }
  catch { return null; }
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return null;
  const binding = mapping[workerName];
  if (typeof binding !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(binding)) return null;
  // Explicitly provisioned service bindings only, never arbitrary network fetch.
  const service = env[binding];
  return service && typeof service.fetch === 'function' ? service : null;
}

/** Never allow callers to select arbitrary FNF admin endpoints. */
export async function handleRemoteCmsRequest(request, env, { actorUserId, site, path }) {
  if (!site || site.source !== 'worker' || !site.worker_id) return response('cms_remote_site_required', 400);
  if (!actorUserId || !site.can_edit && request.method !== 'GET') return response('cms_remote_permission_denied', 403);
  if (/\/publish$/.test(path) && !site.can_publish) return response('cms_remote_publish_forbidden', 403);
  const method = request.method.toUpperCase();
  if (!isAllowedStudioCmsBridgeRoute(path, method)) return response('cms_remote_operation_denied', 403);
  const service = bindingForWorker(env, site.worker_id);
  if (!service) return response('cms_remote_worker_binding_not_configured', 503);
  if (!env.CMS_BRIDGE_SECRET) return response('cms_bridge_secret_not_configured', 503);

  const input = new URL(request.url);
  const destination = new URL('https://cms-worker.internal/api/internal/studio-cms/' + path);
  // Deliberately pass only relevant upstream query params, not user auth tokens.
  for (const [key, val] of input.searchParams.entries()) if (key !== 'site') destination.searchParams.append(key, val);

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const clone = request.clone();
  const opts = { method, headers };
  if (!['GET', 'HEAD'].includes(method)) opts.body = clone.body;
  const remoteRequest = new Request(destination, opts);
  const signature = await signCmsBridgeRequest(remoteRequest, {
    secret: env.CMS_BRIDGE_SECRET,
    actor: actorUserId,
    project: site.project_id,
  });
  for (const [k,v] of Object.entries(signature)) remoteRequest.headers.set(k,v);

  try {
    const upstream = await service.fetch(remoteRequest);
    const out = new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
    return out;
  } catch (cause) {
    console.error('cms_remote_bridge_failed', String(cause?.name || cause));
    return response('cms_remote_worker_unreachable', 502);
  }
}
