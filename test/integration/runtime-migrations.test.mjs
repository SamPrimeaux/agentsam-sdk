import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalSqliteDatabase } from '../../src/local/sqlite.js';
import { applyRuntimeMigrations } from '../../src/local/migrations.js';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);

test('portable runtime migration installs AgentSam CLI state tables idempotently', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-runtime-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const db = await createLocalSqliteDatabase(path.join(root, 'agentsam.sqlite'));
  try {
    const first = await applyRuntimeMigrations(db);
    const migrationCount = fs.readdirSync(path.join(repoRoot, 'migrations', 'runtime'))
      .filter((name) => /^\d+.*\.sql$/i.test(name)).length;
    assert.equal(first.applied, migrationCount);

    const tables = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agentsam_%' ORDER BY name"
    ).all();
    const names = new Set(tables.results.map((row) => row.name));
    for (const name of [
      'agentsam_agent_run',
      'agentsam_agent_run_event',
      'agentsam_agent_run_dependency',
      'agentsam_agent_run_suspension',
      'agentsam_approval_queue',
      'agentsam_compaction_events',
      'agentsam_context_digest',
      'agentsam_cron_runs',
      'agentsam_plans',
      'agentsam_project_sessions',
      'agentsam_queue_job',
      'agentsam_schema_migrations',
      'agentsam_todo',
    ]) assert.equal(names.has(name), true, name);

    const runColumns = await db.prepare('PRAGMA table_info(agentsam_agent_run)').all();
    const runColumnNames = new Set(runColumns.results.map((row) => row.name));
    assert.equal(runColumnNames.has('plan_id'), true);
    assert.equal(runColumnNames.has('todo_id'), true);

    const suspensionColumns = await db.prepare('PRAGMA table_info(agentsam_agent_run_suspension)').all();
    const suspensionColumnNames = new Set(suspensionColumns.results.map((row) => row.name));
    for (const name of ['state', 'reason', 'wake_at_unix', 'wake_event', 'dependency_run_ids_json', 'checkpoint_ref']) {
      assert.equal(suspensionColumnNames.has(name), true, `suspension.${name}`);
    }

    const eventColumns = await db.prepare('PRAGMA table_info(agentsam_agent_run_event)').all();
    const eventColumnNames = new Set(eventColumns.results.map((row) => row.name));
    for (const name of ['run_id', 'parent_run_id', 'seq', 'event_type', 'phase', 'dedupe_key', 'evidence_json']) {
      assert.equal(eventColumnNames.has(name), true, `event.${name}`);
    }

    const dependencyColumns = await db.prepare('PRAGMA table_info(agentsam_agent_run_dependency)').all();
    const dependencyColumnNames = new Set(dependencyColumns.results.map((row) => row.name));
    for (const name of ['parent_run_id', 'child_run_id', 'relation', 'work_item_id', 'step_id', 'status', 'metadata_json']) {
      assert.equal(dependencyColumnNames.has(name), true, 'run_dependency.' + name);
    }

    const queueColumns = await db.prepare('PRAGMA table_info(agentsam_queue_job)').all();
    const queueColumnNames = new Set(queueColumns.results.map((row) => row.name));
    for (const name of [
      'physical_queue', 'logical_queue', 'status', 'available_at',
      'idempotency_key', 'source_run_id', 'step_id',
      'lease_owner', 'lease_expires_at', 'lease_generation', 'job_json',
    ]) {
      assert.equal(queueColumnNames.has(name), true, 'queue_job.' + name);
    }

    const timers = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='active_timers'"
    ).first();
    assert.equal(timers.name, 'active_timers');

    const second = await applyRuntimeMigrations(db);
    assert.equal(second.applied, 0);
    assert.equal(second.results[0].status, 'already_applied');
  } finally {
    db.close();
  }
});

test('ephemeral context digests expire and refresh while durable digests stay durable', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-digest-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const db = await createLocalSqliteDatabase(path.join(root, 'agentsam.sqlite'));
  try {
    await applyRuntimeMigrations(db);

    await db.prepare(
      "INSERT INTO agentsam_context_digest (id,digest_type,source_hash,digest_hash,digest_text) VALUES (?,?,?,?,?)"
    ).bind('repo_1', 'repo', 's1', 'h1', 'durable').run();
    const durable = await db.prepare(
      'SELECT expires_at_unix FROM agentsam_context_digest WHERE id=?'
    ).bind('repo_1').first();
    assert.equal(durable.expires_at_unix, null);

    await db.prepare(
      "INSERT INTO agentsam_context_digest (id,digest_type,source_hash,digest_hash,digest_text) VALUES (?,?,?,?,?)"
    ).bind('session_1', 'session', 's2', 'h2', 'ephemeral').run();
    const initial = await db.prepare(
      'SELECT expires_at_unix FROM agentsam_context_digest WHERE id=?'
    ).bind('session_1').first();
    assert.equal(Number(initial.expires_at_unix) > 0, true);

    await db.prepare(
      'UPDATE agentsam_context_digest SET expires_at_unix = unixepoch() + 60 WHERE id=?'
    ).bind('session_1').run();
    await db.prepare(
      'UPDATE agentsam_context_digest SET hit_count = hit_count + 1 WHERE id=?'
    ).bind('session_1').run();
    const refreshed = await db.prepare(
      'SELECT expires_at_unix, hit_count FROM agentsam_context_digest WHERE id=?'
    ).bind('session_1').first();
    assert.equal(refreshed.hit_count, 1);
    assert.equal(Number(refreshed.expires_at_unix) > Math.floor(Date.now() / 1000) + 2_500_000, true);
  } finally {
    db.close();
  }
});


test('run suspension and event journal persist waits without widening the legacy run status check', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-run-suspend-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const db = await createLocalSqliteDatabase(path.join(root, 'agentsam.sqlite'));
  try {
    await applyRuntimeMigrations(db);
    await db.prepare(`
      INSERT INTO agentsam_agent_run (id, status, mode)
      VALUES (?, 'paused', 'agent')
    `).bind('arun_parent').run();

    await db.prepare(`
      INSERT INTO agentsam_agent_run_suspension (
        run_id, state, reason, wake_event, dependency_run_ids_json, checkpoint_ref
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      'arun_parent',
      'waiting_child',
      'child_run',
      'child.completed',
      JSON.stringify(['arun_child']),
      'checkpoint://step-2',
    ).run();

    const suspended = await db.prepare(`
      SELECT r.status AS run_status, s.state, s.reason, s.wake_event, s.checkpoint_ref
      FROM agentsam_agent_run r
      JOIN agentsam_agent_run_suspension s ON s.run_id = r.id
      WHERE r.id = ?
    `).bind('arun_parent').first();
    assert.equal(suspended.run_status, 'paused');
    assert.equal(suspended.state, 'waiting_child');
    assert.equal(suspended.reason, 'child_run');
    assert.equal(suspended.wake_event, 'child.completed');
    assert.equal(suspended.checkpoint_ref, 'checkpoint://step-2');

    await db.prepare(`
      INSERT INTO agentsam_agent_run_event (
        event_id, run_id, seq, event_type, phase, label, dedupe_key, evidence_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'evt_1', 'arun_parent', 1, 'run.suspended', 'waiting', 'Waiting for child',
      'wake:arun_child:complete', JSON.stringify({ child_run_id: 'arun_child' }),
    ).run();

    await assert.rejects(
      () => db.prepare(`
        INSERT INTO agentsam_agent_run_event (
          event_id, run_id, seq, event_type, phase, label, dedupe_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        'evt_duplicate_dedupe', 'arun_parent', 2, 'run.woken', 'recover', 'Duplicate wake',
        'wake:arun_child:complete',
      ).run(),
      /UNIQUE constraint failed/,
    );

    await assert.rejects(
      () => db.prepare(`
        INSERT INTO agentsam_agent_run_event (event_id, run_id, seq, event_type, phase)
        VALUES (?, ?, ?, ?, ?)
      `).bind('evt_duplicate_seq', 'arun_parent', 1, 'step.progress', 'execute').run(),
      /UNIQUE constraint failed/,
    );

    const events = await db.prepare(
      'SELECT event_id, seq, event_type, dedupe_key FROM agentsam_agent_run_event WHERE run_id = ? ORDER BY seq'
    ).bind('arun_parent').all();
    assert.deepEqual(events.results.map((row) => row.event_id), ['evt_1']);
  } finally {
    db.close();
  }
});
