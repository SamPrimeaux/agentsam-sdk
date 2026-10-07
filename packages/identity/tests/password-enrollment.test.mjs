import assert from 'node:assert/strict';
import test from 'node:test';
import { handleIdentityWorkerRequest } from '../src/server/worker-router.js';

function fakeIdentity(user) {
  return {
    app: { id: 'test-app' },
    routeRegistry: {
      resolve(_appId, routeId) {
        if (routeId === 'identity.signup') return '/auth/signup';
        if (routeId === 'identity.reset') return '/auth/reset';
        return '/auth/login';
      },
    },
    sessionFromRequest: async () => (user ? {
      user,
      session: { id: 'sess_1', user_id: user.id },
      sessionId: 'sess_1',
    } : null),
  };
}

test('authenticated passwordless user can enroll a local password', async () => {
  let updated = null;
  let event = null;
  const user = {
    id: 'au_passwordless',
    email: 'oauth@example.com',
    display_name: 'OAuth User',
    password_hash: null,
    salt: null,
  };
  const adapter = {
    updateUserPassword: async (userId, passwordHash, salt) => {
      updated = { userId, passwordHash, salt };
    },
    logAuthEvent: async (input) => { event = input; },
  };

  const response = await handleIdentityWorkerRequest(
    new Request('https://example.test/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        password: 'first-local-password',
        confirmPassword: 'first-local-password',
      }),
    }),
    {},
    {
      adapter,
      identity: fakeIdentity(user),
      passwordReset: {},
    },
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.equal(updated?.userId, user.id);
  assert.ok(updated?.passwordHash);
  assert.ok(updated?.salt);
  assert.equal(event?.eventType, 'password_enroll');
});

test('password enrollment requires an authenticated session', async () => {
  const response = await handleIdentityWorkerRequest(
    new Request('https://example.test/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'first-local-password' }),
    }),
    {},
    {
      adapter: {},
      identity: fakeIdentity(null),
      passwordReset: {},
    },
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'session_required');
});
