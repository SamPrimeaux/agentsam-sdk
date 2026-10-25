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
       if (sql.includes('FROM project_storage')) return { results: [{ storage_name: 'cad', metadata_json: JSON.stringify({ keyPrefix: prefix, binding: 'CAD_PROJECT_ASSETS' }) }] };
       if (sql.includes('FROM agentsam_artifacts')) return { results: resultRows };
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
