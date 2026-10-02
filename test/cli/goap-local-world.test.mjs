import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  addPlanStep,
  createPlan,
  openPlanLedger,
  setPlanStepStatus,
} from '../../src/commands/plan-ledger.js';
import { buildLocalGoapState, knowledgeFreshness } from '../../src/commands/goap-world.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-goap-world-'));
  fs.mkdirSync(path.join(root, '.agentsam', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agentsam', 'config.json'), JSON.stringify({
    schema_version: 2,
    repository: { id: 'local:fixture' },
    local: { database: '.agentsam/data/agentsam.sqlite' },
  }, null, 2));
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function snapshot(root, merkle = 'sha256:world') {
  return {
    schema_version: 1,
    capability: 'repository.snapshot',
    snapshot_id: 'rsnap_fixture',
    content_hash: 'sha256:fixture',
    repository: {
      repository_id: 'local:fixture',
      full_name: 'fixture',
      branch: 'main',
      revision_sha: '0123456789abcdef0123456789abcdef01234567',
      dirty: false,
    },
    tree: { merkle_root: merkle, stats: {}, paths: [], files: [] },
    intelligence: { summary: {}, languages: [], manifests: [], top_level: [], pressure_points: [] },
    packages: [],
    knowledge: {
      configured: true,
      indexed: true,
      generation_id: 'gen_fixture',
      scope: { name: 'ingest', include: ['src'], exclude: [] },
      receipt: {
        scope: { name: 'ingest', include: ['src'], exclude: [] },
        merkle_root: merkle,
      },
    },
    analysis: { trust_boundary: null },
    deploy: null,
    root,
  };
}

test('knowledge freshness distinguishes current world, changed policy, and changed merkle', () => {
  const current = snapshot('/tmp');
  assert.deepEqual(knowledgeFreshness(current), {
    status: 'current',
    reason: 'active_generation_matches_world',
  });

  const policy = snapshot('/tmp');
  policy.knowledge.receipt.scope = { name: 'ingest', include: ['packages'], exclude: [] };
  assert.equal(knowledgeFreshness(policy).reason, 'scope_policy_changed');

  const changed = snapshot('/tmp', 'sha256:new');
  changed.knowledge.receipt.merkle_root = 'sha256:old';
  assert.equal(knowledgeFreshness(changed).reason, 'repository_merkle_changed');
});

test('local GOAP world projects the running plan and derives actions without remote state', async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const ctx = openPlanLedger(root);
  try {
    const active = createPlan(ctx, { title: 'Active world goal' });
    const running = addPlanStep(ctx, {
      planId: active.id,
      title: 'Current machine action',
      priority: 'critical',
      kind: 'implement',
    });
    setPlanStepStatus(ctx, running.id, 'running');
    addPlanStep(ctx, {
      planId: active.id,
      title: 'Next action',
      priority: 'high',
      kind: 'verify',
    });

    const newer = createPlan(ctx, { title: 'Newer but not running' });
    addPlanStep(ctx, { planId: newer.id, title: 'Other action', priority: 'critical' });
  } finally {
    ctx.close();
  }

  const state = await buildLocalGoapState({ cwd: root, snapshot: snapshot(root) });
  assert.equal(state.ok, true);
  assert.equal(state.source, 'local_world');
  assert.equal(state.localPlan.title, 'Active world goal');
  assert.equal(state.localStep.title, 'Current machine action');
  assert.equal(state.activeTicket.id, state.localStep.id);
  assert.equal(state.worldSnapshot.knowledge_freshness.status, 'current');
  assert.equal(state.worldSnapshot.actions.available.some((action) => action.title === 'Next action'), true);
  assert.equal(state.boundedEvidence.primitive, 'repository.audit');
});
