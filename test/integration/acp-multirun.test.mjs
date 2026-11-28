import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalSqliteDatabase } from '../../src/local/sqlite.js';
import { applyRuntimeMigrations } from '../../src/local/migrations.js';
import { runtimeDatabasePath, finishRuntimeRun } from '../../src/local/runtime-store.js';
import { LocalAgentControlClient } from '../../src/acp/client.js';

async function fixture(t, id = 'arun_parent') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-acp-multirun-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"acp-multirun-test","private":true}\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const db = await createLocalSqliteDatabase(runtimeDatabasePath(root));
  await applyRuntimeMigrations(db);
  await db.prepare(
    "INSERT INTO agentsam_agent_run (id, account_id, conversation_id, source_client, surface, mode, status, created_at_unix, started_at_unix, updated_at_unix) VALUES (?, 'acct_1', 'conv_1', 'test', 'cli', 'multitask', 'running', 100, 100, 100)"
  ).bind(id).run();
  db.close();
  return { root, client: new LocalAgentControlClient({ cwd: root }), parentId: id };
}

async function query(root, sql, ...params) {
  const db = await createLocalSqliteDatabase(runtimeDatabasePath(root));
  try {
    await applyRuntimeMigrations(db);
    return await db.prepare(sql).bind(...params).all();
  } finally { db.close(); }
}

async function first(root, sql, ...params) {
  const db = await createLocalSqliteDatabase(runtimeDatabasePath(root));
  try {
    await applyRuntimeMigrations(db);
    return await db.prepare(sql).bind(...params).first();
  } finally { db.close(); }
}

test('child spawn creates a canonical spawn job, parent-linked child run, and queued agent work', async (t) => {
  const fx = await fixture(t);
  const spawned = await fx.client.spawn(fx.parentId, {
    child_run_id: 'arun_child',
    objective: 'Implement the backend slice',
    role: 'backend',
    work_item_id: 'work_backend',
    step_id: 'step_backend',
    runtime_requirements: { capabilities: ['exec', 'filesystem'] },
  });

  assert.equal(spawned.parent_run_id, fx.parentId);
  assert.equal(spawned.child_run_id, 'arun_child');
  assert.match(spawned.spawn_job_id, /^spawn_/);
  assert.equal(spawned.queue_job.kind, 'agent.run');
  assert.equal(spawned.queue_job.payload.spawn_job_id, spawned.spawn_job_id);
  assert.equal(spawned.queue_job.payload.runtime_requirements.capabilities[0], 'exec');

  const child = await fx.client.getRun('arun_child');
  assert.equal(child.parentRunId, fx.parentId);
  assert.equal(child.status, 'queued');

  const parent = await fx.client.getRun(fx.parentId);
  assert.equal(parent.status, 'waiting_child');
  assert.equal(parent.storageStatus, 'running');
  assert.equal(Object.hasOwn(parent, 'suspension'), false);

  const spawnJob = await first(
    fx.root,
    'SELECT * FROM agentsam_spawn_job WHERE id=? AND account_id=?',
    spawned.spawn_job_id,
    'acct_1',
  );
  assert.equal(spawnJob.master_run_id, fx.parentId);
  assert.equal(spawnJob.status, 'running');
  assert.equal(spawnJob.subagents_spawned, 1);
  assert.equal(spawnJob.task_description, 'Implement the backend slice');

  const jobs = await query(
    fx.root,
    "SELECT kind, source_run_id, job_json FROM agentsam_queue_job WHERE kind='agent.run'",
  );
  assert.equal(jobs.results.length, 1);
  assert.equal(jobs.results[0].source_run_id, 'arun_child');
  assert.equal(JSON.parse(jobs.results[0].job_json).idempotency_key, 'agent-run:arun_child');

  const parentEvents = await fx.client.events(fx.parentId);
  assert.equal(parentEvents.some((event) => event.eventType === 'run.status'), true);
  assert.equal(parentEvents.some((event) => event.eventType === 'run.suspended'), false);
});

test('finishing the final child reconciles its spawn job and queues one parent resume', async (t) => {
  const fx = await fixture(t);
  const spawned = await fx.client.spawn(fx.parentId, {
    child_run_id: 'arun_child',
    objective: 'Verify the release',
    role: 'verifier',
  });

  await finishRuntimeRun({
    id: 'arun_child',
    status: 'completed',
    projectRoot: fx.root,
    usage: { input_tokens: 12, output_tokens: 5 },
  });

  const spawnJob = await first(fx.root, 'SELECT * FROM agentsam_spawn_job WHERE id=?', spawned.spawn_job_id);
  assert.equal(spawnJob.status, 'completed');
  assert.equal(spawnJob.subagents_spawned, 1);
  assert.equal(spawnJob.subagents_succeeded, 1);
  assert.equal(spawnJob.subagents_failed, 0);
  assert.equal(spawnJob.total_input_tokens, 12);
  assert.equal(spawnJob.total_output_tokens, 5);

  const parent = await fx.client.getRun(fx.parentId);
  assert.equal(parent.status, 'queued');
  assert.equal(Object.hasOwn(parent, 'suspension'), false);

  const events = await fx.client.events(fx.parentId);
  assert.equal(events.some((event) => event.eventType === 'run.woken'), true);

  const resumes = await query(
    fx.root,
    "SELECT job_json FROM agentsam_queue_job WHERE kind='agent.resume' AND source_run_id=?",
    fx.parentId,
  );
  assert.equal(resumes.results.length, 1);
  const resumeJob = JSON.parse(resumes.results[0].job_json);
  assert.equal(resumeJob.idempotency_key, 'agent-resume:arun_parent:after:arun_child');
  assert.equal(resumeJob.payload.completed_child_run_id, 'arun_child');
});

test('multiple spawn jobs keep the parent waiting until every child finishes', async (t) => {
  const fx = await fixture(t);
  const firstSpawn = await fx.client.spawn(fx.parentId, {
    child_run_id: 'arun_child_a',
    objective: 'Build frontend',
    work_item_id: 'work_frontend',
  });
  const secondSpawn = await fx.client.spawn(fx.parentId, {
    child_run_id: 'arun_child_b',
    objective: 'Build backend',
    work_item_id: 'work_backend',
  });

  await finishRuntimeRun({
    id: 'arun_child_a',
    status: 'completed',
    projectRoot: fx.root,
    usage: {},
  });

  const waiting = await fx.client.getRun(fx.parentId);
  assert.equal(waiting.status, 'waiting_child');
  const earlyResumes = await query(
    fx.root,
    "SELECT id FROM agentsam_queue_job WHERE kind='agent.resume' AND source_run_id=?",
    fx.parentId,
  );
  assert.equal(earlyResumes.results.length, 0);

  await finishRuntimeRun({
    id: 'arun_child_b',
    status: 'failed',
    error_code: 'test_failure',
    error_message: 'backend failed verification',
    projectRoot: fx.root,
    usage: {},
  });

  const finalParent = await fx.client.getRun(fx.parentId);
  assert.equal(finalParent.status, 'queued');

  const spawnJobs = await query(
    fx.root,
    'SELECT id, status, subagents_succeeded, subagents_failed FROM agentsam_spawn_job WHERE id IN (?, ?) ORDER BY id',
    firstSpawn.spawn_job_id,
    secondSpawn.spawn_job_id,
  );
  assert.equal(spawnJobs.results.length, 2);
  assert.deepEqual(
    spawnJobs.results.map((row) => [row.status, row.subagents_succeeded, row.subagents_failed]).sort(),
    [['completed', 1, 0], ['failed', 0, 1]],
  );

  const resumes = await query(
    fx.root,
    "SELECT job_json FROM agentsam_queue_job WHERE kind='agent.resume' AND source_run_id=?",
    fx.parentId,
  );
  assert.equal(resumes.results.length, 1);
  const payload = JSON.parse(resumes.results[0].job_json).payload;
  assert.equal(payload.completed_child_status, 'failed');
});

test('agentsam run spawn exposes the provider-neutral spawn-job primitive', async (t) => {
  const fx = await fixture(t);
  const output = [];
  const { runRun } = await import('../../src/commands/run.js');

  const spawned = await runRun([
    'spawn', fx.parentId, '--local', '--objective',
    'Research current implementation', '--role', 'researcher',
    '--runtime-json', '{"capabilities":["filesystem"]}', '--json',
  ], {
    cwd: fx.root,
    write: (value) => output.push(String(value)),
  });

  assert.equal(spawned.parent_run_id, fx.parentId);
  assert.match(spawned.child_run_id, /^arun_/);
  assert.match(spawned.spawn_job_id, /^spawn_/);
  assert.equal(spawned.queue_job.payload.role, 'researcher');
  assert.equal(spawned.queue_job.payload.spawn_job_id, spawned.spawn_job_id);
  assert.deepEqual(spawned.queue_job.payload.runtime_requirements, { capabilities: ['filesystem'] });
  assert.equal(JSON.parse(output.join('')).child_run_id, spawned.child_run_id);
});
