import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRepositoryContract,
  createRepositoryDependency,
  createRepositoryIdentity,
} from '../src/contracts.js';

test('repository package owns account/repository graph normalization', () => {
  const identity = createRepositoryIdentity({
    repository_id: 'github:owner/repo',
    full_name: 'owner/repo',
    role: 'runtime',
  });
  assert.equal(identity.repository_id, 'github:owner/repo');
  assert.equal(Object.hasOwn(identity, 'account_id'), false);

  const contract = createRepositoryContract({
    id: 'contract:runtime:v1',
    account_id: 'au_test',
    repository_id: identity.repository_id,
    contract_key: 'runtime',
    contract_version: '1',
    contract_type: 'runtime',
    contract_hash: `sha256:${'1'.repeat(64)}`,
  });
  assert.equal(contract.account_id, 'au_test');

  const dependency = createRepositoryDependency({
    id: 'dep:a:b',
    account_id: 'au_test',
    source_repository_id: 'github:owner/a',
    target_repository_id: 'github:owner/b',
    dependency_type: 'contract',
    criticality: 'strict',
    failure_policy: 'block_certification',
  });
  assert.equal(dependency.failure_policy, 'block_certification');
  assert.throws(() => createRepositoryContract({ ...contract, workspace_id: 'ws_legacy' }), /legacy ownership field/);
});
