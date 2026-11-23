import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { evidenceScopePrefix, evidenceStorageProblems } from '../../src/sam/packs/evidence/endpoint.js';
import { createHostedEvidenceStore } from '../../src/sam/packs/evidence/store-hosted.js';

const cad = JSON.parse(readFileSync(new URL('../../apps/cad-creator/agentsam.app.json', import.meta.url), 'utf8')).storage;
const website = {
  evidenceEndpoint: '/api/website/evidence', bucketName: 'website-assets', artifactBinding: 'SITE_ASSETS',
  principal: 'oauth_token_verifier', requiredScopes: ['website:evidence.read', 'website:evidence.write'],
};

test('the CAD manifest storage block satisfies the shared evidence contract', () => {
  assert.deepEqual(evidenceStorageProblems(cad), []);
  assert.equal(evidenceScopePrefix(cad.evidenceEndpoint), 'cad');
});

test('a different app declares its own endpoint, bucket and binding without touching SDK code', () => {
  assert.deepEqual(evidenceStorageProblems(website), []);
  assert.equal(evidenceScopePrefix(website.evidenceEndpoint), 'website');
});

test('invalid endpoints, buckets, bindings and missing scopes are named, not accepted', () => {
  for (const endpoint of ['/api/evidence', '/api/Cad/evidence', '/api/cad/evidence/', '/api/cad/evidence/..', 'https://x.test/api/cad/evidence', '/api/cad/evidence?x=1']) {
    assert.ok(evidenceStorageProblems({ ...website, evidenceEndpoint: endpoint }).some((p) => p.startsWith('evidenceEndpoint')), endpoint);
  }
  assert.ok(evidenceStorageProblems({ ...website, bucketName: 'Bad_Bucket' }).some((p) => p.startsWith('bucketName')));
  assert.ok(evidenceStorageProblems({ ...website, artifactBinding: 'siteAssets' }).some((p) => p.startsWith('artifactBinding')));
  assert.ok(evidenceStorageProblems({ ...website, principal: '' }).some((p) => p.startsWith('principal')));
  assert.deepEqual(
    evidenceStorageProblems({ ...website, requiredScopes: ['website:evidence.read'] }),
    ['requiredScopes must include "website:evidence.write"'],
  );
  // scopes of another app do not satisfy this app's endpoint
  assert.equal(evidenceStorageProblems({ ...website, requiredScopes: cad.requiredScopes }).length, 2);
});

test('the hosted store follows whichever endpoint the app manifest declares', async () => {
  const seen = [];
  const request = async (url, options) => {
    seen.push({ url, method: options.method });
    const body = Buffer.from(options.body);
    const key = decodeURIComponent(url.replace('/api/website/evidence/', '').split('/').map(decodeURIComponent).join('/'));
    return { ok: true, status: 201, json: async () => ({ ok: true, key, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') }) };
  };
  const store = createHostedEvidenceStore({ appManifest: { storage: website }, request });
  const key = 'site/run--20261122--abc1234/04-Build/shot.png';
  const receipt = await store.put(key, Buffer.from('pixels'));
  assert.equal(receipt.key, key);
  assert.equal(seen[0].url, '/api/website/evidence/' + key.split('/').map(encodeURIComponent).join('/'));
});

test('the hosted store still refuses a manifest without a valid evidence endpoint', () => {
  for (const evidenceEndpoint of [undefined, '/api/evidence', '/api/cad/evidence/..', 'https://evil.test/api/cad/evidence']) {
    assert.throws(
      () => createHostedEvidenceStore({ appManifest: { storage: { evidenceEndpoint } }, request: async () => ({}) }),
      /evidence_hosted_endpoint_manifest_required/,
    );
  }
});
