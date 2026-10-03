import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(root, 'apps/local-studio');
const lockPath = path.join(appRoot, 'package-lock.json');

describe('Local Studio npm 10 product lock', () => {
  it('is release-aligned and carries required local source links', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const packages = lock.packages || {};

    assert.equal(lock.lockfileVersion, 3);
    assert.equal(lock.version, pkg.version);
    assert.equal(packages['']?.version, pkg.version);

    for (const key of ['frontend', 'backend', 'shared/agentsam']) {
      assert.equal(packages[key]?.version, pkg.version, key + ' must match product version');
    }

    assert.deepEqual(packages['node_modules/@inneranimalmedia/agentsam-loading-scene'], {
      resolved: '../../packages/agentsam-loading-scene',
      link: true,
    });
    assert.equal(packages['../../packages/agentsam-loading-scene']?.version, pkg.version);

    const sdkPackageSuffix = 'node_modules/@inneranimalmedia/agentsam-sdk';
    const sdkEntries = Object.entries(packages)
      .filter(([key]) => key === sdkPackageSuffix || key.endsWith('/' + sdkPackageSuffix));

    assert.ok(sdkEntries.length > 0, 'published SDK resolution must be present');
    for (const [key, sdk] of sdkEntries) {
      assert.equal(sdk?.version, pkg.version, key + ' must match product version');
      assert.notEqual(sdk?.link, true, key + ' must not be a local link');
      assert.match(
        sdk?.resolved || '',
        new RegExp('agentsam-sdk-' + pkg.version.replace(/\./g, '\\.') + '\\.tgz$'),
        key + ' must resolve from the npm registry tarball'
      );
      assert.ok(sdk?.integrity, key + ' must carry registry integrity metadata');
    }

    const lru = packages['node_modules/lru-cache'];
    assert.equal(lru?.version, '11.5.2');
    assert.match(lru?.resolved || '', /lru-cache-11\.5\.2\.tgz/);
    assert.ok(lru?.integrity);
  });

  it('verify-npm10-lock script exits 0 against the current product lock', () => {
    const script = path.join(appRoot, 'scripts/verify-npm10-lock.mjs');
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /product workspaces aligned/);
    assert.match(r.stdout, /lru-cache@11\.5\.2/);
  });
});
