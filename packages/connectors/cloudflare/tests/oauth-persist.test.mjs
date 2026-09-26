import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
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

  it('upserts with client_id provenance and scope union (no connected_via_app)', async () => {
    const rows = new Map();
    const env = {
      DB: {
        prepare(sql) {
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
                    const key = `${args[0]}|${args[2]}`;
                    const prior = rows.get(key);
                    rows.set(key, {
                      scopes: args[5],
                      scope: args[5],
                      metadata_json: args[8],
                      access_token: args[3],
                      refresh_token: args[4],
                      created_at: prior?.created_at || args[9],
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
  });
});
