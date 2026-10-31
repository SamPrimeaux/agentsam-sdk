import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioIdentityUnavailableError, resolveStudioSessionUser, guardStudioDocumentSession } from './studio-session.js';

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
