import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioIdentityUnavailableError, resolveStudioSessionUser, guardStudioDocumentSession, guardStudioAdminBoundary } from './studio-session.js';

const app = {id:'local-studio'};
const DB = {prepare(){throw new Error('identity test factory owns the session lookup');}};
const request = (path='/settings/themes') => new Request('https://studio.example'+path,{headers:{cookie:'opaque-session=example'}});
const options = (sessionFromRequest) => ({app,routeRegistry:{},createIdentity:()=>({sessionFromRequest})});

test('credential absence does not query identity or require a datastore', async () => {
  const user=await resolveStudioSessionUser(new Request('https://studio.example/admin/home'),{},options(()=>{throw Error('must not query');}));
  assert.equal(user,null);
});
test('the resolver passes the original request to the existing identity authority', async () => {
  const source=request();let observed;
  const user=await resolveStudioSessionUser(source,{DB},options(async req=>{observed=req;return {user:{id:'account-a'}};}));
  assert.equal(observed,source);assert.equal(user.id,'account-a');
});
test('a verified expired session is absent; missing DB and lookup failures are unavailable', async () => {
  assert.equal(await resolveStudioSessionUser(request(),{DB},options(async()=>null)),null);
  await assert.rejects(resolveStudioSessionUser(request(),{},options(async()=>null)),StudioIdentityUnavailableError);
  await assert.rejects(resolveStudioSessionUser(request(),{DB},options(async()=>{throw Error('private database detail');})),StudioIdentityUnavailableError);
});
test('all document paths preserve their requested destination on verified absence', async () => {
  for(const path of ['/admin/home','/admin/agentsam','/admin/cad','/admin/moviemode','/settings/themes?filter=mine','/artifacts','/collaborate']) {
    const response=await guardStudioDocumentSession(request(path),{resolveUser:async()=>null,loginPath:'/auth/login'});
    assert.equal(response.status,302);const target=new URL(response.headers.get('location'));
    assert.equal(target.pathname,'/auth/login');assert.equal(target.searchParams.get('next'),path);
    assert.match(response.headers.get('cache-control'),/no-store/);
  }
});
test('identity outage returns a retryable 503, never a login redirect or permissive fallthrough', async () => {
  const response=await guardStudioDocumentSession(request(),{resolveUser:async()=>{throw new StudioIdentityUnavailableError();},loginPath:'/auth/login'});
  assert.equal(response.status,503);assert.equal(response.headers.get('location'),null);
  assert.equal(response.headers.get('retry-after'),'5');
  assert.deepEqual(await response.json(),{ok:false,error:'identity_unavailable',retryable:true});
});
test('only a verified principal permits the document and unrelated failures still fail closed', async () => {
  assert.equal(await guardStudioDocumentSession(request(),{resolveUser:async()=>({id:'account-a'}),loginPath:'/auth/login'}),null);
  await assert.rejects(guardStudioDocumentSession(request(),{resolveUser:async()=>{throw Error('unexpected');},loginPath:'/auth/login'}));
});

test('an anonymous user cannot cross any admin route, including site-free Theme Studio', async () => {
  const next = '/admin/theme-project-editor?scope=studio&project=theme_plain-jane';
  for (const route of ['/admin', '/admin/', '/admin/store?theme_sku=iam.theme.plain-jane&action=try',
    next, '/admin/theme-code-editor?scope=studio&project=theme_plain-jane',
    '/admin/host-config.js', '/admin/custom-random-route']) {
    const denied = await guardStudioAdminBoundary(new Request('https://studio.example' + route), {
      resolveUser: async () => null, loginPath: '/auth/login',
    });
    assert.equal(denied.status, 302, route);
    const login = new URL(denied.headers.get('location'));
    assert.equal(login.pathname, '/auth/login');
    assert.equal(login.searchParams.get('next'), route);
    assert.equal(denied.headers.get('cache-control'), 'private, no-store');
  }
});

test('admin mutations require a real account, not an untrusted client identity', async () => {
  const request = new Request('https://studio.example/admin/theme-project-editor', {
    method: 'POST', headers: { 'x-account-id': 'claimed-account' },
  });
  const denied = await guardStudioAdminBoundary(request, {
    resolveUser: async () => null, loginPath: '/auth/login',
  });
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).error, 'unauthorized');
});

test('admin routing requires verified identity and fails closed when identity is unavailable', async () => {
  const request = new Request('https://studio.example/admin/theme-project-editor?scope=studio');
  assert.equal(await guardStudioAdminBoundary(request, {
    resolveUser: async () => ({ id: 'real-session-account' }), loginPath: '/auth/login',
  }), null);
  const unavailable = await guardStudioAdminBoundary(request, {
    resolveUser: async () => { throw new StudioIdentityUnavailableError(); }, loginPath: '/auth/login',
  });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('location'), null);
  const publicRoute = await guardStudioAdminBoundary(new Request('https://studio.example/auth/signup'), {
    resolveUser: async () => { throw Error('identity must not be checked for signup'); },
    loginPath: '/auth/login',
  });
  assert.equal(publicRoute, null);
  const loginAlias = await guardStudioAdminBoundary(new Request('https://studio.example/admin/login'), {
    resolveUser: async () => { throw Error('login alias must remain reachable'); }, loginPath: '/auth/login',
  });
  assert.equal(new URL(loginAlias.headers.get('location')).pathname, '/auth/login');
});
