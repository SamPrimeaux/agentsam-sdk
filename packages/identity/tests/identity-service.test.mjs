import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IDENTITY_ROUTE_IDS } from '../src/contracts/route-ids.js';
import {
  createRouteRegistry,
  defineRouteProjection,
} from '../src/contracts/route-projection.js';
import { createIdentityService } from '../src/server/identity-service.js';

function createTestRouting() {
  const app = { id: 'identity-test-app' };
  const routeRegistry = createRouteRegistry([
    defineRouteProjection({
      appId: app.id,
      routes: {
        [IDENTITY_ROUTE_IDS.LOGIN]: '/auth/login',
        [IDENTITY_ROUTE_IDS.RECOVERY]: '/auth/reset',
        [IDENTITY_ROUTE_IDS.APP_AUTHENTICATED]: '/agentsam',
        [IDENTITY_ROUTE_IDS.OAUTH_CALLBACK]: '/api/oauth/:provider/callback',
        'app.mount./projects': { path: '/projects', auth: 'required' },
      },
    }),
  ]);
  return { app, routeRegistry };
}

function createMemoryAdapter() {
  const users = new Map();
  const sessions = new Map();
  const identities = new Map();

  return {
    async findUserByEmail(email) {
      return [...users.values()].find((u) => u.email === email) || null;
    },
    async findUserById(id) {
      return users.get(id) || null;
    },
    async createUser({ email, passwordHash, salt, displayName }) {
      const id = `au_test_${users.size + 1}`;
      const user = {
        id,
        email,
        display_name: displayName,
        password_hash: passwordHash,
        salt,
        status: 'active',
      };
      users.set(id, user);
      return user;
    },
    async findUserByProvider(provider, subject) {
      const key = `${provider}:${subject}`;
      const accountId = identities.get(key);
      return accountId ? users.get(accountId) : null;
    },
    async upsertProviderIdentity({ accountId, provider, providerSubject }) {
      identities.set(`${provider}:${providerSubject}`, accountId);
      return `aid_${identities.size}`;
    },
    async createSession({ userId, email, displayName, provider, providerSubject }) {
      const id = `sess_${sessions.size + 1}`;
      const session = {
        id,
        user_id: userId,
        email,
        display_name: displayName,
        provider: provider || 'email',
        provider_subject: providerSubject || null,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        revoked_at: null,
      };
      sessions.set(id, session);
      return session;
    },
    async getSession(id) {
      const s = sessions.get(id);
      if (!s || s.revoked_at) return null;
      return s;
    },
    async revokeSession(id) {
      const s = sessions.get(id);
      if (s) s.revoked_at = Math.floor(Date.now() / 1000);
    },
    async saveOAuthState() {},
    async consumeOAuthState() { return null; },
  };
}

describe('identity service', () => {
  it('owns its projected fallback and rejects external OAuth return targets', () => {
    const { app, routeRegistry } = createTestRouting();
    const identity = createIdentityService({
      adapter: createMemoryAdapter(),
      app,
      routeRegistry,
    });

    assert.equal(identity.resolvePostLoginPath('/projects?tab=recent'), '/projects?tab=recent');
    assert.equal(identity.resolvePostLoginPath('https://attacker.example/'), '/agentsam');
    assert.equal(identity.resolvePostLoginPath('//attacker.example/'), '/agentsam');
    assert.equal(identity.resolvePostLoginPath(null), '/agentsam');

    assert.throws(
      () => createIdentityService({ adapter: createMemoryAdapter() }),
      (error) => error?.code === 'AUTH_APP_UNRESOLVED',
    );
  });

  it('signup and login issue session', async () => {
    const { app, routeRegistry } = createTestRouting();
    const identity = createIdentityService({
      adapter: createMemoryAdapter(),
      app,
      routeRegistry,
    });
    const signup = await identity.signup({
      email: 'user@example.com',
      password: 'secret-pass',
      displayName: 'User',
    });
    assert.equal(signup.ok, true);
    assert.ok(signup.sessionId);

    const login = await identity.loginWithPassword({
      email: 'user@example.com',
      password: 'secret-pass',
    });
    assert.equal(login.ok, true);

    const bad = await identity.loginWithPassword({
      email: 'user@example.com',
      password: 'wrong',
    });
    assert.equal(bad.ok, false);
  });
});
