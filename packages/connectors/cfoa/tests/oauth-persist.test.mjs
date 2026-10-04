import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveCloudflareAccountId,
  unionScopes,
  upsertCloudflareUserOauthToken,
} from '../src/oauth-persist.js';

describe('oauth-persist spine', () => {
  it('unions scopes without duplicates', () => {
    assert.deepEqual(
      unionScopes(['d1.read', 'offline_access'], ['d1.read', 'workers-scripts.write']).sort(),
      ['d1.read', 'offline_access', 'workers-scripts.write'].sort(),
    );
  });

  it('requires explicit selection when Cloudflare exposes multiple accounts', async () => {
    const result = await resolveCloudflareAccountId('token', {
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return {
            result: [
              { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'A' },
              { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'B' },
            ],
          };
        },
      }),
    });
    assert.equal(result?.error, 'cloudflare_account_selection_required');
    assert.equal(result?.accounts?.length, 2);
  });

  it('rejects provider labels and synthetic values as account identifiers', async () => {
    const result = await upsertCloudflareUserOauthToken(
      { DB: { prepare() { throw new Error('should not query'); } } },
      { userId: 'au_1', accessToken: 'token', accountId: 'Cloudflare' },
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, 'cloudflare_account_identifier_required');
  });

  it('upserts with client_id provenance and scope union (no connected_via_app)', async () => {
    const rows = new Map();
    const sqlSeen = [];
    const env = {
      VAULT_MASTER_KEY: 'test-vault-material',
      DB: {
        prepare(sql) {
          sqlSeen.push(String(sql));
          return {
            bind(...args) {
              return {
                async first() {
                  if (String(sql).includes('SELECT')) {
                    return rows.get(`${args[0]}|${args[2]}`) || null;
                  }
                  return null;
                },
                async run() {
                  if (String(sql).includes('INSERT')) {
                    // Encrypted-only path: plaintext [3]/[4] are null; ciphertext [5]/[6].
                    const key = `${args[0]}|${args[2]}`;
                    const prior = rows.get(key);
                    rows.set(key, {
                      scopes: args[7],
                      scope: args[7],
                      metadata_json: args[11],
                      access_token: args[3],
                      refresh_token: args[4],
                      created_at: prior?.created_at || args[12],
                    });
                  }
                  return { success: true };
                },
              };
            },
          };
        },
      },
    };

    const r1 = await upsertCloudflareUserOauthToken(env, {
      userId: 'au_1',
      accessToken: 'tok1',
      scopes: 'd1.read offline_access',
      accountId: 'abc123abc123abc123abc123abc123ab',
      clientId: 'c0704bd7a7aab7216b362603e1985499',
      capabilitySet: ['cloudflare.d1'],
    });
    assert.equal(r1.ok, true);
    assert.equal(r1.status, 'connected');
    assert.equal(r1.provenance.connected_via_client_id, 'c0704bd7a7aab7216b362603e1985499');
    assert.equal(r1.provenance.connected_via_app, undefined);

    rows.set('au_1|abc123abc123abc123abc123abc123ab', {
      scopes: 'd1.read offline_access',
      scope: 'd1.read offline_access',
      metadata_json: JSON.stringify({
        cloudflare_account_id: 'abc123abc123abc123abc123abc123ab',
        connected_via_client_id: 'c0704bd7a7aab7216b362603e1985499',
        connected_via_app: 'should_be_stripped',
      }),
      access_token: 'tok1',
      refresh_token: null,
      created_at: 1,
    });

    const r2 = await upsertCloudflareUserOauthToken(env, {
      userId: 'au_1',
      accessToken: 'tok2',
      scopes: 'workers-scripts.write',
      accountId: 'abc123abc123abc123abc123abc123ab',
      clientId: 'c0704bd7a7aab7216b362603e1985499',
      capabilitySet: ['cloudflare.workers'],
    });
    assert.equal(r2.ok, true);
    assert.ok(r2.scopes.includes('d1.read'));
    assert.ok(r2.scopes.includes('workers-scripts.write'));
    const upsertSql = sqlSeen.find((sql) => sql.includes('ON CONFLICT(user_id, provider, account_identifier)'));
    assert.match(upsertSql || '', /last_refresh_error_code = NULL/);
    assert.match(upsertSql || '', /refresh_failure_count = 0/);
  });
});
