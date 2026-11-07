import assert from 'node:assert/strict';
import test from 'node:test';
import { sealOauthToken, oauthAad } from '../../../../packages/agentsam-vault/src/crypto/oauth-envelope.js';
import { handleIdeSourceRequest, isIdeSourceRequest, normalizeR2Listing } from './ide-source-service.js';

const owner='user_123';
const cloud='a'.repeat(32);
const vault='v'.repeat(64);
function get(path) {return new Request('https://agentsam.example'+path);}
async function parse(res){return {status:res.status,...await res.json()};}
async function fixture(provider,account,scopes,grantOwner=owner) {
  return {account_id:grantOwner,provider,account_identifier:account,
    is_active:1,revoked_at:null,expires_at:Math.floor(Date.now()/1000)+1800,
    scopes,metadata_json:JSON.stringify({display:account,cloudflare_account_id:provider==='cloudflare'?account:undefined}),
    access_token_encrypted:await sealOauthToken(vault,'unit-test-access',oauthAad(provider,grantOwner,account))};
}
function db(rows){
  return {prepare(sql){return {bind(...args){return {
    async first(){
      if(!sql.includes('user_oauth_tokens'))return null;
      return rows.find(row=>row.account_id===args[0]&&row.provider===(sql.includes("'cloudflare'")?'cloudflare':args[1])&&row.account_identifier===(sql.includes("'cloudflare'")?args[1]:args[2]))||null;
    },
    async all(){
      const filtered=rows.filter(row=>row.account_id===args[0]&&
        (sql.includes("'cloudflare'")?row.provider==='cloudflare':row.provider==='google_drive'));
      return {results:filtered};
    },
    async run(){return {meta:{changes:1}};}
  };}};}}
}
function env(rows){return {DB:db(rows),VAULT_MASTER_KEY:vault,GOOGLE_CLIENT_ID:'test-id',GOOGLE_CLIENT_SECRET:'test-secret'};}
test('Only the expected IDE paths match',()=>{
  assert.equal(isIdeSourceRequest('/api/work/ide/drive/file'),true);
  assert.equal(isIdeSourceRequest('/api/work/ide/r2/buckets'),true);
  assert.equal(isIdeSourceRequest('/api/work/ide/r2/buckets/../../abc'),false);
  assert.equal(isIdeSourceRequest('/api/work/connect/github/start'),false);
});
test('No anonymous read or implicit Drive account selection',async()=>{
  assert.equal((await handleIdeSourceRequest(get('/api/work/ide/drive/files'),env([]),'')).status,401);
  assert.equal((await handleIdeSourceRequest(get('/api/work/ide/drive/files'),env([]),owner)).status,400);
  assert.equal((await handleIdeSourceRequest(new Request('https://agentsam.example/api/work/ide/sources',{method:'POST'}),env([]),owner)).status,405);
});
test('Drive lists only explicitly chosen account and never returns OAuth credentials',async()=>{
  const a='a@example.com';const b='b@example.com';
  const rows=[await fixture('google_drive',a,'https://www.googleapis.com/auth/drive.file'),
              await fixture('google_drive',b,'https://www.googleapis.com/auth/drive.file')];
  let seen='';
  const fetchImpl=async (url,opts)=>{
    seen=String(url);
    assert.equal(opts.headers.authorization,'Bearer unit-test-access');
    return Response.json({files:[{id:'file_123',name:'workspace.md',mimeType:'text/markdown',version:'7',capabilities:{canDownload:true}}]});
  };
  const data=await parse(await handleIdeSourceRequest(get('/api/work/ide/drive/files?account='+encodeURIComponent(b)),env(rows),owner,{fetchImpl}));
  assert.equal(data.status,200);
  assert.equal(data.entries[0].name,'workspace.md');
  assert.equal(data.entries[0].readonly,true);
  assert.equal(JSON.stringify(data).includes('unit-test-access'),false);
  assert.ok(seen.includes('files?'));
  assert.ok(!seen.includes(a));
});
test('Drive missing grant and wrong granted scope fail before provider API calls',async()=>{
  const a='a@example.com';
  let invoked=false;
  const fetchImpl=async()=>{invoked=true;return Response.json({files:[]});};
  const rows=[await fixture('google_drive',a,'https://www.googleapis.com/auth/calendar.events')];
  const data=await parse(await handleIdeSourceRequest(get('/api/work/ide/drive/files?account='+a),env(rows),owner,{fetchImpl}));
  assert.equal(data.status,403);
  assert.equal(data.error,'oauth_insufficient_scope');
  assert.equal(invoked,false);
  const other=await parse(await handleIdeSourceRequest(get('/api/work/ide/drive/files?account='+a),env(rows),'unrelated_user',{fetchImpl}));
  assert.equal(other.status,401);
});
test('R2 listing preserves provider folder prefixes and verified ETags',()=>{
  const value=normalizeR2Listing({
    result:[{key:'src/a.ts',etag:'hash123',size:34,http_metadata:{contentType:'text/typescript'}}],
    result_info:{delimited:['src/'],cursor:'next',is_truncated:true},
  });
  assert.deepEqual(value.entries.map(x=>x.path),['src/','src/a.ts']);
  assert.equal(value.entries[1].version,'hash123');
  assert.equal(value.truncated,true);
});
test('Cloudflare OAuth scope gate rejects R2 account lacking read scopes',async()=>{
  const rows=[await fixture('cloudflare',cloud,'containers.read')];
  let called=false;
  const data=await parse(await handleIdeSourceRequest(get('/api/work/ide/r2/buckets?account='+cloud),env(rows),owner,{
    fetchImpl:async()=>{called=true;return Response.json({success:true,result:{buckets:[]}});}
  }));
  assert.equal(data.status,403);
  assert.equal(data.error,'cloudflare_permission_missing');
  assert.equal(called,false);
});
test('R2 OAuth-backed browse returns live provider data but not bearer credentials',async()=>{
  const rows=[await fixture('cloudflare',cloud,'workers-r2.read workers-r2-bucket-item.read')];
  let seen='';
  const data=await parse(await handleIdeSourceRequest(get('/api/work/ide/r2/objects?account='+cloud+'&bucket=my-bucket&prefix=src%2F'),env(rows),owner,{
    fetchImpl:async (url,opts)=>{
      seen=String(url);
      assert.equal(opts.headers.authorization,'Bearer unit-test-access');
      return Response.json({success:true,result:[{key:'src/index.ts',etag:'v1',size:7,http_metadata:{contentType:'text/plain'}}],result_info:{delimited:[],is_truncated:false}});
    }
  }));
  assert.equal(data.status,200);
  assert.equal(data.entries[0].path,'src/index.ts');
  assert.ok(seen.includes('/accounts/'+cloud+'/r2/buckets/my-bucket/objects'));
  assert.equal(JSON.stringify(data).includes('unit-test-access'),false);
});
test('Cloudflare control-plane scope cannot be silently promoted to container file access',async()=>{
  const rows=[await fixture('cloudflare',cloud,'containers.read')];
  const data=await parse(await handleIdeSourceRequest(get('/api/work/ide/containers/applications?account='+cloud),env(rows),owner,{
    fetchImpl:async()=>Response.json({success:true,result:[{id:'app1',name:'worker-editor'}]})
  }));
  assert.equal(data.status,200);
  assert.equal(data.applications[0].name,'worker-editor');
  assert.equal(data.filesystemAvailable,false);
});

test('Google Drive file read is bounded and explicitly read-only',async()=>{
  const email='a@example.com';
  const rows=[await fixture('google_drive',email,'https://www.googleapis.com/auth/drive.file')];
  const result=await parse(await handleIdeSourceRequest(get('/api/work/ide/drive/file?account='+email+'&id=file_123'),env(rows),owner,{
    fetchImpl:async url=>{
      if(String(url).includes('?fields='))return Response.json({
        id:'file_123',name:'notes.md',mimeType:'text/markdown',size:'11',version:'4',capabilities:{canDownload:true}
      });
      return new Response('hello world',{headers:{'content-type':'text/plain','content-length':'11'}});
    }
  }));
  assert.equal(result.status,200);
  assert.equal(result.file.content,'hello world');
  assert.equal(result.file.version,'4');
  assert.equal(result.file.readonly,true);
});
test('Drive file cannot be opened as an arbitrary binary file or over size limit',async()=>{
  const email='a@example.com';
  const rows=[await fixture('google_drive',email,'https://www.googleapis.com/auth/drive.file')];
  const token=env(rows);
  let requests=0;
  const result=await parse(await handleIdeSourceRequest(get('/api/work/ide/drive/file?account='+email+'&id=file_123'),token,owner,{
    fetchImpl:async()=>{requests++;return Response.json({id:'file_123',name:'photo.png',mimeType:'image/png',size:'15424',version:'4'});}
  }));
  assert.equal(result.status,415);
  assert.equal(result.error,'binary_file_not_editable');
  assert.equal(requests,1);
});
test('R2 object text read honors explicit jurisdiction and does not expose secrets',async()=>{
  const rows=[await fixture('cloudflare',cloud,'workers-r2-bucket-item.read')];
  const url='/api/work/ide/r2/file?account='+cloud+'&bucket=my-bucket&key=src%2Fnotes.md&jurisdiction=eu';
  const out=await parse(await handleIdeSourceRequest(get(url),env(rows),owner,{
    fetchImpl:async (resource,options)=>{
      assert.ok(String(resource).endsWith('/objects/src/notes.md'));
      assert.equal(options.headers['cf-r2-jurisdiction'],'eu');
      return new Response('hello R2',{headers:{'etag':'"etag-123"','content-type':'text/plain'}});
    }
  }));
  assert.equal(out.status,200);
  assert.equal(out.file.content,'hello R2');
  assert.equal(out.file.version,'etag-123');
  assert.equal(out.file.readonly,true);
  assert.equal(JSON.stringify(out).includes('unit-test-access'),false);
});
test('R2 rejects path traversal, unsupported jurisdiction and write verbs',async()=>{
  const rows=[await fixture('cloudflare',cloud,'workers-r2-bucket-item.read')];
  const f=async()=>{throw Error('must not call provider');};
  const key=encodeURIComponent('../private.md');
  const base='/api/work/ide/r2/file?account='+cloud+'&bucket=my-bucket&key='+key;
  assert.equal((await handleIdeSourceRequest(get(base),env(rows),owner,{fetchImpl:f})).status,400);
  assert.equal((await handleIdeSourceRequest(get(base+'&jurisdiction=bad'),env(rows),owner,{fetchImpl:f})).status,400);
  assert.equal((await handleIdeSourceRequest(new Request('https://agentsam.example/api/work/ide/r2/file',{method:'POST'}),env(rows),owner,{fetchImpl:f})).status,405);
});

test('Drive text edit uses existing OAuth grant and rejects stale document version before upload',async()=>{
  const account='write@example.com';
  const rows=[await fixture('google_drive',account,'https://www.googleapis.com/auth/drive.file')];
  let uploads=0;
  const fetchImpl=async(url,options)=>{
    assert.equal(options.headers.authorization,'Bearer unit-test-access');
    if(String(url).includes('/upload/')){
      uploads++;
      assert.equal(options.method,'PATCH');
      assert.equal(new TextDecoder().decode(options.body),'Updated markdown');
      return Response.json({id:'file_123',version:'4'});
    }
    return Response.json({id:'file_123',name:'workspace.md',mimeType:'text/markdown',version:'3',size:50,
      capabilities:{canDownload:true,canEdit:true}});
  };
  const url='/api/work/ide/drive/file?account='+encodeURIComponent(account)+'&id=file_123';
  const makePut=version=>new Request('https://agentsam.example'+url,{method:'PUT',
    headers:{'content-type':'application/json'},body:JSON.stringify({id:'file_123',content:'Updated markdown',expectedVersion:version})});
  const stale=await parse(await handleIdeSourceRequest(makePut('2'),env(rows),owner,{fetchImpl}));
  assert.equal(stale.status,409);assert.equal(stale.error,'version_conflict');assert.equal(uploads,0);
  const saved=await parse(await handleIdeSourceRequest(makePut('3'),env(rows),owner,{fetchImpl}));
  assert.equal(saved.status,200);assert.equal(saved.file.version,'4');assert.equal(uploads,1);
  assert.equal(JSON.stringify(saved).includes('unit-test-access'),false);
});
test('Drive readonly grant cannot write even when file claims canEdit',async()=>{
  const account='readonly@example.com';
  const rows=[await fixture('google_drive',account,'https://www.googleapis.com/auth/drive.readonly')];
  let uploads=0;
  const url='/api/work/ide/drive/file?account='+encodeURIComponent(account)+'&id=file_123';
  const data=await parse(await handleIdeSourceRequest(new Request('https://agentsam.example'+url,{method:'PUT',
    headers:{'content-type':'application/json'},body:JSON.stringify({id:'file_123',content:'No',expectedVersion:'3'})}),env(rows),owner,{fetchImpl:async()=>{
      uploads++;return Response.json({id:'file_123',name:'file.md',mimeType:'text/markdown',version:'3',capabilities:{canEdit:true,canDownload:true}});
    }}));
  assert.equal(data.status,403);assert.equal(data.error,'drive_write_not_permitted');assert.equal(uploads,1);
});
