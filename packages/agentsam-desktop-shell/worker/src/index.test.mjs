import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './index.js';

test('test-channel artifact download resolves deterministic R2 key', async () => {
  let requestedKey = null;
  const response = await worker.fetch(
    new Request('https://updates.example/downloads/test/local-studio/macos/aarch64/2.6.5/AgentSam%20Local%20Studio.dmg'),
    {
      RELEASES: {
        async get(key) {
          requestedKey = key;
          return {
            body: 'artifact-bytes',
            size: 14,
            httpEtag: '"test-etag"',
            writeHttpMetadata(headers) {
              headers.set('content-type', 'application/x-apple-diskimage');
            },
          };
        },
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(
    requestedKey,
    'native/test/local-studio/macos/aarch64/2.6.5/AgentSam Local Studio.dmg',
  );
  assert.equal(response.headers.get('x-agentsam-release-channel'), 'test');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(await response.text(), 'artifact-bytes');
});

test('download path rejects traversal and unknown channels', async () => {
  const env = { RELEASES: { async get() { throw new Error('must not read bucket'); } } };
  const badChannel = await worker.fetch(
    new Request('https://updates.example/downloads/nightly/local-studio/macos/aarch64/2.6.5/app.dmg'),
    env,
  );
  assert.equal(badChannel.status, 400);

  const traversal = await worker.fetch(
    new Request('https://updates.example/downloads/test/local-studio/macos/aarch64/2.6.5/..%2Fsecret.dmg'),
    env,
  );
  assert.ok([400, 404].includes(traversal.status));
});
