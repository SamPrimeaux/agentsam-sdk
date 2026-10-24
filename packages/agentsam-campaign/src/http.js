/**
 * Portable Campaign HTTP API v1 for D1/SQLite installations.
 * Integration contract:
 *
 *   handleCampaignApi(request, {
 *     authorize: async (request, { capability }) => ({
 *       db: authorizedInstallationDB,
 *       authorizedScopeId: serverResolvedScopeId,
 *       actorId: verifiedSessionUserId
 *     })
 *   })
 *
 * The host MUST authenticate/authorize every request first. This module never
 * takes tenant IDs, D1 UUIDs, destination URLs, roles or credentials from input.
 * A missing authorization resolver fails closed.
 */
import { createCampaignStore } from './storage.js';

const ROOT = '/api/campaigns/v1';
const ACCESS = Object.freeze({
  read: 'campaign.read',
  create: 'campaign.create',
  update: 'campaign.update',
  archive: 'campaign.archive',
});
function respond(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { 'cache-control':'no-store', ...headers } });
}
function failure(error, status) { return respond({ ok:false, error }, status); }
async function parseBody(request) {
  const raw = await request.text();
  if (raw.length > 262144) throw new Error('campaign_payload_too_large');
  let parsed;
  try { parsed = JSON.parse(raw || '{}'); } catch { throw new Error('invalid_json_body'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_json_body');
  return parsed;
}
function revision(request) {
  const raw = request.headers.get('if-match');
  const text = String(raw || '').replace(/^W\//, '').replace(/^"|"$/g, '');
  const n = Number(text);
  if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(n)) throw new Error('campaign_if_match_required');
  return n;
}
function operation(path, method) {
  if (path === ROOT + '/campaigns') {
    if (method === 'GET') return { action:'list', capability:ACCESS.read };
    if (method === 'POST') return { action:'create', capability:ACCESS.create };
  }
  const match = new RegExp('^' + ROOT + '/campaigns/([a-zA-Z0-9:_-]+)(?:/(materials|publications|metrics))?$').exec(path);
  if (!match) return null;
  const [,id,child] = match;
  if (child && method === 'GET') return { action:child, id, capability:ACCESS.read };
  if (child) return { action:'not_implemented', capability:'campaign.' + child + '.write' };
  if (method === 'GET') return { action:'get', id, capability:ACCESS.read };
  if (method === 'PATCH') return { action:'update', id, capability:ACCESS.update };
  if (method === 'DELETE') return { action:'archive', id, capability:ACCESS.archive };
  return null;
}
/**
 * Null: not a Campaign API URL.
 * This route currently supports safe CRUD + read models; approvals and
 * publish require dedicated channel adapters and signed execution receipts.
 */
export async function handleCampaignApi(request, options = {}) {
  const url = new URL(request.url);
  if (url.pathname !== ROOT && !url.pathname.startsWith(ROOT + '/')) return null;
  const route = operation(url.pathname, request.method.toUpperCase());
  if (!route) return failure('campaign_route_not_found', 404);
  if (typeof options.authorize !== 'function') return failure('campaign_authorizer_not_configured', 503);
  let actor;
  try { actor = await options.authorize(request, { capability:route.capability }); }
  catch { return failure('campaign_authorization_failed', 403); }
  if (!actor?.db?.prepare || !actor?.authorizedScopeId || !actor?.actorId) return failure('campaign_not_authorized', 403);
  if (route.action === 'not_implemented') return failure('campaign_execution_adapter_not_configured', 501);
  try {
    const store = createCampaignStore(actor.db, actor);
    const id = route.id;
    switch (route.action) {
      case 'list':
        return respond({ok:true, campaigns:await store.list({
          status:url.searchParams.get('status'),
          limit:Number(url.searchParams.get('limit')) || 50
        })});
      case 'get': {
        const campaign = await store.get(id);
        return campaign ? respond({ok:true,campaign},200,{ etag:'"' + campaign.revision + '"' }) : failure('campaign_not_found',404);
      }
      case 'create': {
        const campaign = await store.create(await parseBody(request));
        return respond({ok:true,campaign},201);
      }
      case 'update': {
        const campaign = await store.update(id,revision(request),await parseBody(request));
        return respond({ok:true,campaign},200,{ etag:'"' + campaign.revision + '"' });
      }
      case 'archive': {
        const campaign = await store.archive(id,revision(request));
        return respond({ok:true,campaign},200);
      }
      case 'materials': return respond({ok:true,materials:await store.materials(id)});
      case 'publications': return respond({ok:true,publications:await store.publications(id)});
      case 'metrics': return respond({ok:true,metrics:await store.metricFacts(id)});
      default: return failure('campaign_route_not_found',404);
    }
  } catch (error) {
    const code = String(error?.message || 'campaign_operation_failed');
    const status =
      /revision_required|if_match_required|revision_conflict|slug_conflict/.test(code) ? 409 :
      /not_found/.test(code) ? 404 :
      /not_provisioned/.test(code) ? 503 :
      /^invalid_|_required$|_empty$/.test(code) ? 400 : 500;
    return failure(status===500 ? 'campaign_operation_failed' : code,status);
  }
}
