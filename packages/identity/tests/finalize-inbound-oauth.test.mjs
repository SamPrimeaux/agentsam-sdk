import assert from 'node:assert/strict';
import test from 'node:test';
import { createFinalizeInboundOAuth } from '../src/oauth/finalize-inbound.js';
import { createOAuthRedirectHelpers } from '../src/oauth/redirect-paths.js';

test('createFinalizeInboundOAuth provisions user and session via ports', async () => {
  const calls = [];
  const finalize = createFinalizeInboundOAuth({
    hasDatabase: () => true,
    ensureAppUser: async () => {
      calls.push('ensureAppUser');
      return { authUserId: 'au_test', created: true, row: { name: 'Sam' } };
    },
    updateUserNameIfEmpty: async () => {
      calls.push('updateUserNameIfEmpty');
    },
    ensureIdentityPlaneBeforeSession: async () => {
      calls.push('identity');
      return { ok: true };
    },
    revokeIncomingCookieSession: async () => {
      calls.push('revoke');
    },
    createLoginSession: async () => {
      calls.push('session');
      return { sessionId: 'sess_1', sessionToken: 'tok_1', d1SessionPersisted: true };
    },
    normalizeLoginSessionResult: (row) => ({
      sessionId: row.sessionId,
      sessionToken: row.sessionToken,
      tenantId: 'tn_1',
      workspaceId: 'ws_1',
      d1SessionPersisted: true,
    }),
    resolveTenantAtLogin: async () => 'tn_1',
    resolveCanonicalWorkspace: async () => 'ws_1',
    getPlatformWorkspaceEnvId: () => null,
    runPostLoginD1Effects: async () => {
      calls.push('postLogin');
    },
  });

  const result = await finalize(
    { DB: {} },
    new Request('https://example.com'),
    {
      provider: 'google',
      email: 'sam@example.com',
      name: 'Sam',
      providerUid: 'gid_1',
      source: 'google_oauth',
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.authUserId, 'au_test');
  assert.equal(result.sessionId, 'sess_1');
  assert.deepEqual(calls, [
    'ensureAppUser',
    'updateUserNameIfEmpty',
    'identity',
    'revoke',
    'session',
    'postLogin',
  ]);
});

test('createFinalizeInboundOAuth fails closed when identity plane fails for new user', async () => {
  const finalize = createFinalizeInboundOAuth({
    hasDatabase: () => true,
    ensureAppUser: async () => ({ authUserId: 'au_new', created: true }),
    updateUserNameIfEmpty: async () => {},
    ensureIdentityPlaneBeforeSession: async () => ({ ok: false, reason: 'overload' }),
    revokeIncomingCookieSession: async () => {},
    createLoginSession: async () => ({}),
    normalizeLoginSessionResult: () => ({
      sessionId: 's',
      sessionToken: 't',
      d1SessionPersisted: false,
    }),
    resolveTenantAtLogin: async () => null,
    resolveCanonicalWorkspace: async () => null,
    getPlatformWorkspaceEnvId: () => null,
    runPostLoginD1Effects: async () => {},
  });

  const result = await finalize(
    { DB: {} },
    new Request('https://example.com'),
    {
      provider: 'github',
      email: 'x@example.com',
      name: 'X',
      providerUid: 'gh_1',
      source: 'github_oauth',
    },
  );

  assert.deepEqual(result, { ok: false, error: 'provision_failed' });
});

test('createOAuthRedirectHelpers blocks integrations return path', () => {
  const { safeDashboardLoginRedirectPath } = createOAuthRedirectHelpers({
    isAllowedLoginResumePath: (p) => p.startsWith('/mcp-oauth'),
  });
  assert.equal(
    safeDashboardLoginRedirectPath('https://inneranimalmedia.com', '/dashboard/settings/integrations'),
    '/dashboard/agent',
  );
  assert.equal(
    safeDashboardLoginRedirectPath('https://inneranimalmedia.com', '/mcp-oauth/resume'),
    '/mcp-oauth/resume',
  );
});
