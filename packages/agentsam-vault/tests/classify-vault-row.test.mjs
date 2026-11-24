import assert from 'node:assert/strict';
import test from 'node:test';
import { encryptVaultSecret, importVaultMasterKey, mintVaultMasterKeyV1 } from '../src/crypto/aes-gcm.js';
import { classifyVaultRow, summarizeVaultReport } from '../src/crypto/classify.js';
import { sealLegacyIamOauthToken } from '../src/crypto/oauth-envelope.js';

const AAD = 'au_a:openai:k';
const NOW = 2_000_000_000;

async function fixtures() {
  const master = mintVaultMasterKeyV1();
  const canonical = await encryptVaultSecret(await importVaultMasterKey(master), 'sk-secret-canonical', AAD);
  const legacy = await sealLegacyIamOauthToken(master, 'sk-secret-legacy');
  return { master, env: { VAULT_MASTER_KEY: master }, canonical, legacy };
}
const row = (secret_value_encrypted, metadata_json, extra = {}) => ({ secret_value_encrypted, metadata_json, ...extra });

test('classifies every status without leaking secret material', async () => {
  const { env, canonical, legacy } = await fixtures();
  const results = {
    canonical: await classifyVaultRow(env, row(canonical, '{"aad_bound":1}'), AAD, NOW),
    legacy: await classifyVaultRow(env, row(legacy, '{"migrated_from":"user_api_keys"}'), AAD, NOW),
    unknown: await classifyVaultRow(env, row(legacy, '{"last4":"abcd"}'), AAD, NOW),
    noMeta: await classifyVaultRow(env, row(canonical, null), AAD, NOW),
    invalid: await classifyVaultRow(env, row(legacy, '{oops'), AAD, NOW),
    garbage: await classifyVaultRow(env, row('AAAAAAAAAAAAAAAAAAAAAAAA', '{"aad_bound":1}'), AAD, NOW),
    noKey: await classifyVaultRow({}, row(canonical, '{"aad_bound":1}'), AAD, NOW),
  };
  assert.equal(results.canonical.status, 'canonical_verified');
  assert.equal(results.legacy.status, 'legacy_verified');
  assert.deepEqual([results.unknown.status, results.unknown.opens_as], ['provenance_unknown', ['hkdf-noaad']]);
  assert.deepEqual([results.noMeta.status, results.noMeta.opens_as], ['provenance_unknown', ['v1-aad']]);
  assert.equal(results.invalid.status, 'metadata_invalid');
  assert.equal(results.garbage.status, 'decrypt_failed');
  assert.equal(results.noKey.status, 'key_unavailable');
  assert.ok(!JSON.stringify(results).includes('sk-secret'));
});

test('wrong key, cross-account AAD and expiry', async () => {
  const { env, canonical } = await fixtures();
  const wrong = { VAULT_MASTER_KEY: mintVaultMasterKeyV1() };
  assert.equal((await classifyVaultRow(wrong, row(canonical, '{"aad_bound":1}'), AAD, NOW)).status, 'decrypt_failed');
  assert.equal((await classifyVaultRow(env, row(canonical, '{"aad_bound":1}'), 'au_b:openai:k', NOW)).status, 'decrypt_failed');
  const expired = await classifyVaultRow(env, row(canonical, '{"aad_bound":1}', { expires_at: NOW - 1 }), AAD, NOW);
  assert.deepEqual([expired.status, expired.expired], ['canonical_verified', true]);
  assert.equal((await classifyVaultRow(env, row(canonical, '{"aad_bound":1}', { expires_at: NOW + 60 }), AAD, NOW)).expired, false);
});

test('summary counts by status', () => {
  const summary = summarizeVaultReport([
    { status: 'canonical_verified' },
    { status: 'legacy_verified', expired: true },
    { status: 'decrypt_failed' },
  ]);
  assert.deepEqual(summary, { inspected: 3, authenticated: 2, expired: 1, by_status: { canonical_verified: 1, legacy_verified: 1, decrypt_failed: 1 } });
});
