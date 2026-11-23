import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  listAccountLibraryResources,
  serveAccountLibraryFile,
  mutateAccountLibraryArtifact,
} from './work-library-resources.js';

function dbHarness({ rows = {}, fileRow = null, existingRow = null, runResult = { meta: { changes: 1 } } } = {}) {
  const calls = [];
  const DB = {
    prepare(sql) {
      const call = { sql, values: [] };
      calls.push(call);
      return {
        bind(...values) {
          call.values = values;
          return {
            async all() {
              if (sql.includes('FROM agentsam_artifacts')) return { results: rows.artifacts || [] };
              if (sql.includes('FROM cms_assets')) return { results: rows.cmsAssets || [] };
              if (sql.includes('FROM media_assets')) return { results: rows.media || [] };
              if (sql.includes('FROM cms_artifacts')) return { results: rows.cmsArtifacts || [] };
              return { results: [] };
            },
            async first() {
              if (sql.includes('SELECT r2_bucket')) return fileRow;
              if (sql.includes('SELECT id FROM agentsam_artifacts')) return existingRow;
              return null;
            },
            async run() { return runResult; },
          };
        },
      };
    },
  };
  return { DB, calls };
}

const artifactRow = (overrides = {}) => ({
  id: 'art_1', name: 'DreamHouse.glb', artifact_type: 'cad-scene', mime_type: 'model/gltf-binary',
  file_size_bytes: 2048, updated_at: 1762500000, thumbnail_r2_key: 'thumbs/dreamhouse.webp',
  preview_r2_key: null, public_url: 'https://public.example/private.glb', thumbnail_url: null,
  preview_url: null, is_public: 0, archived_at: null, metadata_json: '{"library":{"starred":true}}',
  r2_bucket: 'cad', r2_key: 'users/owner_1/dreamhouse.glb', ...overrides,
});

test('account Library aggregates only owner-scoped source records and preserves provider identity', async () => {
  const h = dbHarness({ rows: {
    artifacts: [artifactRow()],
    cmsAssets: [{ id: 'cms_1', filename: 'logo.png', label: 'Logo', mime_type: 'image/png', category: 'brand', size: 1024,
      thumbnail_url: '/api/cms/assets/cms_1/thumbnail', public_url: 'https://cdn.example/logo.png', updated_at: 1762500000, site_name: 'InnerAnimalMedia' }],
    media: [{ id: 'media_1', filename: 'launch.mp4', media_kind: 'video', content_type: 'video/mp4', size_bytes: 4096,
      provider: 'cloudflare_stream', source_uri: 'https://customer.cloudflarestream.com/uid/manifest/video.m3u8',
      provider_resource_id: 'stream_uid_1', updated_at: 1762500000, status: 'ready', duration_ms: 3000 }],
    cmsArtifacts: [{ id: 'cms_art_1', artifact_key: 'home-page', artifact_type: 'page-build', content_mode: 'bundle',
      created_at: '2026-11-20 09:00:00', version: '1', status: 'ready', metadata_json: '{}' }],
  } });

  const items = await listAccountLibraryResources(h.DB, 'owner_1');
  assert.equal(items.length, 4);
  assert.equal(items[0].id, 'artifact:art_1');
  assert.equal(items[0].kind, 'model');
  assert.equal(items[0].open, '/api/work/library/artifacts/art_1/file');
  assert.equal(items[0].preview, '/api/work/library/artifacts/art_1/file?preview=1');
  assert.equal(items[0].starred, true);
  assert.equal(items[1].open, 'https://cdn.example/logo.png');
  assert.equal(items[1].sourceLabel, 'CMS · InnerAnimalMedia');
  assert.equal(items[2].source, 'stream');
  assert.equal(items[2].providerId, 'stream_uid_1');
  assert.equal(items[3].resourceType, 'cms-artifact');
  assert.equal(items[3].open, null);
  assert.equal(h.calls.length, 4);
  assert.ok(h.calls.every(call => call.values.length === 1 && call.values[0] === 'owner_1'));
});

test('archived and unsafe external resources retain safe state without unsafe navigation', async () => {
  const h = dbHarness({ rows: {
    artifacts: [artifactRow({ archived_at: 1762500000, is_public: 1, public_url: 'javascript:alert(1)' })],
    cmsAssets: [{ id: 'cms_bad', filename: 'bad.png', label: 'Bad image', mime_type: 'image/png', category: 'brand', size: 1,
      thumbnail_url: '/\\evil.example/image.png', public_url: 'javascript:alert(1)', updated_at: 1762500000, site_name: 'Test' }],
  } });
  const items = await listAccountLibraryResources(h.DB, 'owner_1');
  assert.equal(items[0].deleted, true);
  assert.equal(items[0].open, '/api/work/library/artifacts/art_1/file');
  assert.equal(items[1].open, null);
  assert.equal(items[1].preview, null);
});

test('existing first-party artifact delivery remains owner-scoped without adding R2 bindings', async () => {
  const bindings = [
    ['artifacts', 'ARTIFACTS'],
    ['inneranimalmedia-autorag', 'AUTORAG_BUCKET'],
  ];
  for (const [bucketName, bindingName] of bindings) {
    const reads = [];
    const bucket = { async get(key) {
      reads.push(key);
      return { body: new Blob(['private payload']).stream(), httpMetadata: { contentType: 'application/pdf' } };
    } };
    const h = dbHarness({ fileRow: { r2_bucket: bucketName, r2_key: 'private/file.pdf', mime_type: 'application/pdf', name: 'file.pdf' } });
    const response = await serveAccountLibraryFile({ DB: h.DB, [bindingName]: bucket }, 'owner_1', 'art_1');
    assert.equal(response.status, 200, bucketName);
    assert.equal(await response.text(), 'private payload', bucketName);
    assert.deepEqual(reads, ['private/file.pdf'], bucketName);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('content-disposition'), 'inline; filename="file.pdf"');
    assert.deepEqual(h.calls[0].values, ['art_1', 'owner_1']);
  }
});

test('Cloudflare account buckets are not wired as Worker R2 bindings', () => {
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.doesNotMatch(config, /INNERANIMALMEDIA_ASSETS|CAJUNENGRAVINCOMPANY_ASSETS/);
  assert.match(config, /\"bucket_name\": \"artifacts\"/);
});

const cfAccount = 'a'.repeat(32);
const secondAccount = 'b'.repeat(32);
const oauthConnections = [{status:'connected',cloudflareAccountId:cfAccount}];
const readyCredential = {
  status:'ready',accountId:cfAccount,bearerToken:'oauth-only-test-token',
  grantedScopes:['workers-r2-bucket-item.read'],
};

test('account-connected R2 objects stream through OAuth, not Worker bucket bindings or CLI tokens', async () => {
  for (const bucketName of ['cms', 'cad', 'inneranimalmedia', 'cajunengravincompany', 'arbitrary-new-bucket']) {
    const calls = [];
    const h = dbHarness({fileRow:{r2_bucket:bucketName,r2_key:'user assets/file name.pdf',
      mime_type:'application/pdf',name:'file.pdf'}});
    const response = await serveAccountLibraryFile({DB:h.DB,CLOUDFLARE_API_TOKEN:'must-never-be-used',
      CLOUDFLARE_ACCOUNT_ID:secondAccount}, 'owner_1', 'art_1', false, {
      listConnections:async (env,owner) => {assert.equal(owner,'owner_1');return oauthConnections;},
      resolveCredential:async (options) => {calls.push({credential:options});return readyCredential;},
      fetchImpl:async (url, init) => {
        calls.push({url:String(url),authorization:init.headers.authorization});
        return new Response(new Blob(['owner-only file']).stream(),{headers:{'content-type':'application/pdf'}});
      },
    });
    assert.equal(response.status,200,bucketName);
    assert.equal(await response.text(),'owner-only file');
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(calls[0].credential.authMode,'oauth');
    assert.equal(calls[0].credential.explicitAccountId,cfAccount);
    assert.match(calls[1].url,new RegExp('/accounts/'+cfAccount+'/r2/buckets/'+bucketName+'/objects/user%20assets/file%20name\\.pdf$'));
    assert.equal(calls[1].authorization,'Bearer oauth-only-test-token');
    assert.deepEqual(h.calls[0].values,['art_1','owner_1']);
  }
});

test('OAuth R2 fails closed for missing connection, ambiguous accounts, missing scope, mismatched saved account', async () => {
  const h = dbHarness({fileRow:{r2_bucket:'inneranimalmedia',r2_key:'one.png',name:'one.png',mime_type:'image/png'}});
  let fetchCount=0;
  const failIfFetched=async()=>{fetchCount++;throw Error('must not fetch');};
  const base={fetchImpl:failIfFetched,resolveCredential:async()=>readyCredential};
  const noOauth=await serveAccountLibraryFile({DB:h.DB},'owner_1','art_1',false,
    {...base,listConnections:async()=>[]});
  assert.equal(noOauth.status,401);
  const ambiguous=await serveAccountLibraryFile({DB:h.DB},'owner_1','art_1',false,
    {...base,listConnections:async()=>[...oauthConnections,{status:'connected',cloudflareAccountId:secondAccount}]});
  assert.equal(ambiguous.status,409);
  const noScope=await serveAccountLibraryFile({DB:h.DB},'owner_1','art_1',false,
    {...base,listConnections:async()=>oauthConnections,
      resolveCredential:async()=>({...readyCredential,grantedScopes:['workers-r2.read']})});
  assert.equal(noScope.status,403);
  const mismatched=await serveAccountLibraryFile({DB:dbHarness({fileRow:{r2_bucket:'inneranimalmedia',r2_key:'one.png',name:'one.png',
    metadata_json:JSON.stringify({cloudflare_account_id:cfAccount})}}).DB},'owner_1','art_1',false,
    {...base,accountId:secondAccount,listConnections:async()=>[...oauthConnections,{status:'connected',cloudflareAccountId:secondAccount}]});
  assert.equal(mismatched.status,403);
  assert.equal(fetchCount,0);
});

test('OAuth R2 refuses malicious bucket names, paths and wrong-owner records', async () => {
  for (const [bucket,key] of [['bad/bucket','safe.txt'],['inneranimalmedia','../secret'],['inneranimalmedia','\\\\bad.txt']]) {
    const h=dbHarness({fileRow:{r2_bucket:bucket,r2_key:key,name:'unsafe'}});
    const response=await serveAccountLibraryFile({DB:h.DB},'owner_1','art_1',false,{listConnections:async()=>{throw Error('unsafe access');}});
    assert.equal(response.status,400);
  }
  const denied=await serveAccountLibraryFile({DB:dbHarness({fileRow:null}).DB},'wrong_owner','art_1');
  assert.equal(denied.status,404);
});

test('preview delivery prefers the thumbnail key and missing or cross-owner artifacts return 404', async () => {
  const reads = [];
  const bucket = { async get(key) {
    reads.push(key);
    return { body: new Blob(['preview']).stream(), httpMetadata: { contentType: 'image/webp' } };
  } };
  const h = dbHarness({ fileRow: { r2_bucket: 'artifacts', r2_key: 'original.json', thumbnail_r2_key: 'thumb.webp', mime_type: 'application/json', name: 'preview.webp' } });
  const response = await serveAccountLibraryFile({ DB: h.DB, ARTIFACTS: bucket }, 'owner_1', 'art_1', true);
  assert.equal(response.status, 200);
  assert.deepEqual(reads, ['thumb.webp']);
  assert.equal(response.headers.get('content-type'), 'image/webp');

  const missing = dbHarness({ fileRow: null });
  const denied = await serveAccountLibraryFile({ DB: missing.DB, ARTIFACTS: bucket }, 'other_owner', 'art_1');
  assert.equal(denied.status, 404);
  assert.equal(reads.length, 1);
});

test('only server-generated account-scoped Canvas thumbnails are inline SVG', async () => {
 const previewKey='canvas/owner_1/art_1/thumb-rev-2-55443322-11bb.svg';
 const bucket={async get(){return {body:new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>']).stream(),httpMetadata:{contentType:'image/svg+xml'}};}};
 const trusted=dbHarness({fileRow:{r2_bucket:'artifacts',r2_key:'original.json',thumbnail_r2_key:previewKey,mime_type:'application/json',name:'canvas'}});
 const rendered=await serveAccountLibraryFile({DB:trusted.DB,ARTIFACTS:bucket},'owner_1','art_1',true);
 assert.equal(rendered.status,200);
 assert.equal(rendered.headers.get('content-type'),'image/svg+xml');
 assert.match(rendered.headers.get('content-disposition'),/^inline/);
 const untrusted=dbHarness({fileRow:{r2_bucket:'artifacts',r2_key:'upload.svg',thumbnail_r2_key:'upload.svg',mime_type:'image/svg+xml',name:'untrusted'}});
 const download=await serveAccountLibraryFile({DB:untrusted.DB,ARTIFACTS:bucket},'owner_1','art_1',true);
 assert.equal(download.status,200);
 assert.equal(download.headers.get('content-type'),'application/octet-stream');
 assert.match(download.headers.get('content-disposition'),/^attachment/);
 const crossOwnerKey=dbHarness({fileRow:{r2_bucket:'artifacts',r2_key:'original.json',thumbnail_r2_key:'canvas/other_owner/art_1/thumb-rev-2-test.svg',mime_type:'application/json',name:'wrong'}});
 const crossOwner=await serveAccountLibraryFile({DB:crossOwnerKey.DB,ARTIFACTS:bucket},'owner_1','art_1',true);
 assert.equal(crossOwner.headers.get('content-type'),'application/octet-stream');
});
test('legacy account-owned Canvases without thumbnail keys render read-only previews', async () => {
  const document={version:1,artboards:[{id:'page',name:'Intro',width:1200,height:800,background:'#ffffff',nodes:[{
    id:'n1',type:'text',name:'Title',x:10,y:10,width:450,height:90,text:'Original Canvas headline',style:{color:'#345678',fontSize:40},
  }]}]};
  const bytes=new TextEncoder().encode(JSON.stringify(document));
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(value=>value.toString(16).padStart(2,'0')).join('');
  const object={arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  const reads=[];
  const bucket={async get(key){reads.push(key);return object;}};
  const fileRow={r2_bucket:'artifacts',r2_key:'canvas/owner_1/art_1/rev-1.json',thumbnail_r2_key:null,
    preview_r2_key:null,content_hash:digest,mime_type:'application/json',artifact_type:'design-canvas',name:'Legacy Canvas'};
  const harness=dbHarness({fileRow});
  const preview=await serveAccountLibraryFile({DB:harness.DB,ARTIFACTS:bucket},'owner_1','art_1',true);
  assert.equal(preview.status,200);
  assert.deepEqual(reads,['canvas/owner_1/art_1/rev-1.json']);
  assert.equal(preview.headers.get('content-type'),'image/svg+xml');
  assert.match(preview.headers.get('content-disposition'),/^inline/);
  const svg=await preview.text();
  assert.match(svg,/Original Canvas/);
  assert.equal(harness.calls.some(item=>item.sql.startsWith('UPDATE')),false);
  const mismatched=dbHarness({fileRow:{...fileRow,content_hash:'0'.repeat(64)}});
  const rejected=await serveAccountLibraryFile({DB:mismatched.DB,ARTIFACTS:bucket},'owner_1','art_1',true);
  assert.equal(rejected.status,404);
  assert.equal(mismatched.calls.some(item=>item.sql.startsWith('UPDATE')),false);
  const empty=new TextEncoder().encode(JSON.stringify({version:1,artboards:[]}));
  const emptyHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',empty))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const emptyBucket={async get(){return {arrayBuffer:async()=>empty.buffer.slice(empty.byteOffset,empty.byteOffset+empty.byteLength)};}};
  const blank=await serveAccountLibraryFile({DB:dbHarness({fileRow:{...fileRow,content_hash:emptyHash}}).DB,ARTIFACTS:emptyBucket},'owner_1','art_1',true);
  assert.equal(blank.status,404);
});

test('legacy owned Canvas advertises a preview URL even when thumbnail metadata is absent',async()=>{
  const item=artifactRow({id:'canvas_abc',name:'Legacy design',artifact_type:'design-canvas',
    mime_type:'application/json',thumbnail_r2_key:null,preview_r2_key:null,public_url:null,is_public:0,
    metadata_json:'{"artboardCount":2}'});
  const h=dbHarness({rows:{artifacts:[item]}});
  const listed=await listAccountLibraryResources(h.DB,'owner_1');
  assert.equal(listed[0].preview,'/api/work/library/artifacts/canvas_abc/file?preview=1');
  assert.equal(listed[0].open,'/admin/canvas?canvas=canvas_abc');
  const blank=dbHarness({rows:{artifacts:[{...item,metadata_json:'{"artboardCount":0}'}]}});
  const blankListing=await listAccountLibraryResources(blank.DB,'owner_1');
  assert.equal(blankListing[0].preview,null);
});

test('artifact mutations validate fields and always constrain writes by owner', async () => {
  const h = dbHarness({ existingRow: { id: 'art_1' } });
  const request = new Request('https://studio.example/api/work/library/artifacts/art_1', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Renamed', starred: true, archived: true }),
  });
  const response = await mutateAccountLibraryArtifact(request, { DB: h.DB }, 'owner_1', 'art_1');
  assert.equal(response.status, 200);
  const update = h.calls.find(call => call.sql.startsWith('UPDATE'));
  assert.match(update.sql, /WHERE id=\? AND user_id=\?/);
  assert.deepEqual(update.values, ['Renamed', 'true', 'art_1', 'owner_1']);

  const invalidHarness = dbHarness({ existingRow: { id: 'art_1' } });
  const invalid = await mutateAccountLibraryArtifact(new Request('https://studio.example/', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ r2_key: 'other' }),
  }), { DB: invalidHarness.DB }, 'owner_1', 'art_1');
  assert.equal(invalid.status, 400);
  assert.equal(invalidHarness.calls.some(call => call.sql.startsWith('UPDATE')), false);

  const otherOwner = dbHarness({ existingRow: null });
  const notFound = await mutateAccountLibraryArtifact(new Request('https://studio.example/', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ starred: true }),
  }), { DB: otherOwner.DB }, 'other_owner', 'art_1');
  assert.equal(notFound.status, 404);
});
