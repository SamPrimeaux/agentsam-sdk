import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createLocalSqliteDatabaseSync } from '../../src/local/sqlite.js';
import { applyRuntimeMigrationsSync } from '../../src/local/migrations.js';
import {
  acceptPlanStep,
  addPlanDependency,
  addPlanStep,
  addPlanStepEvidence,
  createPlan,
  getNextPlanStep,
  getPlan,
  listPlans,
  openPlanLedger,
  setPlanStatus,
  setPlanStepStatus,
} from '../../src/commands/plan-ledger.js';

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-plan-ledger-'));
  fs.mkdirSync(path.join(root, '.agentsam', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agentsam', 'config.json'), JSON.stringify({
    schema_version: 2,
    project: { name: 'fixture' },
    repository: { id: 'local:fixture' },
    local: {
      database: '.agentsam/data/agentsam.sqlite',
      schema: 'db/schema.sql',
    },
  }, null, 2));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const dbPath = path.join(root, '.agentsam', 'data', 'agentsam.sqlite');
  const db = createLocalSqliteDatabaseSync(dbPath);
  try { applyRuntimeMigrationsSync(db); }
  finally { db.close(); }
  return root;
}

test('local plan ledger persists a repo-scoped plan and task lifecycle', () => {
  const root = makeRepo();
  const ctx = openPlanLedger(root);
  try {
    const plan = createPlan(ctx, {
      title: 'Polish editor',
      goal: 'Ship a bounded evidence-driven polish pass',
      planType: 'sprint',
      tokenBudget: 50000,
    });
    assert.equal(plan.status, 'active');
    assert.equal(plan.metadata.repository_id, 'local:fixture');
    assert.equal(listPlans(ctx).length, 1);

    const step = addPlanStep(ctx, {
      planId: plan.id,
      title: 'Inspect selection contract',
      kind: 'inspect',
      priority: 'high',
    });
    assert.equal(step.status, 'open');
    assert.equal(step.metadata.kind, 'inspect');

    const running = setPlanStepStatus(ctx, step.id, 'running');
    assert.equal(running.status, 'running');
    assert.ok(running.started_at_unix);

    const blocked = setPlanStepStatus(ctx, step.id, 'blocked', { reason: 'missing contract test' });
    assert.equal(blocked.metadata.blocker_reason, 'missing contract test');
    assert.equal(getPlan(ctx, plan.id).tasks_blocked, 1);

    const done = setPlanStepStatus(ctx, step.id, 'complete');
    assert.equal(done.status, 'complete');
    assert.ok(done.completed_at_unix);
    const refreshed = getPlan(ctx, plan.id);
    assert.equal(refreshed.tasks_total, 1);
    assert.equal(refreshed.tasks_done, 1);
    assert.equal(refreshed.tasks_blocked, 0);

    const completed = setPlanStatus(ctx, plan.id, 'complete');
    assert.equal(completed.status, 'complete');
    assert.equal(listPlans(ctx).length, 0);
    assert.equal(listPlans(ctx, { all: true }).length, 1);
  } finally {
    ctx.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('plan next honors dependency and priority ordering and can start atomically', () => {
  const root = makeRepo();
  const ctx = openPlanLedger(root);
  try {
    const plan = createPlan(ctx, { title: 'Ship machinery' });
    const low = addPlanStep(ctx, { planId: plan.id, title: 'Low', priority: 'low', kind: 'verify' });
    const dep = addPlanStep(ctx, { planId: plan.id, title: 'Dependency', priority: 'high', kind: 'inspect' });
    const critical = addPlanStep(ctx, { planId: plan.id, title: 'Critical blocked', priority: 'critical', kind: 'implement' });
    addPlanDependency(ctx, critical.id, dep.id);

    const next = getNextPlanStep(ctx, { planId: plan.id });
    assert.equal(next.step.id, dep.id);
    assert.equal(next.blocked.some((row) => row.task_id === critical.id), true);

    setPlanStepStatus(ctx, dep.id, 'complete');
    const started = getNextPlanStep(ctx, { planId: plan.id, start: true });
    assert.equal(started.step.id, critical.id);
    assert.equal(started.step.status, 'running');
    assert.equal(started.selection, 'started');

    const continuity = getNextPlanStep(ctx, { planId: plan.id });
    assert.equal(continuity.step.id, critical.id);
    assert.equal(continuity.selection, 'running');

    setPlanStepStatus(ctx, critical.id, 'complete');
    const after = getNextPlanStep(ctx, { planId: plan.id });
    assert.equal(after.step.id, low.id);
  } finally {
    ctx.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan acceptance and evidence turn TODO completion into a gated ledger', () => {
  const root = makeRepo();
  const ctx = openPlanLedger(root);
  try {
    const plan = createPlan(ctx, { title: 'Prove work' });
    const step = addPlanStep(ctx, {
      planId: plan.id,
      title: 'Write contract',
      acceptance: [{ criterion: 'Contract persisted', required: true, status: 'pending' }],
    });

    assert.throws(() => setPlanStepStatus(ctx, step.id, 'complete'), /step_acceptance_incomplete/);

    const evidenced = addPlanStepEvidence(ctx, step.id, { type: 'file', ref: 'docs/contract.md' });
    assert.equal(evidenced.metadata.evidence.length, 1);

    const accepted = acceptPlanStep(ctx, step.id, 'Contract persisted', { evidenceRef: 'docs/contract.md' });
    assert.equal(accepted.metadata.acceptance[0].status, 'accepted');

    const done = setPlanStepStatus(ctx, step.id, 'complete');
    assert.equal(done.status, 'complete');
  } finally {
    ctx.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
