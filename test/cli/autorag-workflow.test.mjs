import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const cli = new URL('../../src/cli.js', import.meta.url).pathname;
function run(root, args, success = true) {
  try { return JSON.parse(execFileSync(process.execPath, [cli, 'autorag', ...args, '--cwd', root], {
    encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' }, timeout: 30000,
  })); }
  catch (error) {
    if (success) throw error;
    return String(error.stderr || error.message);
  }
}

test('AutoRAG first run inspects, configures, indexes, verifies, and preserves historical generations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-autoworkflow-'));
  try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'account.ts'), 'export function authenticateAccount() { return "authentication success"; }\n');
    fs.writeFileSync(path.join(root, 'README.md'), '# Customer project\n');
    execFileSync('git', ['init', '-q', root]);
    const fresh = run(root, ['inspect']);
    assert.equal(fresh.status, 'not_indexed');
    assert.equal(fresh.generation, null);
    assert.ok(fresh.suggested.scope.includes('src'));
    assert.ok(!fs.existsSync(path.join(root, '.agentsam', 'knowledge.json')));
    const configured = run(root, ['setup', '--yes', '--scope', 'src', '--backend', 'local_exact', '--provider', 'none']);
    assert.deepEqual(configured.config.scope.include, ['src']);
    assert.equal(configured.config.embedding.provider, 'none');
    const denied = run(root, ['execute'], false);
    assert.match(denied, /autorag_explicit_confirmation_required/);
    const finished = run(root, ['execute', '--yes']);
    assert.equal(finished.ok, true);
    assert.equal(finished.verified, true);
    assert.equal(finished.kind, 'structural');
    assert.ok(finished.hits.some(h => h.path === 'src/account.ts'));
    const verified = run(root, ['inspect']);
    assert.equal(verified.verified, true);
    assert.equal(verified.verification.generation_id, finished.generation_id);
    assert.equal(verified.generation.id, finished.generation_id);
    assert.ok(verified.historical.some(g => g.active && g.selected_scope));
    fs.appendFileSync(path.join(root, 'src', 'account.ts'), 'export const changed = true;\n');
    const stale = run(root, ['inspect']);
    assert.equal(stale.status, 'source_changed');
    assert.equal(stale.verified, false);
    assert.equal(stale.generation.source_freshness, 'stale');
    run(root, ['setup', '--yes', '--scope', 'README.md', '--backend', 'local_exact', '--provider', 'none']);
    const drift = run(root, ['inspect']);
    assert.equal(drift.status, 'scope_changed');
    assert.equal(drift.generation.current, false);
    assert.equal(drift.verified, false);
    assert.ok(drift.historical.some(g => g.generation_id === finished.generation_id));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('AutoRAG does not silently index local SQLite when a remote backend is selected', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-autoworkflow-remote-'));
  try {
    fs.writeFileSync(path.join(root, 'README.md'), '# Project\n');
    execFileSync('git', ['init', '-q', root]);
    const c = run(root, ['setup', '--yes', '--scope', 'README.md', '--backend', 'postgres_pgvector', '--provider', 'none']);
    assert.equal(c.config.lane.backend, 'postgres_pgvector');
    assert.match(run(root, ['execute', '--yes'], false), /selected_remote_lane_requires_authorized_host/);
    assert.ok(!fs.existsSync(path.join(root, '.agentsam', 'knowledge', 'index.sqlite')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
