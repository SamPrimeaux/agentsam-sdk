import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(root, 'apps/local-studio/package-lock.json');

describe('local-studio npm 10 lockfile', () => {
  it('pins lru-cache@11.5.2 so Cloudflare npm ci can resolve it', () => {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.equal(lock.lockfileVersion, 3);
    const pkgs = lock.packages || {};
    const hits = Object.entries(pkgs).filter(([key, meta]) => key.includes('lru-cache') && meta.version === '11.5.2');
    assert.ok(hits.length >= 1, 'Missing: lru-cache@11.5.2 from lock file');
    const [, meta] = hits[0];
    assert.match(meta.resolved || '', /lru-cache-11\.5\.2\.tgz/);
    assert.ok(meta.integrity);
  });

  it('verify-npm10-lock script exits 0 against the current lock', () => {
    const script = path.join(root, 'apps/local-studio/scripts/verify-npm10-lock.mjs');
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /lru-cache@11\.5\.2/);
  });
});
