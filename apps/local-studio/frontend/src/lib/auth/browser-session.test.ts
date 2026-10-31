import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserSessionStore } from './browser-session.ts';
const iamUser = { id: 'account-a', displayName: 'Example', email: 'example@example.com' };
const iam = () => Response.json({ ok: true, authenticated: true, user: iamUser });

test('all browser consumers share the canonical IAM read and normalized principal', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  let release: ((response: Response) => void) | undefined;
  const store = createBrowserSessionStore({ fetch: (async (path, init) => {
    calls.push({ path: String(path), init });
    return new Promise<Response>(resolve => { release = resolve; });
  }) as typeof fetch });
  const first = store.refresh();
  const second = store.refresh();
  assert.equal(first, second);
  assert.equal(store.getSnapshot().isPending, true);
  release!(iam());
  await first;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/auth/me');
  assert.equal(calls[0].init?.credentials, 'same-origin');
  assert.equal(store.getSnapshot().user?.id, 'account-a');
  assert.equal(store.getSnapshot().user?.primaryEmail, 'example@example.com');
  assert.equal(store.getSnapshot().user?.isDevFallback, false);
  assert.equal(store.getSnapshot().isPending, false);
  assert.equal(store.getRuntime(), 'iam');
});

test('an absent IAM session is authoritative and never probes another auth provider', async () => {
  const calls: string[] = [];
  const store = createBrowserSessionStore({ fetch: (async path => {
    calls.push(String(path)); return Response.json({ error: 'session_required' }, { status: 401 });
  }) as typeof fetch });
  await store.refresh();
  assert.deepEqual(calls, ['/api/auth/me']);
  assert.deepEqual(store.getSnapshot(), { user: null, isPending: false, error: null });
});

test('explicit endpoint absence supports the existing local Better Auth host', async () => {
  const calls: string[] = [];
  const store = createBrowserSessionStore({ fetch: (async path => {
    calls.push(String(path));
    return path === '/api/auth/me' ? new Response(null, { status: 404 }) : Response.json({ user: { id: 'local-user', name: 'Local user' }, session: {} });
  }) as typeof fetch });
  await store.refresh();
  await store.refresh();
  assert.deepEqual(calls, ['/api/auth/me', '/api/auth/get-session', '/api/auth/get-session']);
  assert.equal(store.getSnapshot().user?.displayName, 'Local user');
  assert.equal(store.getRuntime(), 'better-auth');
});

test('transport, 5xx and malformed responses cannot masquerade as signed out', async () => {
  for (const failure of [() => { throw new Error('offline'); }, () => new Response(null, {status:503}), () => new Response('<html>fallback</html>', { headers: {'content-type':'text/html'} }), () => Response.json({ok:true})]) {
    let failing = true;
    const calls: string[] = [];
    const store = createBrowserSessionStore({ fetch: (async path => { calls.push(String(path)); return failing ? failure() : iam(); }) as typeof fetch });
    await store.refresh();
    assert.equal(store.getSnapshot().isPending, true);
    assert.ok(store.getSnapshot().error);
    assert.deepEqual(calls, ['/api/auth/me']);
    failing = false;
    await store.refresh();
    assert.equal(store.getSnapshot().user?.id, 'account-a');
    failing = true;
    await store.refresh();
    assert.equal(store.getSnapshot().user?.id, 'account-a');
    assert.equal(store.getSnapshot().isPending, false);
    assert.ok(store.getSnapshot().error);
  }
});

test('session expiry clears the prior principal only on authoritative 401', async () => {
  let expired = false;
  const store = createBrowserSessionStore({ fetch: (async () => expired ? Response.json({}, {status:401}) : iam()) as typeof fetch });
  await store.refresh(); expired = true; await store.refresh();
  assert.deepEqual(store.getSnapshot(), {user:null,isPending:false,error:null});
});

test('IAM sign-out uses its actual logout contract and failed sign-out retains identity', async () => {
  let fail = true;
  const calls: Array<{path:string; method?:string}> = [];
  const store = createBrowserSessionStore({ fetch: (async (path, init) => {
    calls.push({path:String(path),method:init?.method});
    return path === '/api/auth/me' ? iam() : fail ? Response.json({error:'unavailable'}, {status:503}) : Response.json({ok:true});
  }) as typeof fetch });
  await store.refresh();
  await assert.rejects(store.signOut());
  assert.equal(store.getSnapshot().user?.id, 'account-a');
  fail = false; await store.signOut();
  assert.deepEqual(calls.slice(1), [{path:'/api/auth/logout',method:'POST'},{path:'/api/auth/logout',method:'POST'}]);
  assert.equal(store.getSnapshot().user, null);
});

test('preview bearer forwarding remains request-scoped and no credentials are stored', async () => {
  let token = 'preview-example-token';
  const seen: Array<string|null> = [];
  const store = createBrowserSessionStore({ bearer:()=>token, fetch:(async (_path, init) => { seen.push(new Headers(init?.headers).get('authorization')); return iam(); }) as typeof fetch });
  await store.refresh(); token = ''; await store.refresh();
  assert.deepEqual(seen, ['Bearer preview-example-token',null]);
});


test('late account reads cannot restore a principal after confirmed logout', async () => {
  let calls = 0;
  let release: ((response: Response) => void) | undefined;
  const store = createBrowserSessionStore({fetch:(async path => {
    if (path === '/api/auth/logout') return Response.json({ok:true});
    if (++calls === 1) return iam();
    return new Promise<Response>(resolve => { release = resolve; });
  }) as typeof fetch});
  await store.refresh();
  const stale = store.refresh();
  await store.signOut();
  release!(iam()); await stale;
  assert.deepEqual(store.getSnapshot(), {user:null,isPending:false,error:null});
});

test('explicit post-login refresh supersedes an older unauthenticated request', async () => {
  let calls = 0;
  let release: ((response: Response) => void) | undefined;
  const store = createBrowserSessionStore({fetch:(async () => {
    if (++calls > 1) return iam();
    return new Promise<Response>(resolve => { release = resolve; });
  }) as typeof fetch});
  const old = store.refresh();
  await store.refresh(true);
  release!(Response.json({}, {status:401})); await old;
  assert.equal(store.getSnapshot().user?.id, 'account-a');
});
