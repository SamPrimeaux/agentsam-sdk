import test from 'node:test';
import assert from 'node:assert/strict';
import { registryScopesForCapability, filterToRegistry, activeGrantedScopes } from '../src/scope-registry.js';

function envWith(rows, token) {
  return {
    DB: {
      prepare: (sql) => ({
        bind: () => ({
          all: async () => ({ results: rows }),
          first: async () => token,
        }),
      }),
    },
  };
}
const rows = ['images.read', 'images.write', 'stream.read', 'stream.write', 'd1.read'].map((scope) => ({ scope, label: scope, category: 'x' }));

test('capability scopes come from the registry family', async () => {
  const env = envWith(rows);
  assert.deepEqual(await registryScopesForCapability(env, 'cloudflare.images'), ['images.read', 'images.write']);
  assert.equal(await registryScopesForCapability(env, 'cloudflare.nothing'), null);
});

test('scopes outside the registry are dropped', async () => {
  const env = envWith(rows);
  assert.deepEqual(await filterToRegistry(env, ['d1.read', 'bogus.write', 'offline_access']), ['d1.read', 'offline_access']);
});

test('active grant scopes are split for additive grants', async () => {
  const env = envWith(rows, { scopes: 'stream.read stream.write' });
  assert.deepEqual(await activeGrantedScopes(env, 'u1'), ['stream.read', 'stream.write']);
});
