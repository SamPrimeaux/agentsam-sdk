import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createLocalSqliteDatabase } from '../../src/local/sqlite.js';
import { DatabaseAgentControlClient } from '../../src/acp/database-client.js';
import { createD1QueueControl, reconcileParentAfterChildTerminal } from '../../src/acp/dependencies.js';

const plain = (value) => JSON.parse(JSON.stringify(value));

test('ACP spawn and approval lifecycle runs against the strict production D1 table contract', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-acp-production-d1-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const db = await createLocalSqliteDatabase(path.join(root, 'production-contract.sqlite'));
  try {
    db.exec(fs.readFileSync(new URL('../fixtures/acp-production-d1-schema.sql', import.meta.url), 'utf8'));
    await db.prepare('INSERT INTO accounts (id) VALUES (?)').bind('acct_production').run();

    const client = new DatabaseAgentControlClient({
      database: db,
      kind: 'cloudflare-d1',
      accountId: 'acct_production',
      actorId: 'user_42',
      requireAccount: true,
      queueControl: createD1QueueControl(db, { environment: 'production-test' }),
    });

    const rootRun = await client.start({
      run_id: 'arun_production_root',
      objective: 'Coordinate production work',
      mode: 'agent',
      selected_by: 'automatic',
      routing_arm_id: 'arm_automatic_1',
    });
    assert.equal(rootRun.run_id, 'arun_production_root');

    const storedRoot = await db.prepare(
      'SELECT selected_by, routing_arm_id, status FROM agentsam_agent_run WHERE id = ?'
    ).bind(rootRun.run_id).first();
    assert.deepEqual(plain(storedRoot), {
      selected_by: 'thompson',
      routing_arm_id: 'arm_automatic_1',
      status: 'queued',
    });
    assert.equal((await client.getRun(rootRun.run_id)).selectedBy, 'automatic');

    const toolApproval = await client.requestApproval({
      agent_run_id: rootRun.run_id,
      action_summary: 'Apply the protected database change',
      approval_type: 'db_write',
      risk_level: 'high',
      capability_key: 'database.write',
      tool_name: 'database.apply_migration',
      sanitized_input: { migration: 'production-contract-test' },
      metadata: { source: 'strict-d1-test' },
    });
    assert.equal(toolApproval.status, 'pending');
    assert.equal((await client.getRun(rootRun.run_id)).status, 'awaiting_approval');
    const decidedToolApproval = await client.decideApproval(toolApproval.id, {
      decision: 'approved',
      reason: 'Reviewed by the authenticated actor',
    });
    assert.equal(decidedToolApproval.approval.status, 'approved');
    assert.equal(decidedToolApproval.approval.approvedBy, 'user_42');
    assert.equal(decidedToolApproval.resume.woke, true);
    assert.equal((await client.getRun(rootRun.run_id)).status, 'queued');
    const approvalResume = await db.prepare(
      "SELECT job_json FROM agentsam_queue_job WHERE source_run_id = ? AND kind = 'agent.resume' ORDER BY created_at_unix DESC LIMIT 1"
    ).bind(rootRun.run_id).first();
    assert.equal(JSON.parse(approvalResume.job_json).payload.wake_reason, 'approval');

    const gatedSpawn = await client.spawn(rootRun.run_id, {
      spawn_job_id: 'spawn_production_1',
      objective: 'Build and verify the child task',
      requires_approval: true,
      children: [{
        child_run_id: 'arun_production_child',
        objective: 'Implement the child task',
        role: 'implementer',
        selected_by: 'automatic',
        routing_arm_id: 'arm_child_automatic',
      }],
    });
    assert.equal(gatedSpawn.status, 'awaiting_approval');
    assert.ok(gatedSpawn.approval_id);
    const childBeforeApproval = await db.prepare(
      'SELECT COUNT(*) AS count FROM agentsam_agent_run WHERE id = ?'
    ).bind('arun_production_child').first();
    assert.equal(childBeforeApproval.count, 0);

    const pendingSpawn = await db.prepare(
      'SELECT status, master_run_id, subagents_spawned FROM agentsam_spawn_job WHERE id = ?'
    ).bind(gatedSpawn.spawn_job_id).first();
    assert.deepEqual(plain(pendingSpawn), {
      status: 'awaiting_approval',
      master_run_id: rootRun.run_id,
      subagents_spawned: 0,
    });

    const spawnDecision = await client.decideApproval(gatedSpawn.approval_id, {
      decision: 'approved',
      reason: 'Child work approved',
    });
    assert.equal(spawnDecision.approval.status, 'approved');
    assert.equal(spawnDecision.spawn.status, 'running');
    assert.deepEqual(spawnDecision.spawn.child_run_ids, ['arun_production_child']);

    const child = await client.getRun('arun_production_child');
    assert.equal(child.parentRunId, rootRun.run_id);
    assert.equal(child.selectedBy, 'automatic');
    assert.equal(child.status, 'queued');

    const storedChild = await db.prepare(
      'SELECT parent_run_id, selected_by, routing_arm_id, status FROM agentsam_agent_run WHERE id = ?'
    ).bind('arun_production_child').first();
    assert.deepEqual(plain(storedChild), {
      parent_run_id: rootRun.run_id,
      selected_by: 'thompson',
      routing_arm_id: 'arm_child_automatic',
      status: 'queued',
    });

    const queueChild = await db.prepare(
      'SELECT source_run_id, kind, job_json FROM agentsam_queue_job WHERE source_run_id = ?'
    ).bind('arun_production_child').first();
    assert.equal(queueChild.source_run_id, 'arun_production_child');
    assert.equal(queueChild.kind, 'agent.run');
    assert.equal(JSON.parse(queueChild.job_json).payload.spawn_job_id, 'spawn_production_1');
    assert.equal((await client.getRun(rootRun.run_id)).status, 'waiting_child');

    await db.prepare(
      "UPDATE agentsam_agent_run SET status = 'completed', input_tokens = 9, output_tokens = 4, completed_at_unix = unixepoch(), updated_at_unix = unixepoch() WHERE id = ?"
    ).bind('arun_production_child').run();
    const reconciliation = await reconcileParentAfterChildTerminal(db, {
      runId: 'arun_production_child',
      status: 'completed',
    });
    assert.equal(reconciliation.woke_parent, true);

    const completedSpawn = await db.prepare(
      'SELECT status, subagents_spawned, subagents_succeeded, subagents_failed, total_input_tokens, total_output_tokens FROM agentsam_spawn_job WHERE id = ?'
    ).bind('spawn_production_1').first();
    assert.deepEqual(plain(completedSpawn), {
      status: 'completed',
      subagents_spawned: 1,
      subagents_succeeded: 1,
      subagents_failed: 0,
      total_input_tokens: 9,
      total_output_tokens: 4,
    });
    assert.equal((await client.getRun(rootRun.run_id)).status, 'queued');

    const deniedSpawn = await client.spawn(rootRun.run_id, {
      spawn_job_id: 'spawn_production_denied',
      objective: 'Protected child work',
      requires_approval: true,
      child_run_id: 'arun_production_denied_child',
    });
    const deniedDecision = await client.decideApproval(deniedSpawn.approval_id, {
      decision: 'denied', reason: 'Not authorized for this action',
    });
    assert.equal(deniedDecision.approval.status, 'denied');
    assert.equal(deniedDecision.resume.woke, true);
    const deniedJob = await db.prepare(
      'SELECT status, error_message FROM agentsam_spawn_job WHERE id = ?'
    ).bind('spawn_production_denied').first();
    assert.equal(deniedJob.status, 'failed');
    assert.match(deniedJob.error_message, /Not authorized/);
    const deniedChild = await db.prepare(
      'SELECT id FROM agentsam_agent_run WHERE id = ?'
    ).bind('arun_production_denied_child').first();
    assert.equal(deniedChild, null);

    const legacyTables = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('agentsam_agent_run_suspension','agentsam_agent_run_dependency')"
    ).all();
    assert.deepEqual(legacyTables.results, []);
  } finally {
    db.close();
  }
});
