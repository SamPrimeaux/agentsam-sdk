import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  normalizeGitRemote,
  resolveGitContext,
} from '../src/lib/git-context.js';
import {
  buildBridgeHeaders,
  createBridgeClient,
  resolveAgentSamBaseUrl,
} from '../src/lib/bridge-client.js';
import { buildContextReport } from '../src/commands/context.js';

test('normalizeGitRemote handles HTTPS and SSH GitHub remotes', () => {
  assert.equal(normalizeGitRemote('https://github.com/SamPrimeaux/agentsam-sdk.git').repoFullName, 'SamPrimeaux/agentsam-sdk');
  assert.equal(normalizeGitRemote('git@github.com:SamPrimeaux/AgentSamRemix.git').repoFullName, 'SamPrimeaux/AgentSamRemix');
});

test('resolveGitContext derives repository identity from Git without user/workspace env', () => {
  const root = mkdtempSync(join(tmpdir(), 'agentsam-sdk-git-'));
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'sdk-test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'SDK Test'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:SamPrimeaux/example-repo.git'], { cwd: root });
  writeFileSync(join(root, 'README.md'), '# test\n');
  execFileSync('git', ['add', 'README.md'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'test'], { cwd: root, stdio: 'ignore' });

  const ctx = resolveGitContext({ cwd: root });
  assert.equal(ctx.repoFullName, 'SamPrimeaux/example-repo');
  assert.match(ctx.revisionSha, /^[0-9a-f]{40}$/);
  assert.equal(ctx.dirty, false);
  assert.equal('workspaceId' in ctx, false);
  assert.equal('userId' in ctx, false);
});

test('bridge headers authenticate only the machine principal', () => {
  const headers = buildBridgeHeaders({
    env: {
      AGENTSAM_BRIDGE_KEY: 'bridge_test_key',
      AGENTSAM_USER_ID: 'should-not-leak',
      AGENTSAM_WORKSPACE_ID: 'should-not-leak',
    },
  });
  assert.equal(headers.Authorization, 'Bearer bridge_test_key');
  assert.equal(headers['X-Bridge-Key'], 'bridge_test_key');
  assert.equal(Object.values(headers).includes('should-not-leak'), false);
});

test('bridge client uses shared service principal and explicit base URL', async () => {
  let observed;
  const client = createBridgeClient({
    baseUrl: 'https://agent.example.test/',
    key: 'bridge_test_key',
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.deepEqual(await client.post('/api/proof', { repo: 'SamPrimeaux/example-repo' }), { ok: true });
  assert.equal(observed.url, 'https://agent.example.test/api/proof');
  assert.equal(observed.options.headers['X-Bridge-Key'], 'bridge_test_key');
  assert.deepEqual(JSON.parse(observed.options.body), { repo: 'SamPrimeaux/example-repo' });
});

test('context report exposes repo facts and bridge readiness without secret value', () => {
  const report = buildContextReport({
    cwd: process.cwd(),
    env: { AGENTSAM_BRIDGE_KEY: 'super-secret', AGENTSAM_BASE_URL: 'https://example.test' },
  });
  assert.equal(report.bridge.configured, true);
  assert.equal(report.bridge.baseUrl, 'https://example.test');
  assert.equal(JSON.stringify(report).includes('super-secret'), false);
  assert.equal(resolveAgentSamBaseUrl({}), 'https://inneranimalmedia.com');
});
