import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { resolveMerklePersistenceIdentity } from '../../src/commands/merkle-persist.js';

async function gitFixture(t, remote = null) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsam-merkle-identity-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  if (remote) execFileSync('git', ['-C', root, 'remote', 'add', 'origin', remote]);
  return root;
}

test('Merkle persistence identity uses authenticated session + Git provider identity', async (t) => {
  const root = await gitFixture(t, 'git@github.com:SamPrimeaux/agentsam-sdk.git');
  const identity = resolveMerklePersistenceIdentity(root, {
    session: { account_id: 'au_test' },
    projectConfig: { repository: { id: 'local:should-not-win' } },
  });
  assert.deepEqual(identity, {
    accountId: 'au_test',
    repositoryId: 'github:samprimeaux/agentsam-sdk',
    repositoryIdentitySource: 'git',
  });
});

test('local repositories fall back to committed project identity', async (t) => {
  const root = await gitFixture(t);
  const identity = resolveMerklePersistenceIdentity(root, {
    session: { account_id: 'au_test' },
    projectConfig: { repository: { id: 'local:fixture-repository' } },
  });
  assert.equal(identity.repositoryId, 'local:fixture-repository');
  assert.equal(identity.repositoryIdentitySource, 'project_manifest');
});

test('Merkle persistence refuses unauthenticated ownership', async (t) => {
  const root = await gitFixture(t, 'https://github.com/SamPrimeaux/agentsam-sdk.git');
  assert.throws(() => resolveMerklePersistenceIdentity(root, { session: null }), /agentsam_login_required_for_merkle_persistence/);
});

test('Merkle persistence CLI has no account/repository ownership env shortcuts', async () => {
  const source = await fs.readFile(new URL('../../src/commands/merkle-persist.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /AGENTSAM_ACCOUNT_ID|AGENTSAM_REPOSITORY_ID|--account-id|--repository-id/);
});
