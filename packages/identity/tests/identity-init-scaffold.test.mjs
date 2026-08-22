import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIdentityAppScaffold } from '../../../src/lib/identity-scaffold.js';
import { writeFileTree } from '../../../src/lib/scaffold/writer.js';

describe('identity init scaffold', () => {
  it('writes app/frontend + backend + migrations layout', async () => {
    const files = buildIdentityAppScaffold({
      projectName: 'demo-identity',
      brandName: 'Demo Co',
    });
    assert.ok(files['app/frontend/auth/login.html'].includes('Demo Co'));
    assert.ok(files['backend/src/index.js'].includes('handleIdentityWorkerRequest'));
    assert.ok(files['migrations/0001_identity_core.sql'].includes('CREATE TABLE IF NOT EXISTS auth_users'));

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-init-'));
    const dir = path.join(tmp, 'demo-identity');
    await writeFileTree(dir, files);
    assert.ok(fs.existsSync(path.join(dir, 'app/frontend/auth/login.html')));
    assert.ok(fs.existsSync(path.join(dir, 'backend/src/index.js')));
    assert.ok(fs.existsSync(path.join(dir, 'wrangler.toml')));
  });
});
