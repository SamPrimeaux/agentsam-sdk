import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalSqliteDatabase } from '../../src/local/sqlite.js';
import { applyRuntimeMigrations } from '../../src/local/migrations.js';

test('portable runtime migration installs AgentSam CLI state tables idempotently', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-runtime-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const db = await createLocalSqliteDatabase(path.join(root, 'agentsam.sqlite'));
  try {
    const first = await applyRuntimeMigrations(db);
    assert.equal(first.applied, 2);

    const tables = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agentsam_%' ORDER BY name"
    ).all();
    const names = new Set(tables.results.map((row) => row.name));
    for (const name of [
      'agentsam_agent_run',
      'agentsam_approval_queue',
      'agentsam_compaction_events',
      'agentsam_context_digest',
      'agentsam_cron_runs',
      'agentsam_plans',
      'agentsam_project_sessions',
      'agentsam_schema_migrations',
      'agentsam_todo',
    ]) assert.equal(names.has(name), true, name);

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
