import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCloudflareFromUserOauthTokens } from '../src/credential.js';
import { oauthAad, sealOauthToken } from '../../../agentsam-vault/src/crypto/oauth-envelope.js';

for (const recoveryCode of ['REFRESH_TOKEN_MISSING', 'ACCESS_EXPIRED_NO_REFRESH']) {
test(`recovers false-inactive ${recoveryCode} grants only after provider-verified refresh`, async () => {
  const account = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const owner = 'au_local_media';
  const material = 'unit-test-vault-key';
  const aad = oauthAad('cloudflare', owner, account);
  let row = {
    account_id: owner,
    provider: 'cloudflare',
    account_identifier: account,
    access_token_encrypted: await sealOauthToken(material, 'expired-token', aad),
    refresh_token_encrypted: await sealOauthToken(material, 'valid-refresh', aad),
    scopes: 'offline_access images.read',
    expires_at: 1,
    metadata_json: JSON.stringify({ is_preferred: true, connected_via_client_id: 'pkce-test-client' }),
    is_active: 0,
    revoked_at: null,
    last_refresh_error_code: recoveryCode,
  };
  const env = {
    VAULT_MASTER_KEY: material,
    CLOUDFLARE_OAUTH_CLIENT_ID: 'pkce-test-client',
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async all() {
                if (sql.includes("last_refresh_error_code IN ('REFRESH_TOKEN_MISSING', 'ACCESS_EXPIRED_NO_REFRESH')")) {
                  return { results: !row.is_active && row.revoked_at == null &&
                    ['REFRESH_TOKEN_MISSING', 'ACCESS_EXPIRED_NO_REFRESH'].includes(row.last_refresh_error_code) &&
                    row.refresh_token_encrypted ? [row] : [] };
                }
                if (sql.includes('COALESCE(is_active, 1) = 1')) {
                  return { results: row.is_active ? [row] : [] };
                }
                return { results: [] };
              },
              async first() {
                if (sql.includes('SELECT scopes, metadata_json')) return row;
                return row.is_active ? row : null;
              },
              async run() {
                if (sql.includes('INSERT INTO user_oauth_tokens')) {
                  row = {
                    ...row,
                    account_identifier: args[2],
                    access_token_encrypted: args[3],
                    refresh_token_encrypted: args[4],
                    scopes: args[5],
                    expires_at: args[6],
                    metadata_json: args[7],
                    is_active: 1,
                    revoked_at: null,
                    last_refresh_error_code: null,
                  };
                }
                return { success: true };
              },
            };
          },
        };
      },
    },
  };
  let requests = 0;
  const recovered = await loadCloudflareFromUserOauthTokens(env, owner, {
    fetchImpl: async (_url, init) => {
      requests++;
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('client_id'), 'pkce-test-client');
      assert.equal(body.get('refresh_token'), 'valid-refresh');
      assert.equal(init.headers.Authorization, undefined);
      return {
        ok: true,
        async json() { return { access_token: 'fresh-access', refresh_token: 'rotated-refresh', expires_in: 3600 }; },
      };
    },
  });
  assert.equal(recovered.bearerToken, 'fresh-access');
  assert.equal(row.is_active, 1);
  assert.equal(requests, 1);
});
}

test('does not recover a revoked or deliberately deactivated grant', async () => {
  const env = {
    VAULT_MASTER_KEY: 'unit-test-vault-key',
    CLOUDFLARE_OAUTH_CLIENT_ID: 'pkce-test-client',
    DB: { prepare() { return { bind() { return {
      async all() { return { results: [] }; },
      async first() { return null; },
    }; } }; } },
  };
  assert.equal(await loadCloudflareFromUserOauthTokens(env, 'au_revoked'), null);
});

test('does not attempt a provider refresh for an inactive grant without a saved refresh token', async () => {
  let providerCalls = 0;
  let refreshQuery = false;
  const env = {
    VAULT_MASTER_KEY: 'unit-test-vault-key',
    CLOUDFLARE_OAUTH_CLIENT_ID: 'pkce-test-client',
    DB: {
      prepare(sql) {
        if (sql.includes('last_refresh_error_code IN')) refreshQuery = true;
        return { bind() { return {
          async all() { return { results: [] }; },
          async first() { return null; },
        }; } };
      },
    },
  };
  const out = await loadCloudflareFromUserOauthTokens(env, 'au_without_refresh', {
    fetchImpl: async () => { providerCalls++; throw new Error('provider_must_not_be_called'); },
  });
  assert.equal(out, null);
  assert.equal(refreshQuery, true);
  assert.equal(providerCalls, 0);
});
