/** Host session adapter: SDK Identity remains the authentication authority. */
import { createIdentityService, createCloudflareD1Adapter } from '@inneranimalmedia/agentsam-identity/server/worker-router';

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

/**
 * Every /admin document, asset or mutation belongs to the authenticated host.
 * A website theme can be authored without a site, never without an account.
 * Public discovery, signup and login live outside this boundary.
 */
export async function guardStudioAdminBoundary(request, { resolveUser, loginPath }) {
  const url = new URL(request.url);
  if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return null;
  if (/^\/admin\/login(?:\.html)?\/?$/.test(url.pathname)) {
    return new Response(null, { status: 302, headers: {
      location: new URL(loginPath + url.search, url.origin).toString(),
      'cache-control': 'private, no-store',
    } });
  }
  const denied = await guardStudioDocumentSession(request, { resolveUser, loginPath });
  if (denied?.status === 302 && !['GET', 'HEAD'].includes(request.method)) {
    return Response.json({ ok: false, error: 'unauthorized' }, {
      status: 401, headers: { 'cache-control': 'private, no-store' },
    });
  }
  return denied;
}

/** Resolve the canonical accounts.id for an already-verified session principal. */
export async function resolveStudioAccountIdForUser(db, userId) {
  if (!userId) return null;
  if (!db || typeof db.prepare !== 'function') throw new StudioIdentityUnavailableError();
  try {
    const account = await db.prepare(
      "SELECT id FROM accounts WHERE id = ? AND status = 'active' LIMIT 1",
    ).bind(userId).first();
    return account?.id ? String(account.id) : null;
  } catch {
    throw new StudioIdentityUnavailableError();
  }
}
