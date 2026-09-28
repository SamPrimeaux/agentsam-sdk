import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleIdentityWorkerRequest } from '../src/server/worker-router.js';

function fakeDb() {
  return {
    prepare() {
      return {
        bind() {
          return {
            async run() { return { success: true }; },
            async first() { return null; },
            async all() { return { results: [] }; },
          };
        },
      };
    },
  };
}

test('native login returns bearer session JSON instead of cookie response', async () => {
  let nativeBranch = false;
  const identity = {
    app: { id: 'local-studio' },
    routeRegistry: { resolve: () => '/agentsam' },
    async loginWithPassword() {
      return {
        ok: true,
        user: { id: 'au_test', email: 'user@example.com', display_name: 'User' },
        sessionId: 'sess_native_123',
        session: { expires_at: 1234567890 },
      };
    },
    isNativeSessionRequest(request) {
      return request.headers.get('X-AgentSam-Native-Client') === '1';
    },
    buildNativeLoginSuccessResponse(result) {
      nativeBranch = true;
      return Response.json({ ok: true, session_id: result.sessionId, user: result.user });
    },
    buildLoginSuccessResponse() {
      throw new Error('cookie_login_response_should_not_run');
    },
  };

  const response = await handleIdentityWorkerRequest(
    new Request('https://example.test/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-AgentSam-Native-Client': '1',
      },
      body: JSON.stringify({ email: 'user@example.com', password: 'secret-pass' }),
    }),
    { DB: fakeDb() },
    { identity },
  );

  assert.equal(response.status, 200);
  assert.equal(nativeBranch, true);
  assert.equal(response.headers.get('set-cookie'), null);
  const body = await response.json();
  assert.equal(body.session_id, 'sess_native_123');
});
