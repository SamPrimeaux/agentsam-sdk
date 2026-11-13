import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
