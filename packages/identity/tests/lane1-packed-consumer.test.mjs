/**
 * Mandatory packed-npm consumer proof for Lane 1 identity portability.
 * Installs the root SDK tarball outside the monorepo and runs a user123 smoke
 * using ONLY package exports (no file: escapes / absolute operator paths).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function run(cmd, args, cwd) {
  // npm run exports allow-scripts as an environment option, which newer npm rejects
  // for nested project installs. Strip that inherited allowance in the child only.
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^npm_config_(?:allow[_-]?scripts|dry[_-]?run)$/i.test(key)) delete env[key];
  }
  return execFileSync(cmd, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
}

describe('Lane 1 packed identity consumer proof', () => {
  it('npm pack → clean install → portable migrate + sqlite smoke', () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lane1-pack-'));
    const artifacts = path.join(work, 'artifacts');
    fs.mkdirSync(artifacts);
    const errorsRoot = path.join(REPO, 'packages', 'agentsam-errors');
    const errorsPackOut = run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts], errorsRoot);
    const errorsPacked = JSON.parse(errorsPackOut);
    const errorsTarballName = errorsPacked[0]?.filename || errorsPacked.filename;
    assert.ok(errorsTarballName, 'agentsam-errors npm pack must emit a tarball name');
    const errorsTarballDest = path.join(artifacts, errorsTarballName);
    assert.ok(fs.existsSync(errorsTarballDest), errorsTarballDest);

    const packOut = run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts], REPO);
    const packed = JSON.parse(packOut);
    const tarballName = packed[0]?.filename || packed.filename;
    assert.ok(tarballName, 'npm pack must emit a tarball name');
    const tarballDest = path.join(artifacts, tarballName);
    assert.ok(fs.existsSync(tarballDest), tarballDest);

    const consumer = path.join(work, 'consumer');
    fs.mkdirSync(consumer);
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({
        name: 'user123-identity-smoke',
        private: true,
        type: 'module',
        allowScripts: {},
      }, null, 2),
    );
    run(
      'npm',
      ['install', errorsTarballDest, tarballDest, '--ignore-scripts', '--no-audit', '--no-fund'],
      consumer,
    );

    const smoke = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  IDENTITY_STORE_SCHEMA_VERSION,
  IdentitySchemaError,
} from '@inneranimalmedia/agentsam-sdk/identity/contracts/identity-store';
import {
  applyPortableIdentityMigrations,
  createSqliteIdentityAdapter,
  resolveIdentitySchemaPack,
} from '@inneranimalmedia/agentsam-sdk/identity/adapters/sqlite';
import { createPortableD1IdentityAdapter } from '@inneranimalmedia/agentsam-sdk/identity/adapters/portable-d1';
import { createIamCompatIdentityAdapter } from '@inneranimalmedia/agentsam-sdk/identity/adapters/iam-compat';
import { createCloudflareD1Adapter } from '@inneranimalmedia/agentsam-sdk/identity/adapters/cloudflare-d1';

assert.equal(typeof createIamCompatIdentityAdapter, 'function');
assert.equal(createCloudflareD1Adapter, createIamCompatIdentityAdapter);
assert.equal(typeof createPortableD1IdentityAdapter, 'function');
assert.ok(IDENTITY_STORE_SCHEMA_VERSION >= 2);
assert.ok(IdentitySchemaError);

const pack = resolveIdentitySchemaPack();
assert.equal(pack.manifest.id, 'agentsam.identity');
assert.ok(fs.existsSync(pack.manifestPath));
assert.ok(fs.existsSync(path.join(pack.sqlDir, '001_identity_core.sql')));
assert.ok(fs.existsSync(path.join(pack.sqlDir, '005_identity_company_native.sql')));

const require = createRequire(import.meta.url);
const sdkPkgJson = require.resolve('@inneranimalmedia/agentsam-sdk/package.json');
const pkgRoot = path.dirname(sdkPkgJson);
for (const p of [pack.manifestPath, pack.sqlDir, pkgRoot]) {
  assert.ok(p.includes('node_modules/@inneranimalmedia/agentsam-sdk'), p);
  assert.equal(p.includes('Sams-iMac'), false, p);
  assert.equal(p.includes('inneranimalmedia-business'), false, p);
}

const { DatabaseSync } = require('node:sqlite');
const dbFile = path.join(os.tmpdir(), 'user123-identity-' + Date.now() + '.sqlite');
const sqlite = new DatabaseSync(dbFile);
const db = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    return {
      bind(...args) {
        return {
          first: async () => statement.get(...args) ?? null,
          run: async () => { statement.run(...args); return { success: true }; },
          all: async () => ({ results: statement.all(...args) }),
        };
      },
      first: async () => statement.get() ?? null,
      run: async () => { statement.run(); return { success: true }; },
      all: async () => ({ results: statement.all() }),
    };
  },
  exec(sql) { sqlite.exec(sql); },
};

await applyPortableIdentityMigrations(db);
const adapter = createSqliteIdentityAdapter(db);
const user = await adapter.createUser({
  email: 'user123@example.test',
  displayName: 'User 123',
  passwordHash: 'h',
  salt: 's',
});
await adapter.upsertCompany({
  slug: 'example',
  name: 'Example Company',
  supportEmail: 'support@example.test',
});
assert.equal((await adapter.findUserByEmail('user123@example.test'))?.id, user.id);
assert.equal((await adapter.getCompanyBySlug('example'))?.name, 'Example Company');
await adapter.createOAuthTransaction({
  state: 'st1',
  provider: 'example',
  codeVerifier: 'v',
  appId: 'app.example.test',
});
const tx = await adapter.consumeOAuthTransaction('st1');
assert.equal(tx.app_id, 'app.example.test');
console.log(JSON.stringify({ ok: true, schemaVersion: IDENTITY_STORE_SCHEMA_VERSION, userId: user.id }));
`;
    const smokePath = path.join(consumer, 'smoke.mjs');
    fs.writeFileSync(smokePath, smoke);
    const out = run(process.execPath, [smokePath], consumer);
    const receipt = JSON.parse(out.trim().split('\n').at(-1));
    assert.equal(receipt.ok, true);
    assert.ok(receipt.userId);

    const installedPkg = JSON.parse(
      fs.readFileSync(
        path.join(consumer, 'node_modules/@inneranimalmedia/agentsam-sdk/package.json'),
        'utf8',
      ),
    );
    const depValues = Object.values(installedPkg.dependencies || {});
    for (const v of depValues) {
      assert.equal(String(v).startsWith('file:../'), false, v);
      assert.equal(String(v).includes('/Users/samprimeaux'), false, v);
    }

    // Packed tarball must include portable SQL + manifest
    const listed = run('tar', ['-tzf', tarballDest], work);
    assert.ok(listed.includes('packages/identity/migrations/sqlite/001_identity_core.sql'));
    assert.ok(listed.includes('packages/identity/migrations/sqlite/005_identity_company_native.sql'));
    assert.ok(listed.includes('packages/identity/schema/agentsam.identity/manifest.json'));
    assert.ok(listed.includes('protocol/database/agentsam.schema-pack.v1.schema.json'));
  });
});
