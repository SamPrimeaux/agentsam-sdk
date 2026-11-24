import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const load = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

test('nested Studio source packages do not request unpublished SDK workspaces from npm', () => {
  const workspace = load('package-lock.json').packages;
  const studioLock = load('apps/local-studio/package-lock.json').packages;
  for (const rel of ['apps/local-studio/backend', 'apps/local-studio/frontend', 'apps/local-studio/shared/agentsam']) {
    const pkg = load(`${rel}/package.json`);
    const locked = studioLock[rel.replace('apps/local-studio/', '')];
    assert.ok(locked, `${rel} must be locked`);
    assert.deepEqual(locked.dependencies ?? {}, pkg.dependencies ?? {}, `${rel} lock matches source`);
    for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
      const local = workspace[`node_modules/${name}`];
      if (!local?.link) continue;
      assert.match(spec, /^file:/, `${rel}: ${name} uses local source, not an unpublished registry version`);
      const packagePath = resolve(root, rel, spec.slice(5), 'package.json');
      assert.ok(existsSync(packagePath), `${rel}: linked ${name} exists`);
      assert.equal(JSON.parse(readFileSync(packagePath, 'utf8')).name, name);
    }
  }
});

// Vite aliases and root workspace hoisting must not mask backend dependencies.
test('Studio backend declares every directly imported first-party package', () => {
  const backend = resolve(root, 'apps/local-studio/backend');
  const manifest = load('apps/local-studio/backend/package.json');
  const declared = new Set(Object.keys(manifest.dependencies ?? {}));
  const missing = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', 'fixtures', 'test', 'tests', 'dist', '.output'].includes(entry.name)) visit(path);
      } else if (/\.(?:[cm]?js|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        const source = readFileSync(path, 'utf8');
        for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["'](@inneranimalmedia\/[^/"']+)(?:\/[^"']*)?["']/g)) {
          if (!declared.has(match[1])) missing.push(`${path.slice(backend.length + 1)}: ${match[1]}`);
        }
      }
    }
  }
  visit(resolve(backend, 'worker'));
  visit(resolve(backend, 'server'));
  assert.deepEqual([...new Set(missing)].sort(), [], 'Backend imports must resolve through its own dependency manifest');
});

// Keep the migrated package families behind declared package exports.
test('Worker uses public entry points for migrated SDK package families', () => {
  const worker = resolve(root, 'apps/local-studio/backend/worker');
  const forbidden = /(?:\.\.\/){4}packages\/(?:identity|connectors\/cfoa|agentsam-(?:vault|communications|database-editor|goap|queue-control))\//;
  const violations = readdirSync(worker, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js') && !entry.name.includes('.test.'))
    .filter(entry => forbidden.test(readFileSync(resolve(worker, entry.name), 'utf8')))
    .map(entry => entry.name);
  assert.deepEqual(violations, []);
});
