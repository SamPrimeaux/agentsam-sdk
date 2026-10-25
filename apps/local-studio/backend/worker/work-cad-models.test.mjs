import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCadArtifacts, handleWorkCadRequest, isWorkCadRequest } from './work-cad-models.js';

const prefix = 'projects/sample/revisions/';
const rows = [
 { id: 'glb-12', name: 'Sample-V1.2.glb', r2_key: prefix+'v1.2/geometry/Sample-V1.2.glb', artifact_status: 'draft', validation_status: 'asset-verified', updated_at: 200 },
 { id: 'doc-12', name: 'Sample.design.json', r2_key: prefix+'v1.2/source/Sample.design.json', artifact_status: 'draft', validation_status: 'asset-verified', updated_at: 199 },
 { id: 'glb-11', name: 'Sample-V1.1.glb', r2_key: prefix+'v1.1/geometry/Sample-V1.1.glb', artifact_status: 'published', validation_status: 'asset-verified', updated_at: 100 },
];
function env({ owner = 'acct_1', resultRows = rows, assetRow = rows[0], current = null, currentRows = [] } = {}) {
 const got = [];
 const db = { prepare(sql) { return { bind(...args) {
   got.push({ sql, args });
   return {
     async first() {
       if (sql.includes('FROM projects')) return args[1] === owner ? { id: 'p1', name: 'Sample' } : null;
       if (sql.includes('FROM agentsam_artifacts')) return assetRow;
       return null;
     },
     async all() {
       if (sql.includes('FROM project_storage')) return { results: [{ storage_name: 'cad', metadata_json: JSON.stringify({ keyPrefix: prefix, binding: 'CAD_PROJECT_ASSETS', currentPrefix: current ? 'projects/sample/current/' : undefined, current }) }] };
       if (sql.includes('FROM agentsam_artifacts')) return { results: sql.includes('user_id = ?') ? currentRows : resultRows };
       return { results: [] };
     },
   };
 } }; } };
 return { DB: db, CAD_PROJECT_ASSETS: { get: async key => ({ body: new TextEncoder().encode(key), httpMetadata: {contentType:'model/gltf-binary'} }), put: async () => {} }, got };
}
test('CAD registry separates independently versioned geometry and design sources', () => {
 const groups = groupCadArtifacts(rows);
 assert.deepEqual(groups.map(g=>g.revision), ['v1.2','v1.1']);
 assert.equal(groups[0].models[0].id, 'glb-12');
 assert.equal(groups[0].documents[0].id, 'doc-12');
 assert.equal(groups[0].status, 'draft');
 assert.equal(groups[1].status, 'published');
});
test('CAD request is a narrow scoped Work route', () => {
 assert.equal(isWorkCadRequest('/api/work/projects/p1/cad'),true);
 assert.equal(isWorkCadRequest('/api/work/projects/p1/cad/assets/glb-12'),true);
 assert.equal(isWorkCadRequest('/api/work/projects/p1/cad/../../oops'),false);
});
test('unknown account never discovers the project or its assets', async () => {
 const fake = env();
 const result = await handleWorkCadRequest(new Request('https://host/api/work/projects/p1/cad'), fake, 'other_account');
 assert.equal(result.status,404);
 assert.equal((await result.json()).error,'project_not_found');
 assert.equal(fake.got.length,1);
});
test('authorized registry returns only registered project prefix and revision status', async () => {
 const fake = env();
 const res = await handleWorkCadRequest(new Request('https://host/api/work/projects/p1/cad'), fake, 'acct_1');
 assert.equal(res.status,200);
 const json = await res.json();
 assert.equal(json.project.id,'p1');
 assert.equal(json.revisions[0].models[0].id,'glb-12');
 assert.deepEqual(fake.got.at(-1).args,[prefix,prefix]);
});
test('one current DreamHouse model is preferred without inventing a matching draft', async () => {
 const model = { id:'current-glb', name:'DreamHouse.glb', r2_key:'projects/sample/current/DreamHouse.glb',
   artifact_status:'draft', validation_status:'asset-verified', content_hash:'verified-hash', updated_at:300 };
 const fake = env({ current:{ modelAssetId:'current-glb', label:'Current · V1.5 scene / V1.4 BIM',
   bimRevision:'V1.4', sceneRevision:'V1.5' }, currentRows:[model], assetRow:model });
 const index = await handleWorkCadRequest(new Request('https://host/api/work/projects/p1/cad'), fake, 'acct_1');
 assert.equal(index.status, 200);
 const registry = await index.json();
 assert.equal(registry.revisions[0].revision, 'current');
 assert.equal(registry.revisions[0].models[0].id, 'current-glb');
 assert.equal(registry.revisions[0].documents.length, 0);
 assert.equal(registry.revisions[0].sceneRevision, 'V1.5');
 assert.equal(registry.revisions[1].revision, 'v1.2');
 const asset = await handleWorkCadRequest(new Request('https://host/api/work/projects/p1/cad/assets/current-glb'), fake, 'acct_1');
 assert.equal(asset.status, 200);
});

test('a current pointer outside the canonical project prefix is ignored', async () => {
 const fake = env({ current:{ modelAssetId:'rogue-glb' }, currentRows:[{
   id:'rogue-glb', name:'rogue.glb', r2_key:'projects/other/current/rogue.glb',
   validation_status:'asset-verified', content_hash:'hash', artifact_status:'draft',
 }] });
 const result = await handleWorkCadRequest(new Request('https://host/api/work/projects/p1/cad'), fake, 'acct_1');
 assert.equal(result.status, 200);
 assert.equal((await result.json()).revisions[0].revision, 'v1.2');
});

test('registered file cannot escape the selected project storage prefix', async () => {
 const fake = env({ assetRow: { ...rows[0], r2_key:'projects/other/revisions/v1.2/geometry.glb' } });
 const res = await handleWorkCadRequest(new Request('https://host/api/work/projects/p1/cad/assets/glb-12'), fake, 'acct_1');
 assert.equal(res.status,404);
});
test('authorized R2 source streams with private cache semantics', async () => {
 const res = await handleWorkCadRequest(new Request('https://host/api/work/projects/p1/cad/assets/glb-12'),env(),'acct_1');
 assert.equal(res.status,200);
 assert.equal(res.headers.get('content-type'),'model/gltf-binary');
 assert.equal(res.headers.get('cache-control'),'private, no-store');
});

function putEnv({ owner = 'acct_1', tenant = 'tenant_1', extraRows = [], current = null, currentRows = [], conflict = false } = {}) {
  const inserts = []; const objects = new Map(); const updates=[];
  const db = { prepare(sql) { return { bind(...args) { return {
    async first() { return sql.includes('FROM projects') ? (args[1] === owner ? { id: 'p1', name: 'Sample', tenant_id: tenant } : null) : null; },
    async all() {
      if (sql.includes('FROM project_storage')) return { results: [{ storage_name: 'cad', metadata_json: JSON.stringify({ keyPrefix: prefix, binding: 'CAD_PROJECT_ASSETS',currentPrefix:current?'projects/sample/current/':undefined,current }) }] };
      if (sql.includes('FROM agentsam_artifacts')) return { results: (sql.includes('user_id = ?')?currentRows:[...rows,...extraRows]).map((row) => ({ ...row })) };
      return { results: [] };
    },
    async run() { if(sql.startsWith('UPDATE')){updates.push({sql,args});return {success:true,meta:{changes:conflict?0:1}};}if(sql.startsWith('INSERT'))inserts.push({ sql, args });return { success: true }; },
  }; } }; } };
  const store = {
    async put(key, body, options) { objects.set(key, { body: new Uint8Array(body), options }); },
    async get(key) { const o = objects.get(key); return o ? { body: o.body, arrayBuffer: async () => o.body.buffer.slice(o.body.byteOffset, o.body.byteOffset + o.body.byteLength) } : null; },
    async delete(key) { objects.delete(key); },
  };
  return { DB: db, CAD_PROJECT_ASSETS: store, inserts, objects,updates };
}
const putReq = (url, body) => new Request('https://host' + url, { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) });
const docUrl = (base = 'v1.2') => '/api/work/projects/p1/cad/documents?base=' + base;

test('owner saves an edited design as a new immutable revision', async () => {
  const e = putEnv(); const doc = { id: 'p1', walls: [{ id: 'w1' }], rooms: [] };
  const res = await handleWorkCadRequest(putReq(docUrl(), doc), e, 'acct_1');
  assert.equal(res.status, 201);
  const { receipt } = await res.json();
  assert.match(receipt.revisionId, /^d/); assert.equal(receipt.verified, true); assert.equal(receipt.wallsCount, 1);
  const key = prefix + receipt.revisionId + '/source/project.design.json';
  assert.ok(e.objects.has(key)); assert.equal(e.objects.get(key).options.customMetadata.parentRevision, 'v1.2');
  assert.equal(e.inserts.length, 1);
  assert.equal(e.inserts[0].args[1], 'acct_1'); assert.equal(e.inserts[0].args[2], 'tenant_1'); assert.equal(e.inserts[0].args[3], key);
  assert.equal(e.inserts[0].args[8], 'asset-verified');
  assert.equal(JSON.parse(e.inserts[0].args.at(-1)).parentRevision, 'v1.2');
  assert.equal([...e.objects.keys()].some((k) => !k.startsWith(prefix + receipt.revisionId + '/')), false, 'never writes outside the new revision');
});
test('a non-owner cannot write and nothing is stored', async () => {
  const e = putEnv({ owner: 'someone_else' });
  const res = await handleWorkCadRequest(putReq(docUrl(), { id: 'p1', walls: [], rooms: [] }), e, 'acct_1');
  assert.equal(res.status, 404); assert.equal(e.objects.size, 0); assert.equal(e.inserts.length, 0);
});
test('writes reject bad documents, unknown bases and the wrong method', async () => {
  const e = putEnv();
  assert.equal((await handleWorkCadRequest(putReq(docUrl(), { id: 'p1', walls: 'no' }), e, 'acct_1')).status, 400);
  assert.equal((await handleWorkCadRequest(putReq(docUrl(), 'not json'), e, 'acct_1')).status, 400);
  assert.equal((await handleWorkCadRequest(putReq(docUrl('nope'), { id: 'p1', walls: [], rooms: [] }), e, 'acct_1')).status, 400);
  assert.equal((await handleWorkCadRequest(new Request('https://host' + docUrl()), e, 'acct_1')).status, 405);
  assert.equal((await handleWorkCadRequest(putReq('/api/work/projects/p1/cad', { id: 'p1', walls: [], rooms: [] }), e, 'acct_1')).status, 405);
  assert.equal(e.objects.size, 0); assert.equal(e.inserts.length, 0);
});
test('a saved edit is listed with the model it was edited from, and the registry reports write access', async () => {
  const child = { id: 'doc-d1', name: 'project.design.json', r2_key: prefix + 'd1/source/project.design.json', artifact_status: 'draft', validation_status: 'asset-verified', updated_at: 300, metadata_json: JSON.stringify({ parentRevision: 'v1.2', label: 'Edit · test' }) };
  const e = putEnv({ extraRows: [child] });
  const res = await handleWorkCadRequest(new Request('https://host/api/work/projects/p1/cad'), e, 'acct_1');
  const body = await res.json();
  assert.equal(body.access.canWrite, true);
  const edit = body.revisions.find((r) => r.revision === 'd1');
  assert.equal(edit.label, 'Edit · test'); assert.equal(edit.parentRevision, 'v1.2');
  assert.equal(edit.models[0].id, 'glb-12'); assert.equal(edit.models[0].stale, true);
  assert.equal(body.revisions.find((r) => r.revision === 'v1.2').models[0].stale, undefined);
});

const sceneModel={id:'live-model',name:'Current.glb',r2_key:'projects/sample/current/Current.glb',content_hash:'a'.repeat(64),validation_status:'asset-verified',artifact_status:'draft',updated_at:400};
const sceneCurrent={modelAssetId:'live-model',sceneRevision:'V1.5',bimRevision:'V1.4'};
const sceneDocument=()=>({id:'p1',walls:[],rooms:[],sceneSource:{assetId:'live-model',contentHash:'a'.repeat(64),revision:'V1.5',units:'m',axes:'gltf-y-up'},
 sceneElements:[{id:'door',name:'Door',category:'door',source:'BIM',bounds:{min:[0,0,0],max:[4,3,.2]},offset:[1,0,0],rotation:0,visible:true,color:'#123456'}],
 sketchDocument:{nativeStrokes:[{id:'fix',kind:'ink',purpose:'markup',targetId:'door',points:[[0,0],[40,80]]}],review:{note:'Widen this opening',targetId:'door'}},sceneSettings:{exposure:.9}});
const sceneRequest=(document,hash='a'.repeat(64))=>new Request('https://host'+docUrl('current'),{method:'PUT',headers:{'if-match':hash},body:JSON.stringify(document)});
test('scene edits, review ink and settings advance the existing current document pointer',async()=>{
 const e=putEnv({current:sceneCurrent,currentRows:[sceneModel]});
 const res=await handleWorkCadRequest(sceneRequest(sceneDocument()),e,'acct_1');
 assert.equal(res.status,201);const {receipt}=await res.json();assert.equal(receipt.sceneElementCount,1);
 assert.equal(e.updates.length,1);assert.equal(e.updates[0].args[0],receipt.assetId);
 assert.equal(e.updates[0].args[3],'p1');assert.equal(e.updates[0].args[5],'live-model');assert.equal(e.updates[0].args[6],'');
 const saved=JSON.parse(new TextDecoder().decode([...e.objects.values()][0].body));
 assert.equal(saved.sceneElements[0].offset[0],1);assert.equal(saved.sketchDocument.nativeStrokes[0].purpose,'markup');assert.equal(saved.sceneSettings.exposure,.9);
});
test('a current scene reopens its registered edit document without selecting an older drawing',async()=>{
 const doc={id:'editdoc',name:'project.design.json',r2_key:prefix+'d2/source/project.design.json',content_hash:'b'.repeat(64),validation_status:'asset-verified',artifact_status:'draft',updated_at:500};
 const e=env({current:{...sceneCurrent,documentAssetId:'editdoc'},currentRows:[sceneModel,doc],resultRows:[...rows,doc]});
 const res=await handleWorkCadRequest(new Request('https://host/api/work/projects/p1/cad'),e,'acct_1');
 const current=(await res.json()).revisions[0];assert.equal(current.revision,'current');assert.equal(current.documents[0].id,'editdoc');assert.equal(current.models[0].id,'live-model');
});
test('stale saves and a racing current-pointer update do not replace the active document',async()=>{
 const stale=putEnv({current:sceneCurrent,currentRows:[sceneModel]});
 assert.equal((await handleWorkCadRequest(sceneRequest(sceneDocument(),'old-hash'),stale,'acct_1')).status,409);assert.equal(stale.objects.size,0);
 const race=putEnv({current:sceneCurrent,currentRows:[sceneModel],conflict:true});
 assert.equal((await handleWorkCadRequest(sceneRequest(sceneDocument()),race,'acct_1')).status,409);assert.equal(race.objects.size,0);
});
test('a scene cannot bind another project model, save malformed transforms, or register a failed readback',async()=>{
 const e=putEnv({current:sceneCurrent,currentRows:[sceneModel]});
 const wrong=sceneDocument();wrong.sceneSource.assetId='other';assert.equal((await handleWorkCadRequest(sceneRequest(wrong),e,'acct_1')).status,409);
 const bad=sceneDocument();bad.sceneElements[0].offset=['not-a-number',0,0];assert.equal((await handleWorkCadRequest(sceneRequest(bad),e,'acct_1')).status,400);
 const wrongId=sceneDocument();wrongId.id='different-project';assert.equal((await handleWorkCadRequest(sceneRequest(wrongId),e,'acct_1')).status,400);
 const broken=putEnv({current:sceneCurrent,currentRows:[sceneModel]});broken.CAD_PROJECT_ASSETS.get=async()=>null;
 const result=await handleWorkCadRequest(sceneRequest(sceneDocument()),broken,'acct_1');assert.equal(result.status,502);assert.equal(broken.inserts.length,0);assert.equal(broken.objects.size,0);
});
