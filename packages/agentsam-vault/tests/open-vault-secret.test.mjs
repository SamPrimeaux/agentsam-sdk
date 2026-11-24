import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encryptVaultSecret,
  importVaultMasterKey,
  mintVaultMasterKeyV1,
  openVaultSecret,
  probeVaultSecret,
} from '../src/crypto/aes-gcm.js';
import { sealLegacyIamOauthToken } from '../src/crypto/oauth-envelope.js';

const AAD = 'au_test:openai:my-key';

test('opens canonical v1 + AAD rows', async () => {
  const master = mintVaultMasterKeyV1();
  const packed = await encryptVaultSecret(await importVaultMasterKey(master), 'sk-canonical', AAD);
  assert.deepEqual(await openVaultSecret(master, packed, AAD), { value: 'sk-canonical', format: 'v1-aad' });
});

test('opens legacy IAM HKDF/no-AAD rows with the same env string', async () => {
  const master = mintVaultMasterKeyV1();
  const packed = await sealLegacyIamOauthToken(master, 'sk-legacy');
  const out = await openVaultSecret(master, packed, AAD);
  assert.equal(out.value, 'sk-legacy');
  assert.equal(out.format, 'hkdf-noaad');
});

test('probe reports formats without plaintext and fails closed on a different key', async () => {
  const master = mintVaultMasterKeyV1();
  const packed = await sealLegacyIamOauthToken(master, 'sk-legacy');
  const probe = await probeVaultSecret(master, packed, AAD);
  assert.equal(probe['hkdf-noaad'], true);
  assert.equal(probe['v1-aad'], false);
  assert.ok(!JSON.stringify(probe).includes('sk-legacy'));
  await assert.rejects(openVaultSecret(mintVaultMasterKeyV1(), packed, AAD), /VAULT_DECRYPT_FAILED/);
});
