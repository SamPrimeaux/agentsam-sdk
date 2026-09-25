import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CREDENTIAL_AUTHORITY,
  CREDENTIAL_KINDS,
  normalizeCredentialRecord,
  createProviderRegistry,
  createCredentialResolver,
  makeCredentialRef,
  mintVaultMasterKeyV1,
  parseVaultMasterKeyBytes,
  importVaultMasterKey,
} from '../src/index.js';

describe('agentsam-vault contracts', () => {
  it('keeps authority lanes distinct', () => {
    assert.equal(CREDENTIAL_AUTHORITY.vaultMasterKey, 'VAULT_MASTER_KEY');
    assert.equal(CREDENTIAL_AUTHORITY.agentsamApiKey, 'AGENTSAM_API_KEY');
    assert.equal(CREDENTIAL_AUTHORITY.agentsamApiKeyPrefix, 'aak_');
    assert.equal(CREDENTIAL_AUTHORITY.bridgeKey, 'AGENTSAM_BRIDGE_KEY');
  });

  it('rejects plaintext-looking credential_ref', () => {
    assert.throws(() =>
      normalizeCredentialRecord({
        id: 'c1',
        owner_type: 'user',
        owner_id: 'u1',
        kind: CREDENTIAL_KINDS.PROVIDER_API_KEY,
        label: 'OpenAI',
        credential_ref: 'sk-live-abc',
        status: 'active',
        created_at: '1',
        updated_at: '1',
      }),
    );
  });

  it('provider registry drives UI fields', () => {
    const reg = createProviderRegistry();
    assert.ok(reg.get('openai')?.fields?.[0]?.type === 'secret');
    assert.ok(reg.listByKind(CREDENTIAL_KINDS.OAUTH_CONNECTION).some((p) => p.id === 'cloudflare'));
  });

  it('resolver prefers vault over env', async () => {
    const resolver = createCredentialResolver({
      env: { OPENAI_API_KEY: 'sk-env' },
      async lookupVaultMeta() {
        return { ref: makeCredentialRef({ id: 'usec_1' }), last4: 'xyz1' };
      },
      async unwrap() {
        return 'sk-vault';
      },
    });
    const hit = await resolver.resolve({ provider: 'openai' });
    assert.equal(hit.source, 'vault');
    assert.equal(hit.value, 'sk-vault');
  });

  it('requires versioned 32-byte VAULT_MASTER_KEY', async () => {
    assert.throws(() => parseVaultMasterKeyBytes('not-a-key'), /INVALID_FORMAT/);
    assert.throws(() => parseVaultMasterKeyBytes('v1.YQ=='), /INVALID_LENGTH/);
    const minted = mintVaultMasterKeyV1();
    assert.match(minted, /^v1\./);
    const bytes = parseVaultMasterKeyBytes(minted);
    assert.equal(bytes.byteLength, 32);
    const key = await importVaultMasterKey(minted);
    assert.ok(key);
  });
});
