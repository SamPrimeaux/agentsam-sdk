import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.private, false);
assert.equal(pkg.dependencies['@inneranimalmedia/client-cms-editor'], pkg.version);
assert.equal(pkg.dependencies['@inneranimalmedia/cms-runtime'], pkg.version);

for (const forbidden of [
  '@inneranimalmedia/agentsam-cms-backend',
  '@inneranimalmedia/agentsam-cms-frontend',
  '@inneranimalmedia/agentsam-cms-shared',
]) {
  assert.equal(pkg.dependencies[forbidden], undefined, 'public product must not depend on private workspace ' + forbidden);
}

assert.equal(pkg.exports['./cms'].types, './frontend/cms/index.d.ts');
assert.equal(pkg.exports['./cms'].import, './frontend/cms/index.mjs');
assert.equal(pkg.exports['./cms/capabilities'].types, './frontend/cms/capabilities.d.ts');
assert.equal(pkg.exports['./cms/capabilities'].import, './frontend/cms/capabilities.mjs');

console.log('AgentSam Ecommerce CMS product boundary PASS');
