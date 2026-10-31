/** Browser projection of the host identity authority. No credentials are persisted here. */
export type BrowserIdentityUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  isDevFallback: false;
};
export type BrowserIdentityRuntime = 'iam' | 'better-auth';
export type BrowserSessionSnapshot = {
  user: BrowserIdentityUser | null;
  isPending: boolean;
  error: string | null;
};
export const PENDING_BROWSER_SESSION: BrowserSessionSnapshot = {
  user: null, isPending: true, error: null,
};

function normalizeUser(raw: unknown): BrowserIdentityUser {
  if (!raw || typeof raw !== 'object') throw new Error('identity_response_invalid');
  const user = raw as Record<string, unknown>;
  if (typeof user.id !== 'string' || !user.id.trim()) throw new Error('identity_response_invalid');
  const text = (...values: unknown[]) => values.find(value => typeof value === 'string') as string | undefined;
  return {
    id: user.id,
    displayName: text(user.displayName, user.display_name, user.name) ?? null,
    primaryEmail: text(user.email) ?? null,
    profileImageUrl: text(user.avatar_url, user.image) ?? null,
    isDevFallback: false,
  };
}

/**
 * IAM /me is authoritative for the installed Worker. The original local/preview
 * Better Auth host can explicitly report that /me is unsupported; only then
 * negotiate its existing get-session endpoint. A missing session is never a
 * reason to try another identity authority.
 */
export function createBrowserSessionStore(options: {
  fetch: typeof fetch;
  bearer?: () => string | null;
}) {
  let snapshot = PENDING_BROWSER_SESSION;
  let runtime: BrowserIdentityRuntime | undefined;
  let inFlight: Promise<void> | undefined;
  let revision = 0;
  const listeners = new Set<() => void>();
  const publish = (next: BrowserSessionSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const request = async (path: string, method = 'GET') => {
    const headers = new Headers({ accept: 'application/json' });
    const token = options.bearer?.();
    if (token) headers.set('authorization', `Bearer ${token}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      return await options.fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers, signal: controller.signal });
    } finally { clearTimeout(timeout); }
  };
  const read = async () => {
    let active = runtime ?? 'iam';
    let response = await request(active === 'iam' ? '/api/auth/me' : '/api/auth/get-session');
    if (!runtime && (response.status === 404 || response.status === 405)) {
      active = 'better-auth';
      response = await request('/api/auth/get-session');
    }
    if (response.status === 401) {
      return { runtime: active, user: null };
    }
    if (!response.ok) throw new Error('identity_service_unavailable');
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('identity_response_invalid');
    const body = await response.json();
    if (active === 'iam') {
      if (!body || body.ok !== true || body.authenticated !== true) throw new Error('identity_response_invalid');
      const user = normalizeUser(body.user);
      return { runtime: active, user };
    } else {
      // Better Auth represents an absent session with a successful JSON null.
      if (body !== null && (!body || !body.user)) throw new Error('identity_response_invalid');
      const user = body === null ? null : normalizeUser(body.user);
      return { runtime: active, user };
    }
  };
  const refresh = (force = false): Promise<void> => {
    if (inFlight && !force) return inFlight;
    const requestRevision = ++revision;
    const pending = read().then(result => {
      if (requestRevision !== revision) return;
      runtime = result.runtime;
      publish({ user: result.user, isPending: false, error: null });
    }).catch(() => {
      if (requestRevision !== revision) return;
      // A transport failure never revokes a previously verified identity and
      // never masquerades as signed out on the initial load.
      publish({ ...snapshot, isPending: snapshot.user === null, error: 'Your account could not be checked. Retry when the connection is available.' });
    }).finally(() => { if (inFlight === pending) inFlight = undefined; });
    inFlight = pending;
    return pending;
  };
  return {
    getSnapshot: () => snapshot,
    getRuntime: () => runtime,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh,
    async signOut() {
      if (!runtime) await refresh();
      if (!runtime) throw new Error('Identity is unavailable. Please retry.');
      const response = await request(runtime === 'iam' ? '/api/auth/logout' : '/api/auth/sign-out', 'POST');
      if (!response.ok) throw new Error('Sign-out failed. You are still signed in. Please retry.');
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('identity_response_invalid');
      const body = await response.json();
      if (runtime === 'iam' ? body?.ok !== true : body?.success !== true) throw new Error('Sign-out was not confirmed. Please retry.');
      revision += 1; // Ignore any account read that began before confirmed logout.
      publish({ user: null, isPending: false, error: null });
    },
  };
}
