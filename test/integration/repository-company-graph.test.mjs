import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  COMPANY_REPOSITORY_GRAPH_SCHEMA_VERSION,
  createRepositoryContract,
  createRepositoryDependency,
  createRepositoryIdentity,
} from '../src/repository/contracts.js';

const root = path.resolve(import.meta.dirname, '..');

function schema(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

test('portable repository identity is account-independent', () => {
  const identity = createRepositoryIdentity({
    repository_id: 'repo_agentsam_sdk',
    full_name: 'SamPrimeaux/agentsam-sdk',
    role: 'contract/runtime SDK',
    default_branch: 'main',
  });
  assert.equal(identity.schema_version, COMPANY_REPOSITORY_GRAPH_SCHEMA_VERSION);
  assert.equal(identity.repository_id, 'repo_agentsam_sdk');
  assert.equal(Object.hasOwn(identity, 'account_id'), false);
  assert.throws(() => createRepositoryIdentity({
    repository_id: 'repo_x', full_name: 'owner/repo', role: 'test', account_id: 'au_test',
  }), /must not embed account_id/);
});

test('repository contracts use account and repository SSOT only', () => {
  const record = createRepositoryContract({
    id: 'rct_runtime_receipts_v2',
    account_id: 'au_test',
    repository_id: 'repo_agentsam_sdk',
    contract_key: 'runtime-receipts',
    contract_version: '2',
    contract_type: 'schema',
    name: 'Runtime receipts',
    manifest_path: 'protocol/telemetry',
    contract_hash: `sha256:${'1'.repeat(64)}`,
  });
  assert.equal(record.account_id, 'au_test');
  assert.equal(record.contract_type, 'schema');
  assert.equal(record.status, 'active');
  assert.throws(() => createRepositoryContract({
    ...record, id: 'bad', workspace_id: 'ws_old',
  }), /legacy ownership field/);
});

test('repository dependencies encode cross-repo criticality and failure policy', () => {
  const edge = createRepositoryDependency({
    id: 'rdep_iam_execos',
    account_id: 'au_test',
    source_repository_id: 'repo_inneranimalmedia',
    target_repository_id: 'repo_execos',
    dependency_type: 'runtime',
    criticality: 'critical',
    required_version: '1',
    required_contract_hash: `sha256:${'2'.repeat(64)}`,
    failure_policy: 'block_deploy',
  });
  assert.equal(edge.dependency_type, 'runtime');
  assert.equal(edge.criticality, 'critical');
  assert.equal(edge.failure_policy, 'block_deploy');
  assert.throws(() => createRepositoryDependency({ ...edge, criticality: 'whatever' }), /unsupported criticality/);
  assert.throws(() => createRepositoryDependency({ ...edge, owner_user_id: 'usr_old' }), /legacy ownership field/);
});

test('published JSON schemas expose the same ownership boundary', () => {
  const identity = schema('protocol/repository/repository-identity.schema.json');
  const contract = schema('protocol/repository/repository-contract.schema.json');
  const dependency = schema('protocol/repository/repository-dependency.schema.json');

  assert.equal(identity.additionalProperties, false);
  assert.equal(Object.hasOwn(identity.properties, 'account_id'), false);
  assert.ok(contract.required.includes('account_id'));
  assert.ok(contract.required.includes('repository_id'));
  assert.ok(dependency.required.includes('account_id'));
  assert.ok(dependency.required.includes('source_repository_id'));
  assert.ok(dependency.required.includes('target_repository_id'));

  for (const item of [identity, contract, dependency]) {
    for (const legacy of ['tenant_id', 'workspace_id', 'user_id', 'owner_user_id']) {
      assert.equal(Object.hasOwn(item.properties, legacy), false, `${legacy} must not be part of ${item.title}`);
    }
  }
});
