import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  createProjectManifest,
  getDefaultProfile,
  getDefaultRuntime,
  getDeployTarget,
  getLocalDatabasePath,
  getProjectName,
  getProjectPreset,
  getProjectRulesPath,
  getRepositoryId,
  portableRepositoryIdFromGit,
} from '../src/lib/project-config.js';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

test('portable project manifest is small and excludes runtime/account history', () => {
  const config = createProjectManifest({
    projectName: 'demo',
    preset: 'cms',
    profile: 'cms',
    runTarget: 'local',
    sdkVersion: '2.5.0',
    repositoryId: 'github:owner/demo',
  });

  assert.equal(config.schema_version, 2);
  assert.deepEqual(config.project, { name: 'demo' });
  assert.equal(config.repository.id, 'github:owner/demo');
  assert.equal(config.product.preset, 'cms');
  assert.equal(config.defaults.profile, 'cms');
  assert.equal(config.defaults.runtime, 'local');
  assert.equal(config.defaults.model, 'auto');
  assert.deepEqual(config.merkle, { enabled: true, semantic: true, persistence: 'auto' });
  assert.equal(config.rules.file, '.agentsamrules');
  assert.equal(getProjectRulesPath(config), '.agentsamrules');
  assert.equal(config.knowledge.config, '.agentsam/knowledge.json');
  assert.equal(config.local.database, '.agentsam/data/agentsam.sqlite');

  const forbidden = [
    'account_id', 'user_id', 'tenant_id', 'workspace_id', 'current_run_id', 'plan_id', 'task_id',
    'connection_id', 'runtime_lease_id', 'latest_merkle_root', 'root_hash', 'model_history',
    'subagent_runs', 'pty_port', 'dev_port', 'deployed_at', 'cloudflare',
  ];
  const serialized = JSON.stringify(config);
  for (const field of forbidden) assert.equal(serialized.includes(`"${field}"`), false, field);
});

test('project config accessors keep legacy flat projects readable during migration', () => {
  const legacy = {
    project: 'legacy-demo',
    lane: 'data',
    agent: 'data',
    run_target: 'local',
    deploy_target: 'gcp',
    db_path: '.agentsam/old.sqlite',
  };
  assert.equal(getProjectName(legacy), 'legacy-demo');
  assert.equal(getProjectPreset(legacy), 'data');
  assert.equal(getDefaultProfile(legacy), 'data');
  assert.equal(getDefaultRuntime(legacy), 'local');
  assert.equal(getDeployTarget(legacy), 'gcp');
  assert.equal(getLocalDatabasePath(legacy), '.agentsam/old.sqlite');
  assert.equal(getRepositoryId(legacy), null);
  assert.equal(getProjectRulesPath(legacy), '.agentsamrules');
});

test('GitHub remote becomes portable repository identity when adopting an existing repo', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-project-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
  git(root, ['remote', 'add', 'origin', 'git@github.com:ExampleOrg/DemoRepo.git']);
  assert.equal(portableRepositoryIdFromGit(root), 'github:exampleorg/demorepo');
});
