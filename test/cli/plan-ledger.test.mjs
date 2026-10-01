import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createLocalSqliteDatabaseSync } from '../../src/local/sqlite.js';
import { applyRuntimeMigrationsSync } from '../../src/local/migrations.js';
import {
  addPlanStep,
  createPlan,
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
