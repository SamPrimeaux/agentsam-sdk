import assert from 'node:assert/strict';
import test from 'node:test';
import { sealOauthToken, oauthAad } from '../../../../packages/agentsam-vault/src/crypto/oauth-envelope.js';
import { handleIdeSourceRequest, isIdeSourceRequest } from './ide-source-service.js';

const owner='user_one',account='developer',vault='v'.repeat(64);
const sha='a'.repeat(40),nextSha='b'.repeat(40);
const get=path=>new Request('https://studio.example'+path);
const parse=async r=>({status:r.status,...await r.json()});
const params=new URLSearchParams({account,repo:'Example/my-app',branch:'main'});
async function env(grantedOwner=owner,scopes='read:user user:email repo'){
  const row={account_id:grantedOwner,provider:'github',account_identifier:account,
    is_active:1,revoked_at:null,expires_at:0,scopes,
    access_token_encrypted:await sealOauthToken(vault,'token-secret',oauthAad('github',grantedOwner,account))};
  return {VAULT_MASTER_KEY:vault,DB:{prepare(){return {bind(...args){return {async first(){
    return row.account_id===args[0]&&row.account_identifier===args[1]?row:null;
  }};}};}}};
}
test('GitHub files use the authorized source route, not arbitrary URLs',()=>{
  assert.equal(isIdeSourceRequest('/api/work/ide/github/repos'),true);
  assert.equal(isIdeSourceRequest('/api/work/ide/github/file'),true);
  assert.equal(isIdeSourceRequest('/api/work/ide/github/../../../secrets'),false);
});
test('GitHub requires explicit OAuth account and ownership',async()=>{
  const grant=await env();
  assert.equal((await parse(await handleIdeSourceRequest(get('/api/work/ide/github/repos'),grant,owner))).status,401);
  assert.equal((await parse(await handleIdeSourceRequest(get('/api/work/ide/github/repos?account='+account),grant,'other'))).status,401);
  // App user tokens have no OAuth repo scope; installed repository permissions
  // are resolved from GitHub instead of a legacy token scopes string.
  const appToken=await parse(await handleIdeSourceRequest(get('/api/work/ide/github/repos?account='+account),await env(owner,''),owner,{
    fetchImpl:async()=>Response.json({total_count:0,installations:[]}),
  }));
  assert.equal(appToken.status,200);
});
test('GitHub lists only connected OAuth account repos and returns no token',async()=>{
  let called=0;
  const response=await parse(await handleIdeSourceRequest(get('/api/work/ide/github/repos?account='+account),await env(),owner,{
    fetchImpl:async(url,opts)=>{
      assert.equal(opts.headers.authorization,'Bearer token-secret');called++;
      if(String(url).includes('/user/installations?'))
        return Response.json({total_count:1,installations:[{id:1234,permissions:{contents:'write'}}]});
      assert.ok(String(url).includes('/user/installations/1234/repositories?'));
      return Response.json({total_count:1,repositories:[{full_name:'Example/my-app',default_branch:'main',permissions:{push:true}}]});
    },
  }));
  assert.equal(response.status,200);assert.equal(called,2);
  assert.equal(response.repositories[0].fullName,'Example/my-app');
  assert.equal(response.repositories[0].canPush,true);
  assert.equal(JSON.stringify(response).includes('token-secret'),false);
});
test('GitHub reads lazily selected folders and validates SHA-based file reads',async()=>{
  const grant=await env();
  const folder=await parse(await handleIdeSourceRequest(get('/api/work/ide/github/tree?'+params),grant,owner,{
    fetchImpl:async(url)=>{assert.ok(String(url).includes('/repos/Example/my-app/contents?ref=main'));
      return Response.json([{type:'dir',path:'src',name:'src'},{type:'file',path:'README.md',name:'README.md',sha,size:18}]);},
  }));
  assert.equal(folder.status,200);assert.deepEqual(folder.entries.map(x=>x.name),['src','README.md']);
  const fileParams=new URLSearchParams(params);fileParams.set('path','src/hello.md');
  const file=await parse(await handleIdeSourceRequest(get('/api/work/ide/github/file?'+fileParams),grant,owner,{
    fetchImpl:async(url)=>{
      assert.ok(String(url).includes('/contents/src/hello.md?ref=main'));
      return Response.json({type:'file',path:'src/hello.md',name:'hello.md',size:15,sha,
        encoding:'base64',content:btoa('Hello GitHub!')});},
  }));
  assert.equal(file.status,200);assert.equal(file.file.content,'Hello GitHub!');
  assert.equal(file.file.version,sha);
});
test('GitHub write uses exact expected SHA, selected branch, and no silent overwrite',async()=>{
  const grant=await env(),p=new URLSearchParams(params);p.set('path','README.md');
  const req=new Request('https://studio.example/api/work/ide/github/file?'+p,{method:'PUT',headers:{'content-type':'application/json'},
    body:JSON.stringify({path:'README.md',branch:'main',content:'updated',expectedSha:sha})});
  const response=await parse(await handleIdeSourceRequest(req,grant,owner,{
    fetchImpl:async(url,opts)=>{
      assert.equal(opts.method,'PUT');
      const body=JSON.parse(opts.body);
      assert.equal(body.sha,sha);assert.equal(body.branch,'main');
      assert.equal(atob(body.content),'updated');
      return Response.json({content:{sha:nextSha}});
    },
  }));
  assert.equal(response.status,200);assert.equal(response.file.version,nextSha);
  const rejected=await parse(await handleIdeSourceRequest(new Request(req.url,{method:'PUT',
    body:JSON.stringify({path:'README.md',branch:'main',content:'changed',expectedSha:'unverified'})}),grant,owner,{
    fetchImpl:async()=>{throw Error('should not call GitHub');},
  }));
  assert.equal(rejected.status,400);
  const conflictingRequest=new Request(req.url,{method:'PUT',headers:{'content-type':'application/json'},
    body:JSON.stringify({path:'README.md',branch:'main',content:'updated',expectedSha:sha})});
  const conflicting=await parse(await handleIdeSourceRequest(conflictingRequest,grant,owner,{fetchImpl:async()=>new Response('{}',{status:409})}));
  assert.equal(conflicting.status,409);assert.equal(conflicting.error,'version_conflict');
});
test('GitHub rejects invalid repository, branch, and cross-directory file requests',async()=>{
  const grant=await env();
  const reject=['/api/work/ide/github/tree?account=developer&repo=bad&branch=main',
    '/api/work/ide/github/tree?account=developer&repo=Example%2Fmy-app&branch=feature..bad',
    '/api/work/ide/github/file?account=developer&repo=Example%2Fmy-app&branch=main&path=..%2Fsecret'];
  for(const path of reject)assert.equal((await parse(await handleIdeSourceRequest(get(path),grant,owner))).status,400);
});
