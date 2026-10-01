import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decryptVaultSecret,
  encryptVaultSecret,
  importVaultMasterKey,
  mintVaultMasterKeyV1,
} from '../src/index.js';

function flipCiphertextBit(packedB64) {
  const bytes = Buffer.from(packedB64, 'base64');
  assert.ok(bytes.length > 13, 'packed ciphertext must contain iv + authenticated ciphertext');
  bytes[12] ^= 0x01;
  return bytes.toString('base64');
}

describe('AES-256-GCM vault integrity', () => {
  it('rejects decryption with the wrong AAD', async () => {
    const key = await importVaultMasterKey(mintVaultMasterKeyV1());
    const ciphertext = await encryptVaultSecret(key, 'sk-test-secret-value', 'acct-a:openai:default');
    await assert.rejects(() => decryptVaultSecret(key, ciphertext, 'acct-b:openai:default'));
  });

  it('rejects tampered ciphertext', async () => {
    const key = await importVaultMasterKey(mintVaultMasterKeyV1());
    const aad = 'acct-a:openai:default';
    const ciphertext = await encryptVaultSecret(key, 'sk-test-secret-value', aad);
    const tampered = flipCiphertextBit(ciphertext);
    await assert.rejects(() => decryptVaultSecret(key, tampered, aad));
  });

  it('uses a fresh random IV when encrypting identical plaintext twice', async () => {
    const key = await importVaultMasterKey(mintVaultMasterKeyV1());
    const aad = 'acct-a:openai:default';
    const first = await encryptVaultSecret(key, 'same-plaintext', aad);
    const second = await encryptVaultSecret(key, 'same-plaintext', aad);
    assert.notEqual(first, second);
    assert.notDeepEqual(Buffer.from(first, 'base64').subarray(0, 12), Buffer.from(second, 'base64').subarray(0, 12));
  });

  it('produces distinct IVs across 10k encryptions', async () => {
    const key = await importVaultMasterKey(mintVaultMasterKeyV1());
    const aad = 'acct-a:openai:default';
    const ivs = new Set();
    for (let i = 0; i < 10_000; i += 1) {
      const ciphertext = await encryptVaultSecret(key, 'same-plaintext', aad);
      const ivHex = Buffer.from(ciphertext, 'base64').subarray(0, 12).toString('hex');
      assert.equal(ivs.has(ivHex), false, `duplicate IV at iteration ${i}`);
      ivs.add(ivHex);
    }
    assert.equal(ivs.size, 10_000);
  });
});
