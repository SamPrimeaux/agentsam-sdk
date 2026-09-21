import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { dispatchShellLine } from '../../src/commands/shell.js';
import { createLocalSession, listLocalSessions, loadLocalSession, saveLocalSession } from '../../src/lib/local-sessions.js';
import { createLocalSqliteDatabaseSync } from '../../src/local/sqlite.js';
import { applyRuntimeMigrationsSync } from '../../src/local/migrations.js';
import { finishRuntimeRun, pruneExpiredRuntimeState, runtimeDatabasePath, startRuntimeRun } from '../../src/local/runtime-store.js';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-storage-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'home');
  const projectA = path.join(base, 'project-a');
  const projectB = path.join(base, 'project-b');
  for (const root of [projectA, projectB]) {
    fs.mkdirSync(path.join(root, '.agentsam'), { recursive: true });
    fs.writeFileSync(path.join(root, '.agentsam', 'config.json'), '{"schema_version":2}\n');
  }
  fs.mkdirSync(home);
  return { base, home, projectA, projectB };
}

test('S1: a local shell boots and migrates SQLite without cloud configuration', (t) => {
  const { home, projectA } = fixture(t);
  const env = { ...process.env, HOME: home };
  for (const key of ['CLOUDFLARE_API_TOKEN', 'AGENTSAM_API_KEY', 'SUPABASE_URL', 'DATABASE_URL']) delete env[key];
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'src/cli.js'), 'shell'], {
    cwd: projectA, env, input: '/exit\n', encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Interactive shell ready/);
  assert.equal(fs.existsSync(runtimeDatabasePath(projectA)), true);
  assert.equal(fs.existsSync(path.join(home, '.agentsam', 'sessions')), false);
});

test('S2-S4: cwd and model changes preserve project state; repository switch selects a new authority', async (t) => {
  const { home, projectA, projectB } = fixture(t);
  const child = path.join(projectA, 'src', 'agent');
  fs.mkdirSync(child, { recursive: true });
  assert.equal(runtimeDatabasePath(child), runtimeDatabasePath(projectA));

  const session = createLocalSession({ cwd: child, title: 'Project A' }, { home });
  const changedModel = saveLocalSession({ ...session, model_key: 'gemini:example' }, { home });
  assert.equal(changedModel.id, session.id);
  assert.equal(changedModel.project_root, projectA);
  assert.equal(loadLocalSession(session.id, { home, cwd: projectA }).model_key, 'gemini:example');
  assert.equal(loadLocalSession(session.id, { home, cwd: projectB }), null);

  const runId = await startRuntimeRun({ projectRoot: projectA, model_key: 'test:model' });
  let output = '';
  const state = { cwd: child, projectRoot: projectA, home, session: changedModel, interactive: false, write(value) { output += value; } };
  await dispatchShellLine('/logs', state);
  assert.match(output, new RegExp(runId));
  await dispatchShellLine(`/cd ${projectB}`, state);
  assert.equal(state.cwd, projectB);
  assert.equal(state.projectRoot, projectB);
  assert.notEqual(state.session.id, session.id);
  assert.equal(listLocalSessions({ home, cwd: projectA })[0].id, session.id);
  assert.equal(listLocalSessions({ home, cwd: projectB })[0].id, state.session.id);
  assert.equal(fs.existsSync(path.join(child, '.agentsam', 'data', 'agentsam.sqlite')), false);
});

test('S5: expiry cleanup removes transient digests and retains completed run receipts', async (t) => {
  const { projectA } = fixture(t);
  const runId = await startRuntimeRun({ cwd: projectA, model_key: 'test:model' });
  await finishRuntimeRun({ cwd: projectA, id: runId, status: 'completed' });
  const db = createLocalSqliteDatabaseSync(runtimeDatabasePath(projectA));
  db.prepare(`INSERT INTO agentsam_context_digest
    (id, digest_type, agent_run_id, source_hash, digest_hash, digest_text, expires_at_unix)
    VALUES (?, 'session', ?, 'source', 'digest', 'expired', 1)`).run('ctx_expired', runId);
  db.prepare('INSERT INTO agentsam_compaction_events (id, agent_run_id, expires_at_epoch) VALUES (?, ?, 1)').run('cmp_expired', runId);
  db.close();

  const pruned = await pruneExpiredRuntimeState({ cwd: projectA, nowUnix: 2 });
  assert.deepEqual(pruned, { digests: 1, compactions: 1, approvals_expired: 0 });
  const verified = createLocalSqliteDatabaseSync(runtimeDatabasePath(projectA));
  assert.equal(verified.prepare('SELECT status FROM agentsam_agent_run WHERE id = ?').get(runId).status, 'completed');
  assert.equal(verified.prepare('SELECT COUNT(*) AS n FROM agentsam_context_digest').get().n, 0);
  verified.close();
});

test('S6-S7: connected Worker bindings do not move sessions or store credential values', (t) => {
  const { home, projectA } = fixture(t);
  const workerConfig = fs.readFileSync(path.join(repoRoot, 'apps/local-studio/backend/wrangler.jsonc'), 'utf8');
  for (const binding of ['"d1_databases"', '"hyperdrive"', '"r2_buckets"', '"services"']) assert.match(workerConfig, new RegExp(binding));
  assert.doesNotMatch(workerConfig, /"durable_objects"/);

  const secret = 'storage_secret_do_not_persist_123';
  const session = createLocalSession({
    cwd: projectA, title: 'Safe project session', last_input: secret,
    provider_state: { provider: 'openai', previous_response_id: 'resp_safe', api_key: secret, messages: [{ content: secret }] },
    usage_snapshot: { current_context: { input_tokens: 20 }, credential: secret },
    last_error: { code: 'failed', message: secret },
  }, { home });
  assert.equal(session.storage.runtime, 'sqlite');
  assert.equal(session.storage.remote, null);
  assert.equal(session.storage.capabilities.remote_shared_state, false);
  assert.equal(session.storage.capabilities.distributed_actor_semantics, false);
  assert.equal(session.last_input, null);
  assert.equal(session.provider_state.api_key, undefined);
  assert.doesNotMatch(fs.readFileSync(runtimeDatabasePath(projectA), 'utf8'), new RegExp(secret));
  assert.equal(fs.statSync(runtimeDatabasePath(projectA)).mode & 0o777, 0o600);
});

test('S8: canonical migrations upgrade an older runtime database for project sessions', (t) => {
  const { base, home, projectA } = fixture(t);
  const oldMigrations = path.join(base, 'old-migrations');
  fs.mkdirSync(oldMigrations);
  fs.copyFileSync(path.join(repoRoot, 'migrations/runtime/0001_cli_runtime.sql'), path.join(oldMigrations, '0001_cli_runtime.sql'));
  const db = createLocalSqliteDatabaseSync(runtimeDatabasePath(projectA));
  assert.equal(applyRuntimeMigrationsSync(db, { migrationsDir: oldMigrations }).applied, 1);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'agentsam_project_sessions'").get(), undefined);
  db.close();

  createLocalSession({ cwd: projectA }, { home });
  const upgraded = createLocalSqliteDatabaseSync(runtimeDatabasePath(projectA));
  const migrationCount = fs.readdirSync(path.join(repoRoot, 'migrations', 'runtime'))
    .filter((name) => /^\d+.*\.sql$/i.test(name)).length;
  assert.equal(upgraded.prepare("SELECT COUNT(*) AS n FROM agentsam_schema_migrations").get().n, migrationCount);
  assert.ok(upgraded.prepare("SELECT name FROM sqlite_master WHERE name = 'agentsam_project_sessions'").get());
  upgraded.close();
});

test('legacy home-level JSON sessions import only into their matching project SQLite', (t) => {
  const { home, projectA, projectB } = fixture(t);
  const id = 'asess_00000000-0000-4000-8000-000000000099';
  const legacyDir = path.join(home, '.agentsam', 'sessions');
  fs.mkdirSync(legacyDir, { recursive: true });
  const filename = path.join(legacyDir, `${id}.json`);
  fs.writeFileSync(filename, JSON.stringify({
    schema_version: 'agentsam-local-session-v1', id, cwd: projectA,
    title: 'Prior work', provider_state: { provider: 'openai', api_key: 'legacy_secret' },
  }));
  assert.equal(loadLocalSession(id, { home, cwd: projectB }), null);
  assert.equal(fs.existsSync(runtimeDatabasePath(projectB)), false);
  const imported = loadLocalSession(id, { home, cwd: projectA });
  assert.equal(imported.project_root, projectA);
  assert.equal(imported.provider_state.api_key, undefined);
  assert.equal(fs.existsSync(filename), true);
  assert.doesNotMatch(fs.readFileSync(runtimeDatabasePath(projectA), 'utf8'), /legacy_secret/);
});

test('S9: default runtime has no Durable Object binding or dependency', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(Object.keys(pkg.dependencies || {}).some((name) => /durable.?object/i.test(name)), false);
  const shell = fs.readFileSync(path.join(repoRoot, 'src/commands/shell.js'), 'utf8');
  assert.doesNotMatch(shell, /\bDurableObject\b|\bdurable_objects\b|\bidFromName\s*\(/);
});
