import assert from 'node:assert/strict';
import test from 'node:test';
import { detectCloudflareAccounts } from '../../src/commands/env.js';
import { resolveCloudflareAccountId } from '../../src/lib/scaffold/resolve-cloudflare-account.js';
import { workerApiTemplates } from '../../src/lib/scaffold/templates/worker-api/index.js';

test('Cloudflare account detection accepts Wrangler JSON without exposing credentials', () => {
  const result = detectCloudflareAccounts({
    env: {},
    spawnSyncImpl: () => ({ status: 0, stdout: JSON.stringify({ accounts: [{ id: 'a'.repeat(32), name: 'Example' }] }) }),
  });
  assert.deepEqual(result.accounts, [{ id: 'a'.repeat(32), name: 'Example' }]);
  assert.equal(result.source, 'wrangler');
});

test('scaffold reuses a single detected Cloudflare account without prompting', async () => {
  const notes = [];
  const id = await resolveCloudflareAccountId({
    detectAccounts: () => ({ accounts: [{ id: 'a'.repeat(32), name: 'Example' }] }),
    text: () => { throw new Error('unexpected text prompt'); },
    select: () => { throw new Error('unexpected selection prompt'); },
    isCancel: () => false,
    cancel: () => {},
    note: (message) => notes.push(message),
    pc: { cyan: (value) => value },
  });
  assert.equal(id, 'a'.repeat(32));
  assert.match(notes[0], /Detected Cloudflare account: Example/);
});

test('worker API scaffold emits the selected database contract', () => {
  const input = { projectName: 'example', routes: ['health', 'users', 'content'], cfAccountId: 'a'.repeat(32) };
  const d1 = workerApiTemplates({ ...input, dbKind: 'd1' });
  const hyperdrive = workerApiTemplates({ ...input, dbKind: 'hyperdrive' });

  assert.match(d1['wrangler.toml'], /\[\[d1_databases\]\]/);
  assert.doesNotMatch(d1['wrangler.toml'], /\[\[hyperdrive\]\]/);
  assert.match(d1['src/routes/users.js'], /env\.DB\.prepare/);
  assert.match(d1['migrations/001_init.sql'], /unixepoch\(\)/);

  assert.match(hyperdrive['wrangler.toml'], /\[\[hyperdrive\]\]/);
  assert.doesNotMatch(hyperdrive['wrangler.toml'], /\[\[d1_databases\]\]/);
  assert.match(hyperdrive['src/routes/users.js'], /env\.HYPERDRIVE\.connectionString/);
  assert.match(hyperdrive['migrations/001_init.sql'], /TIMESTAMPTZ/);
  assert.match(hyperdrive['package.json'], /"postgres"/);
});
