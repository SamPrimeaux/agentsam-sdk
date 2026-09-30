import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIdentityAppScaffold } from '../../../src/lib/identity-scaffold.js';
import { writeFileTree } from '../../../src/lib/scaffold/writer.js';

describe('identity init scaffold', () => {
  it('writes portable identity_* migrations (not IAM-shaped accounts/company)', async () => {
    const files = buildIdentityAppScaffold({
      projectName: 'demo-identity',
      brandName: 'Demo Co',
    });
    assert.ok(files['app/frontend/auth/login.html'].includes('Demo Co'));
    assert.ok(files['app/frontend/auth/signup.html'].includes('/api/auth/signup'));
    assert.ok(files['backend/src/index.js'].includes('handleIdentityWorkerRequest'));
    assert.ok(files['backend/src/index.js'].includes("identityProfile: 'portable'"));
    assert.ok(files['wrangler.toml'].includes('IDENTITY_ADAPTER_PROFILE = "portable"'));

    const migration = files['migrations/0001_identity_portable.sql'];
    assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS identity_users'));
    assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS identity_companies'));
    assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS identity_oauth_transactions'));
    assert.ok(migration.includes('app_id TEXT NOT NULL'));
    assert.ok(migration.includes('INSERT OR IGNORE INTO identity_companies'));
    assert.equal(migration.includes('CREATE TABLE IF NOT EXISTS accounts'), false);
    assert.equal(migration.includes('CREATE TABLE IF NOT EXISTS company ('), false);
    assert.equal(migration.includes('CREATE TABLE IF NOT EXISTS oauth_states'), false);

    assert.ok(files['.env.example'].includes('GOOGLE_DESKTOP_CLIENT_ID'));
    assert.ok(files['.env.example'].includes('CLOUDFLARE_OAUTH_CLIENT_ID'));
    assert.ok(!files['.env.example'].includes('inneranimalmedia.com'));
    assert.ok(files['app/frontend/shared/company-branding.js'].includes('/api/company'));

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-init-'));
    const dir = path.join(tmp, 'demo-identity');
    await writeFileTree(dir, files);
    assert.ok(fs.existsSync(path.join(dir, 'app/frontend/auth/login.html')));
    assert.ok(fs.existsSync(path.join(dir, 'backend/src/index.js')));
    assert.ok(fs.existsSync(path.join(dir, 'wrangler.toml')));
  });
});
