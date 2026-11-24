import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VAULT_FORMAT_CANONICAL,
  VAULT_FORMAT_LEGACY_IAM,
  VAULT_FORMAT_UNKNOWN,
  encryptVaultSecret,
  importVaultMasterKey,
  mintVaultMasterKeyV1,
  openVaultRow,
  openVaultSecret,
  probeVaultSecret,
  vaultFormatForMetadata,
  vaultKeyMaterials,
} from '../src/crypto/aes-gcm.js';
import { sealLegacyIamOauthToken } from '../src/crypto/oauth-envelope.js';

const AAD = 'au_test:openai:my-key';
const canonicalRow = async (master, plaintext, aad = AAD) =>
  encryptVaultSecret(await importVaultMasterKey(master), plaintext, aad);

test('provenance selects the format; missing or malformed metadata is unknown, never legacy', () => {
  assert.equal(vaultFormatForMetadata('{"aad_bound":1,"key_version":1}'), VAULT_FORMAT_CANONICAL);
  assert.equal(vaultFormatForMetadata({ aad_bound: true }), VAULT_FORMAT_CANONICAL);
  assert.equal(vaultFormatForMetadata('{"migrated_from":"user_api_keys"}'), VAULT_FORMAT_LEGACY_IAM);
  assert.equal(vaultFormatForMetadata({ crypto_format: VAULT_FORMAT_LEGACY_IAM }), VAULT_FORMAT_LEGACY_IAM);
  assert.equal(vaultFormatForMetadata({ crypto_format: VAULT_FORMAT_CANONICAL, migrated_from: 'x' }), VAULT_FORMAT_CANONICAL);
  for (const bad of [null, undefined, '', '{}', 'not json', '[]', '{"last4":"abcd"}', '{"migrated_from":"  "}']) {
    assert.equal(vaultFormatForMetadata(bad), VAULT_FORMAT_UNKNOWN, String(bad));
  }
});

test('key candidates: canonical uses VAULT_MASTER_KEY only; legacy may also use VAULT_KEY', () => {
  const env = { VAULT_MASTER_KEY: ' m ', VAULT_KEY: 'k' };
  assert.deepEqual(vaultKeyMaterials(env, VAULT_FORMAT_CANONICAL), ['m']);
  assert.deepEqual(vaultKeyMaterials(env, VAULT_FORMAT_LEGACY_IAM), ['m', 'k']);
  assert.deepEqual(vaultKeyMaterials({ VAULT_KEY: 'k' }, VAULT_FORMAT_CANONICAL), []);
  assert.deepEqual(vaultKeyMaterials(env, VAULT_FORMAT_UNKNOWN), []);
});

test('openVaultRow fails closed on unknown provenance and routes verified rows by format', async () => {
  const master = mintVaultMasterKeyV1();
  const oldKey = 'legacy-env-string';
  const legacy = await sealLegacyIamOauthToken(oldKey, 'sk-legacy');
  const canonical = await canonicalRow(master, 'sk-canonical');
  const env = { VAULT_MASTER_KEY: master, VAULT_KEY: oldKey };

  await assert.rejects(openVaultRow(env, { secret_value_encrypted: legacy, metadata_json: null }, AAD), (e) => e.code === 'vault_provenance_unknown');
  await assert.rejects(openVaultRow(env, { secret_value_encrypted: legacy, metadata_json: '{"last4":"x"}' }, AAD), (e) => e.code === 'vault_provenance_unknown');
  assert.equal((await openVaultRow(env, { secret_value_encrypted: legacy, metadata_json: '{"migrated_from":"user_api_keys"}' }, AAD)).value, 'sk-legacy');
  assert.equal((await openVaultRow(env, { secret_value_encrypted: canonical, metadata_json: '{"aad_bound":1}' }, AAD)).value, 'sk-canonical');
  // VAULT_KEY must never open a canonical row, and a legacy row claiming canonical fails closed.
  await assert.rejects(openVaultRow({ VAULT_KEY: master }, { secret_value_encrypted: canonical, metadata_json: '{"aad_bound":1}' }, AAD), /VAULT_DECRYPT_FAILED/);
  await assert.rejects(openVaultRow(env, { secret_value_encrypted: legacy, metadata_json: '{"aad_bound":1}' }, AAD), /VAULT_DECRYPT_FAILED/);
});

test('canonical rows open with their AAD and never without it or under another account', async () => {
  const master = mintVaultMasterKeyV1();
  const packed = await canonicalRow(master, 'sk-canonical');
  assert.deepEqual(await openVaultSecret(master, packed, AAD, VAULT_FORMAT_CANONICAL), {
    value: 'sk-canonical',
    format: VAULT_FORMAT_CANONICAL,
  });
  await assert.rejects(openVaultSecret(master, packed, 'au_other:openai:my-key', VAULT_FORMAT_CANONICAL), /VAULT_DECRYPT_FAILED/);
  // A canonical (AAD-bound) row must not be readable through the weaker legacy path.
  await assert.rejects(openVaultSecret(master, packed, AAD, VAULT_FORMAT_LEGACY_IAM), /VAULT_DECRYPT_FAILED/);
});

test('legacy IAM rows open only as legacy, with the same env string or its unprefixed form', async () => {
  const master = mintVaultMasterKeyV1();
  const packed = await sealLegacyIamOauthToken(master, 'sk-legacy');
  const out = await openVaultSecret(master, packed, AAD, VAULT_FORMAT_LEGACY_IAM);
  assert.deepEqual(out, { value: 'sk-legacy', format: VAULT_FORMAT_LEGACY_IAM });
  await assert.rejects(openVaultSecret(master, packed, AAD, VAULT_FORMAT_CANONICAL), /VAULT_DECRYPT_FAILED/);

  const plainBase64Packed = await sealLegacyIamOauthToken(master.slice(3), 'sk-unprefixed');
  assert.equal((await openVaultSecret(master, plainBase64Packed, AAD, VAULT_FORMAT_LEGACY_IAM)).value, 'sk-unprefixed');
});

test('legacy lane accepts a fallback key material; a wrong key fails closed', async () => {
  const oldKey = 'old-vault-key-material';
  const packed = await sealLegacyIamOauthToken(oldKey, 'sk-fallback');
  const current = mintVaultMasterKeyV1();
  assert.equal((await openVaultSecret([current, oldKey], packed, AAD, VAULT_FORMAT_LEGACY_IAM)).value, 'sk-fallback');
  await assert.rejects(openVaultSecret(current, packed, AAD, VAULT_FORMAT_LEGACY_IAM), /VAULT_DECRYPT_FAILED/);
  await assert.rejects(openVaultSecret(current, packed, AAD, 'made-up-format'), /VAULT_DECRYPT_FAILED/);
});

test('probe reports the two known formats without plaintext', async () => {
  const master = mintVaultMasterKeyV1();
  const legacy = await sealLegacyIamOauthToken(master, 'sk-secret-value');
  const probe = await probeVaultSecret(master, legacy, AAD);
  assert.deepEqual(probe, { 'v1-aad': false, 'hkdf-noaad': true });
  assert.ok(!JSON.stringify(probe).includes('sk-secret-value'));
  assert.deepEqual(await probeVaultSecret(master, await canonicalRow(master, 'x'), AAD), { 'v1-aad': true, 'hkdf-noaad': false });
});
