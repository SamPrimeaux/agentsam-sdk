import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../');
const config = JSON.parse(readFileSync(resolve(root, 'apps/local-studio/frontend/tsconfig.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const specifier = '@inneranimalmedia/agentsam-sdk/models/inventory';

test('Studio runtime maps credential-scoped model inventory to executable SDK code', async () => {
  // The TS declaration is type-only; the Vite runtime import must stay JS.
  assert.deepEqual(config.compilerOptions.paths[specifier], ['../../../src/models/inventory-core.d.ts']);
  assert.equal(packageJson.exports['./models/inventory'], './src/models/inventory-core.js');
  const viteConfig = readFileSync(resolve(root, 'apps/local-studio/vite.config.ts'), 'utf8');
  assert.ok(viteConfig.includes('find: /^@inneranimalmedia'));
  assert.ok(viteConfig.includes('new URL("../../src/models/inventory-core.js"'));
  const runtime = await import(new URL('../../../src/models/inventory-core.js', import.meta.url));
  assert.equal(typeof runtime.resolveDiscoveredModelExecution, 'function');
  assert.equal(typeof runtime.verifiedModelControls, 'function');
});
