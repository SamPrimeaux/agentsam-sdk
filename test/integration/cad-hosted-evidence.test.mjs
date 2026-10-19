import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCadEvidence } from '../../apps/cad-creator/backend/worker/cad-storage.js';
import { createHostedEvidenceStore } from '../../src/sam/packs/evidence/store-hosted.js';
import { createEvidenceOperations } from '../../src/sam/packs/evidence/index.js';

function hosted() {
  const objects = new Map(), statements = [];
  const env = {
    CAD_AUTH_VERIFIER: { fetch: async () => Response.json({
      active: true, aud: 'cad-creator', sub: 'au_verified_user',
      projects: ['building-one'], scope: 'cad:evidence.read cad:evidence.write cad:evidence.delete',
      tenant_id: 'verified_tenant',
    }) },
    WEBSITE_ASSETS: {
      get: async key => objects.get(key) ?? null,
      head: async key => objects.get(key) ?? null,
      async put(key, data, opts) { objects.set(key, {
        key, size: data.byteLength, customMetadata: opts.customMetadata,
        httpMetadata: opts.httpMetadata, arrayBuffer: async () => data,
      }); },
      async list({ prefix }) { return { objects: [...objects.values()].filter(o => o.key.startsWith(prefix)), truncated: false }; },
      async delete(key) { objects.delete(key); },
    },
    DB: {
      prepare(sql) {
        return { bind(...args) {
          return { run: async () => { statements.push({ sql, args }); return { success: true }; } };
        } };
      },
    },
  };
  const request = async (relative, options) => handleCadEvidence(
    new Request('https://cad.test' + relative, {
      ...options,
      headers: { ...options.headers, authorization: 'Bearer trusted_issuer_token' },
    }), env,
  );
  const store = createHostedEvidenceStore({
    appManifest: { storage: { evidenceEndpoint: '/api/cad/evidence' } },
    request,
  });
  return { store, objects, statements, env, request };
}

test('remote evidence store honors the real EvidenceStore CRUD contract through authenticated R2 Worker', async () => {
  const { store, objects, statements } = hosted();
  const key = 'building-one/proof--20261019--abcdef0/04-Build/2026-10-19/01-Proof/desktop-1440x900/01-01-01-State.txt';
  const receipt = await store.put(key, Buffer.from('real evidence'));
  assert.equal(receipt.bytes, 13);
  assert.equal(receipt.key, key);
  assert.equal(receipt.registration.registered, true);
  assert.equal(await store.has(key), true);
  assert.equal((await store.get(key)).toString(), 'real evidence');
  assert.deepEqual(await store.list('building-one/proof--20261019--abcdef0/04-Build'), [key]);
  const open = await store.open(key);
  assert.equal(open.size, 13);
  const chunks = [];
  for await (const chunk of open.stream({ start: 5, end: 12 })) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), 'evidence');
  assert.equal(statements.length, 1);
  assert.equal(objects.size, 1);
});

test('sam.evidence begin/capture/seal uses hosted R2-backed store and writes manifest last', async () => {
  const { store, objects } = hosted();
  const ops = createEvidenceOperations({
    store, resolveTrustedContext: async () => ({ actorId: 'au_verified_user', project: 'building-one' }),
    authorize: async () => true,
    now: () => new Date('2026-10-19T12:39:00Z'), nonce: () => 'stable-proof',
  });
  const call = (name, input) => ops.find(op => op.id === 'sam.evidence.' + name).handler(input, {});
  try {
    const started = await call('begin', {
      subject: 'cad-hosted-proof', project: 'building-one',
      flows: [{ flow: 1, name: 'Proof', steps: [{ step: 1, states: [{ state: 1, name: 'State' }] }] }],
    });
    assert.equal(started.ok, true);
    const captured = await call('capture', {
      runId: started.runId, project: 'building-one', phase: '04-Build',
      flow: 1, step: 1, state: 1, kind: 'doc', name: 'State',
      source: { kind: 'inline', ext: 'txt', data: Buffer.from('cad proof').toString('base64') },
    });
    assert.equal(captured.ok, true);
    const sealed = await call('seal', { runId: started.runId, project: 'building-one' });
    assert.equal(sealed.ok, true);
    assert.ok(objects.has('evidence/building-one/' + started.runId + '/evidence.manifest.json'));
    const manifest = JSON.parse((await store.get('building-one/' + started.runId + '/evidence.manifest.json')).toString());
    assert.equal(manifest.runId, started.runId);
    assert.ok(manifest.assets.length > 0);
  } finally { await ops.shutdown(); }
});
