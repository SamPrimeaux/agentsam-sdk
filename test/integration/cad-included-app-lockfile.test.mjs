import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cad = path.join(repo, 'apps/cad-creator');

test('CAD included app lockfile supports clean release npm ci', () => {
  // CI ordinarily runs SDK verification without rebuilding bundled apps.
  // This offline dry-run checks npm's actual package-lock consistency rules,
  // so a broken CAD install cannot first surface during a production deploy.
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'ci', '--dry-run', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--fetch-retries=0',
  ], { cwd: cad, encoding: 'utf8', timeout: 45_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0,
    'CAD package-lock.json is incompatible with npm ci:\n' +
    [result.stdout, result.stderr].filter(Boolean).join('\n').slice(-7000));
});
