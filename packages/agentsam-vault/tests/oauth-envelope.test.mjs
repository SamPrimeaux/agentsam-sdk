import assert from 'node:assert/strict';
import test from 'node:test';
import {
  oauthAad,
  oauthKeyId,
  sealLegacyIamOauthToken,
  sealOauthToken,
  unsealOauthToken,
} from '../src/crypto/oauth-envelope.js';

const MATERIAL = 'v1.dGVzdC1tYXRlcmlhbC1mb3Itb2F1dGgtaGtkZi1jb250cmFjdA==';
const OTHER = 'v1.b3RoZXIta2V5LW1hdGVyaWFs';
const AAD = oauthAad('cloudflare', 'au_test', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

test('OAuth envelope v2 round trips with AAD', async () => {
  const blob = await sealOauthToken(MATERIAL, 'secret-token', AAD);
  assert.match(blob, /^v2:k1-[0-9a-f]{16}:/);
  assert.equal(await unsealOauthToken(MATERIAL, blob, AAD), 'secret-token');
});

test('legacy IAM no-AAD ciphertext remains readable', async () => {
  const blob = await sealLegacyIamOauthToken(MATERIAL, 'legacy-token');
  assert.doesNotMatch(blob, /^v2:/);
  assert.equal(await unsealOauthToken(MATERIAL, blob, AAD), 'legacy-token');
});

test('wrong key fails with structured key id mismatch', async () => {
  const blob = await sealOauthToken(MATERIAL, 'secret-token', AAD);
  await assert.rejects(
    () => unsealOauthToken(OTHER, blob, AAD),
    (err) => Boolean(err?.code === 'vault_kid_mismatch' && err.storedKeyId && err.currentKeyId),
  );
});

test('wrong AAD and tampering fail authentication', async () => {
  const blob = await sealOauthToken(MATERIAL, 'secret-token', AAD);
  await assert.rejects(
    () => unsealOauthToken(MATERIAL, blob, oauthAad('cloudflare', 'au_other', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
    (err) => err?.code === 'vault_unseal_failed',
  );
  const tampered = blob.slice(0, -1) + (blob.endsWith('A') ? 'B' : 'A');
  await assert.rejects(
    () => unsealOauthToken(MATERIAL, tampered, AAD),
    (err) => err?.code === 'vault_unseal_failed',
  );
});

test('key id is stable without exposing key material', async () => {
  const a = await oauthKeyId(MATERIAL);
  const b = await oauthKeyId(MATERIAL);
  assert.equal(a, b);
  assert.notEqual(a, await oauthKeyId(OTHER));
  assert.doesNotMatch(a, /dGVzdC/);
});
