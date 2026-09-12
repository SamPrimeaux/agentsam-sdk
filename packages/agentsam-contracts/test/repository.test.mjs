import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('repository graph vocabulary is owned and exported by the contracts package', async () => {
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const source = await fs.readFile(new URL('../src/repository.ts', import.meta.url), 'utf8');

  assert.equal(pkg.exports['./repository'], './src/repository.ts');
  for (const value of [
    'informational', 'compatible', 'strict', 'critical',
    'warn', 'block_certification', 'block_deploy', 'degrade',
  ]) assert.match(source, new RegExp(`['\"]${value}['\"]`));

  assert.match(source, /account_id: string/);
  assert.match(source, /repository_id: string/);
  assert.doesNotMatch(source, /tenant_id|workspace_id|owner_user_id/);
});
