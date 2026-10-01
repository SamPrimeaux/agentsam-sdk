import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('workbench depends on contracts, not product apps', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies['@inneranimalmedia/agentsam-contracts'], pkg.version);
  assert.doesNotMatch(pkg.dependencies['@inneranimalmedia/agentsam-contracts'], /^(?:file:|link:|workspace:)/);
  assert.ok(!JSON.stringify(pkg).includes('apps/local-studio'));
  assert.ok(!JSON.stringify(pkg).includes('apps/cad-creator'));
});
