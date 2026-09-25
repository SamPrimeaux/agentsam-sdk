import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createLocalSqliteDatabase } from '../../../src/local/sqlite.js';
import { IDENTITY_ROUTE_IDS } from '../src/contracts/route-ids.js';
import {
  createRouteRegistry,
  projectionFromAppManifest,
} from '../src/contracts/route-projection.js';
import { IdentityRoutingError } from '../src/contracts/identity-store.js';
import { resolvePostAuthDestination } from '../src/server/post-auth.js';
import {
  applySqliteIdentityMigrations,
  createSqliteIdentityAdapter,
} from '../src/adapters/sqlite/index.js';
import { createIdentityService } from '../src/server/identity-service.js';
import { verifyAppPackage, verifyAppAuthContract } from '../src/app/verify-app.js';
import { SESSION_POLICY } from '../src/core/session-policy.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const LOCAL_STUDIO = path.join(REPO, 'apps/local-studio');

describe('IDENTITY_ROUTE_IDS (portable semantics)', () => {
  it('exports semantic IDs only — no host paths', () => {
    assert.equal(IDENTITY_ROUTE_IDS.LOGIN, 'identity.login');
    assert.equal(IDENTITY_ROUTE_IDS.APP_AUTHENTICATED, 'app.authenticated');
    assert.equal(IDENTITY_ROUTE_IDS.OAUTH_CALLBACK, 'identity.oauth.callback');
    for (const v of Object.values(IDENTITY_ROUTE_IDS)) {
      assert.equal(v.includes('/'), false, `path leaked into portable ID: ${v}`);
    }
  });
});

describe('route projection + fail-closed post-auth', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(LOCAL_STUDIO, 'agentsam.app.json'), 'utf8'),
  );
  const projection = projectionFromAppManifest(manifest);
  const routeRegistry = createRouteRegistry([projection]);
  const app = { id: 'local-studio' };

  it('host projection maps identity.login → /auth/login', () => {
    assert.equal(routeRegistry.resolve('local-studio', IDENTITY_ROUTE_IDS.LOGIN), '/auth/login');
    assert.equal(
      routeRegistry.resolve('local-studio', IDENTITY_ROUTE_IDS.APP_AUTHENTICATED),
      '/agentsam',
    );
  });

  it('resumes validated return_to', () => {
    assert.equal(
      resolvePostAuthDestination({
        transaction: { app_id: 'local-studio', return_to: '/projects/abc' },
        app,
        routeRegistry,
      }),
      '/projects/abc',
    );
  });

  it('falls back to authenticated entry — never /', () => {
    assert.equal(
      resolvePostAuthDestination({ transaction: {}, app, routeRegistry }),
      '/agentsam',
    );
  });

  it('throws AUTH_APP_UNRESOLVED without app', () => {
    assert.throws(
      () => resolvePostAuthDestination({ transaction: {}, app: null, routeRegistry }),
      (err) => err instanceof IdentityRoutingError && err.code === 'AUTH_APP_UNRESOLVED',
    );
  });

  it('rejects cross-app return_to then uses authenticated entry', () => {
    assert.equal(
      resolvePostAuthDestination({
        transaction: { return_to: '/admin/orders' },
        app,
        routeRegistry,
      }),
      '/agentsam',
    );
  });
});

describe('app verification', () => {
  it('local-studio agentsam.app.json passes auth contract', () => {
    const result = verifyAppPackage(LOCAL_STUDIO, { requireShellFiles: false });
    assert.equal(result.ok, true, result.errors?.join('; '));
  });

  it('fails when authenticated entry missing', () => {
    const result = verifyAppAuthContract({
      schema: 'agentsam.app.v1',
      id: 'broken',
      name: 'Broken',
      auth: { entry: { login: 'identity.login' } },
      routes: { 'identity.login': { path: '/signin' } },
    }, { requireShellFiles: false });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /authenticated|missing|AUTH_/i.test(e)));
  });
});

describe('local-only SQLite identity (zero cloud)', () => {
  it('migrates, provisions password user, OAuth transaction with app_id', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-id-'));
    const dbFile = path.join(dir, 'identity.sqlite');
    const db = await createLocalSqliteDatabase(dbFile);
    await applySqliteIdentityMigrations(db);

    const adapter = createSqliteIdentityAdapter(db);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(LOCAL_STUDIO, 'agentsam.app.json'), 'utf8'),
    );
    const routeRegistry = createRouteRegistry([projectionFromAppManifest(manifest)]);
    const identity = createIdentityService({
      adapter,
      app: { id: 'local-studio' },
      routeRegistry,
    });

    const signup = await identity.signup({
      email: 'local@example.test',
      password: 'test-password-ok',
      displayName: 'Local',
    });
    assert.equal(signup.ok, true);
    assert.ok(signup.sessionId);

    await adapter.createOAuthTransaction({
      state: 'st_test',
      provider: 'cloudflare',
      codeVerifier: 'verifier',
      returnTo: '/agentsam',
      appId: 'local-studio',
    });
    const tx = await adapter.consumeOAuthTransaction('st_test');
    assert.equal(tx.app_id, 'local-studio');
    assert.equal(tx.return_to, '/agentsam');

    await assert.rejects(
      () => adapter.createOAuthTransaction({
        state: 'st_bad',
        provider: 'cloudflare',
        codeVerifier: 'v',
        returnTo: '/agentsam',
      }),
    );

    assert.equal(SESSION_POLICY.agent.defaultTtlSeconds, 900);
  });
});
