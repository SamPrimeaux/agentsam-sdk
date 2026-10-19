import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleCadArtifact } from '../../apps/cad-creator/backend/worker/cad-storage.js';

const ROOT = 'https://cad.example.test/api/cad/artifacts/';
const digest = body => createHash('sha256').update(body).digest('hex');
function fixture({ dbFail = false } = {}) {
  const objects = new Map(), statements = [];
  const env = {
    CAD_AUTH_VERIFIER: {
      async fetch() {
        return Response.json({
          active: true, sub: 'au_authorized', aud: 'cad-creator',
          projects: ['building-one'], scope: 'cad:artifact.read cad:artifact.write cad:artifact.delete',
          tenant_id: 'tenant_from_verified_issuer', workspace_id: 'workspace_from_verified_issuer',
        });
      },
    },
    WEBSITE_ASSETS: {
      async list({ prefix }) { return { objects: [...objects.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({ key, size: object.size, customMetadata: object.customMetadata })), truncated: false }; },
      async head(key) { return objects.get(key) ?? null; },
      async get(key) { return objects.get(key) ?? null; },
      async put(key, data, options) {
        objects.set(key, { customMetadata: options.customMetadata, httpMetadata: options.httpMetadata,
          size: data.byteLength, arrayBuffer: async () => data });
      },
      async delete(key) { objects.delete(key); },
    },
    DB: {
      prepare(sql) {
        return { bind(...params) {
          return { async run() {
            if (dbFail) throw new Error('simulated_db_outage');
            statements.push({ sql, params });
            return { success: true };
          } };
        } };
      },
    },
  };
  return { env, objects, statements };
}
function request(path, method = 'GET', body, headers = {}) {
  return new Request(ROOT + path, {
    method, ...(body === undefined ? {} : { body }),
    headers: { authorization: 'Bearer issued_by_authority', ...headers },
  });
}

test('hosted CAD artifact lifecycle writes R2 before D1 and verifies readback SHA-256', async () => {
  const { env, objects, statements } = fixture();
  const contents = new TextEncoder().encode('ISO-10303-21;\nEND-ISO-10303-21;\n');
  const sha = digest(contents);
  const uri = 'building-one/2/model.step';
  const upload = await handleCadArtifact(request(uri, 'PUT', contents, { 'x-content-sha256': sha }), env);
  assert.equal(upload.status, 201);
  const receipt = await upload.json();
  assert.equal(receipt.ok, true);
  assert.equal(receipt.sha256, sha);
  assert.equal(receipt.db.registered, true);
  assert.ok(receipt.db.snapshotId);
  assert.equal(objects.size, 1);
  assert.equal(statements.length, 3);
  assert.equal(statements[0].params[1], 'au_authorized');
  assert.equal(statements[0].params[5], 'cad');
  assert.equal(statements[1].params[1], 'au_authorized');
  assert.equal(statements[2].params[1], 'workspace_from_verified_issuer');
  assert.equal(statements[2].params[2], 'au_authorized');
  assert.ok(receipt.db.artifactId);
  const listing = await handleCadArtifact(request('building-one/2?list=1'), env);
  assert.equal(listing.status, 200);
  assert.equal((await listing.json()).artifacts[0].name, 'model.step');
  assert.equal((await handleCadArtifact(request(uri, 'HEAD'), env)).status, 200);

  const download = await handleCadArtifact(request(uri), env);
  assert.equal(download.status, 200);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), contents);
  assert.equal(download.headers.get('x-content-sha256'), sha);
  assert.equal((await handleCadArtifact(request(uri, 'PUT', new Uint8Array([1])), env)).status, 409);
  assert.equal((await handleCadArtifact(request(uri, 'DELETE'), env)).status, 200);
  assert.equal((await handleCadArtifact(request(uri), env)).status, 404);
  assert.equal(objects.size, 0);
});

test('hosted storage rejects untrusted principal, project and tampered bytes', async () => {
  const { env, objects } = fixture();
  const unauth = new Request(ROOT + 'building-one/1/model.step');
  assert.equal((await handleCadArtifact(unauth, env)).status, 401);
  assert.equal((await handleCadArtifact(request('not-granted/1/model.step', 'PUT', 'x'), env)).status, 403);
  assert.equal((await handleCadArtifact(request('building-one/1/model.step', 'PUT', 'x',
    { 'x-content-sha256': '0'.repeat(64) }), env)).status, 422);
  assert.equal(objects.size, 0);
});

test('R2 completed receipt accurately reports nonfatal D1 failure', async () => {
  const { env, objects } = fixture({ dbFail: true });
  const upload = await handleCadArtifact(request('building-one/1/model.glb', 'PUT', new Uint8Array([103, 108, 84, 70])), env);
  assert.equal(upload.status, 201);
  const result = await upload.json();
  assert.equal(result.db.registered, false);
  assert.equal(result.db.error, 'cad_job_registration_failed');
  assert.equal(objects.size, 1);
  const read = await handleCadArtifact(request('building-one/1/model.glb'), env);
  assert.equal(read.status, 200);
});

test('read detects corrupted stored object instead of claiming success', async () => {
  const { env, objects } = fixture();
  const uri = 'building-one/3/model.step';
  await handleCadArtifact(request(uri, 'PUT', 'original'), env);
  const entry = objects.get('projects/building-one/revisions/3/model.step');
  entry.arrayBuffer = async () => new TextEncoder().encode('corrupted');
  assert.equal((await handleCadArtifact(request(uri), env)).status, 409);
});
