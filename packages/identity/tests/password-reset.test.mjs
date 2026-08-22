import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPasswordResetService } from '../src/recovery/password-reset.js';

describe('password reset service', () => {
  it('request + confirm updates password via KV flow', async () => {
    const store = new Map();
    const kv = {
      get: async (k) => store.get(k) ?? null,
      put: async (k, v) => { store.set(k, v); },
      delete: async (k) => { store.delete(k); },
    };
    let updated = null;
    let emailed = null;
    const svc = createPasswordResetService({
      kv,
      findEligibleUser: async (email) => (
        email === 'user@example.com'
          ? { id: 'au_1', email, name: 'User', password_hash: 'hash' }
          : null
      ),
      hashPassword: async () => ({ saltHex: 'salt', hashHex: 'hash' }),
      updatePassword: async (userId, hashHex, saltHex) => {
        updated = { userId, hashHex, saltHex };
      },
      sendResetEmail: async (args) => { emailed = args; },
    });

    const req = await svc.requestReset({ email: 'user@example.com' });
    assert.equal(req.ok, true);
    assert.ok(emailed?.code);

    const bad = await svc.confirmReset({
      email: 'user@example.com',
      code: '000000',
      password: 'password1',
      confirmPassword: 'password1',
    });
    assert.equal(bad.ok, false);

    const ok = await svc.confirmReset({
      email: 'user@example.com',
      code: emailed.code,
      password: 'password1',
      confirmPassword: 'password1',
    });
    assert.equal(ok.ok, true);
    assert.deepEqual(updated, { userId: 'au_1', hashHex: 'hash', saltHex: 'salt' });
  });
});
