import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VAULT_FORMAT_CANONICAL,
  VAULT_FORMAT_LEGACY_IAM,
  encryptVaultSecret,
  importVaultMasterKey,
  mintVaultMasterKeyV1,
  openVaultSecret,
  probeVaultSecret,
  vaultFormatForMetadata,
} from '../src/crypto/aes-gcm.js';
import { sealLegacyIamOauthToken } from '../src/crypto/oauth-envelope.js';

const AAD = 'au_test:openai:my-key';
const canonicalRow = async (master, plaintext, aad = AAD) =>
  encryptVaultSecret(await importVaultMasterKey(master), plaintext, aad);

test('row provenance selects the format: aad_bound is canonical, everything else legacy', () => {
  assert.equal(vaultFormatForMetadata('{"aad_bound":1,"key_version":1}'), VAULT_FORMAT_CANONICAL);
  assert.equal(vaultFormatForMetadata({ aad_bound: true }), VAULT_FORMAT_CANONICAL);
  assert.equal(vaultFormatForMetadata('{"migrated_from":"user_api_keys"}'), VAULT_FORMAT_LEGACY_IAM);
  assert.equal(vaultFormatForMetadata(null), VAULT_FORMAT_LEGACY_IAM);
  assert.equal(vaultFormatForMetadata('not json'), VAULT_FORMAT_LEGACY_IAM);
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
