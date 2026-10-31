/** Host session adapter: SDK Identity remains the authentication authority. */
import { createIdentityService, createCloudflareD1Adapter } from '../../../../packages/identity/src/server/worker-router.js';

export class StudioIdentityUnavailableError extends Error {
  constructor() { super('identity_unavailable'); this.name = 'StudioIdentityUnavailableError'; }
}

export async function resolveStudioSessionUser(request, env, options) {
  if (!request.headers.get('cookie') && !request.headers.get('authorization')) return null;
  if (!env.DB) throw new StudioIdentityUnavailableError();
  try {
    const identity = (options.createIdentity || createIdentityService)({
      adapter: createCloudflareD1Adapter(env.DB), app: options.app, routeRegistry: options.routeRegistry,
    });
    const ctx = await identity.sessionFromRequest(request);
    return ctx?.user?.id ? ctx.user : null;
  } catch {
    // A storage/adapter failure must not revoke identity or become a login loop.
    // Do not expose database errors, cookies or bearer values in the response.
    throw new StudioIdentityUnavailableError();
  }
}

/** Null permits rendering. Only verified absence redirects to the owned portal. */
export async function guardStudioDocumentSession(request, { resolveUser, loginPath }) {
  try {
    if (await resolveUser()) return null;
  } catch (error) {
    if (!(error instanceof StudioIdentityUnavailableError)) throw error;
    return Response.json({ ok: false, error: 'identity_unavailable', retryable: true }, {
      status: 503, headers: { 'cache-control': 'private, no-store', 'retry-after': '5' },
    });
  }
  const url = new URL(request.url);
  const login = new URL(loginPath, url.origin);
  login.searchParams.set('next', url.pathname + url.search);
  return new Response(null, {status:302,headers:{location:login.toString(),'cache-control':'private, no-store'}});
}
