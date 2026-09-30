import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const bin = path.join(repoRoot, 'bin', 'agentsam');
const fixture = path.join(repoRoot, 'test', 'fixtures', 'project-authority', 'customer-app');

function runAutorag(root, ...args) {
  const stdout = execFileSync(process.execPath, [bin, 'autorag', ...args, '--cwd', root], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '' },
  });
  return JSON.parse(stdout);
}

test('generic customer fixture discovers existing project resources and adopts Vectorize', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-project-authority-fixture-'));
  try {
    fs.cpSync(fixture, root, { recursive: true });
    const status = runAutorag(root, 'status');
    assert.deepEqual(status.discovery.scopes, ['apps']);
    assert.equal(status.project_context.schema, 'agentsam.project-context.v1');
    assert.equal(status.project_context.project.host_install.app_id, 'my-product');
    assert.equal(status.project_context.resources.workers_ai.binding, 'MY_AI');
    assert.equal(status.project_context.resources.vectorize[0].binding, 'MY_VECTORS');
    assert.equal(status.project_context.resources.vectorize[0].index, 'customer-code-index');
    assert.equal(status.project_context.resources.d1[0].binding, 'DB');
    assert.equal(status.project_context.resources.r2[0].binding, 'CONTENT');
    assert.equal(status.project_context.resources.vectorize[0].locally_executable, false);
    assert.equal(status.project_context.resources.vectorize[0].remotely_executable, true);

    const setup = runAutorag(root, 'setup', '--yes');
    assert.deepEqual(setup.recommendation.scope, ['apps']);
    assert.equal(setup.config.lane.backend, 'cloudflare_vectorize');
    assert.equal(setup.config.lane.binding, 'MY_VECTORS');
    assert.equal(setup.config.lane.index, 'customer-code-index');
    assert.equal(setup.config.embedding.provider, 'none');

    const policy = JSON.parse(fs.readFileSync(path.join(root, '.agentsam', 'knowledge.json'), 'utf8'));
    assert.equal(policy.lane.binding, 'MY_VECTORS');
    assert.equal(policy.lane.index, 'customer-code-index');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
