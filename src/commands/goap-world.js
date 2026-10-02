import { buildRepositoryAuditPacket } from '../agent/repository-audit.js';
import { repositorySnapshot } from '../capabilities/repository-snapshot.js';
import { getNextPlanStep, getPlan, openPlanLedger } from './plan-ledger.js';
import { projectGoapWorld } from '../../packages/agentsam-goap/src/world.js';

const PRIORITY_TO_TICKET = Object.freeze({
  critical: 'P0',
  high: 'P1',
  medium: 'P2',
  low: 'P3',
});

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function knowledgeFreshness(snapshot = {}) {
  const knowledge = snapshot.knowledge || {};
  if (!knowledge.configured) return { status: 'not_configured', reason: 'knowledge_config_missing' };
  if (!knowledge.indexed) return { status: 'not_indexed', reason: 'active_generation_missing' };
  const receipt = knowledge.receipt || {};
  if (receipt.scope && knowledge.scope && stableJson(receipt.scope) !== stableJson(knowledge.scope)) {
    return { status: 'stale', reason: 'scope_policy_changed' };
  }
  if (receipt.merkle_root && snapshot.tree?.merkle_root && receipt.merkle_root !== snapshot.tree.merkle_root) {
    return { status: 'stale', reason: 'repository_merkle_changed' };
  }
  return { status: 'current', reason: 'active_generation_matches_world' };
}

export async function buildLocalGoapState({ cwd = process.cwd(), snapshot = null } = {}) {
  const ctx = openPlanLedger(cwd);
  try {
    const plan = getPlan(ctx, 'current');
    if (!plan) return null;

    const running = (plan.tasks || []).find((task) => task.status === 'running') || null;
    const next = running ? null : getNextPlanStep(ctx, { planId: plan.id });
    const step = running || next?.step || null;
    const world = snapshot || await repositorySnapshot({ cwd: ctx.root });
    const packet = buildRepositoryAuditPacket({
      snapshot: world,
      focus: [plan.title, step?.title].filter(Boolean),
      requestedSections: ['repository', 'tree', 'knowledge', 'packages'],
      evidenceBudget: 6000,
    });
    const freshness = knowledgeFreshness(world);
    const projectedWorld = projectGoapWorld({
      repository: {
        ...world.repository,
        merkle_root: world.tree?.merkle_root || null,
      },
      plan,
      activeTodo: step,
      knowledge: {
        ...freshness,
        generation_id: world.knowledge?.generation_id || null,
      },
      evidence: packet,
      updatedAt: step?.updated_at_unix || plan.updated_at_unix || null,
    });
    const run = step?.agent_run_id
      ? ctx.db.prepare('SELECT * FROM agentsam_agent_run WHERE id = ? LIMIT 1').get(step.agent_run_id) || null
      : null;

    const git = {
      root: ctx.root,
      repoFullName: world.repository?.full_name || ctx.git?.repoFullName || null,
      revisionSha: world.repository?.revision_sha || ctx.git?.revisionSha || null,
      branch: world.repository?.branch || ctx.git?.branch || null,
      dirty: world.repository?.dirty ?? ctx.git?.dirty ?? null,
    };
    const activeTicket = step ? {
      id: step.id,
      title: step.title,
      status: step.status,
      priority: PRIORITY_TO_TICKET[step.priority] || 'P2',
      subsystem: step.metadata?.kind || 'work',
      surface: 'local',
      status_reason: 'selected_from_project_local_plan',
      description: step.description || null,
      agent_run_id: step.agent_run_id || null,
    } : {
      id: plan.id,
      title: plan.title,
      status: plan.tasks_done === plan.tasks_total ? 'complete' : 'active',
      priority: 'P2',
      subsystem: 'plan',
      surface: 'local',
      status_reason: 'plan_has_no_open_executable_step',
      agent_run_id: null,
    };

    return {
      ok: true,
      source: 'local_world',
      repositoryId: world.repository?.repository_id || ctx.repositoryId,
      git,
      workspaceState: {
        current_task_id: step?.id || null,
        locked_by: 'project_local_plan',
        checkpoint_sha: plan.metadata?.revision || null,
        last_agent_action: 'world_snapshot_projected',
        updated_at: step?.updated_at_unix || plan.updated_at_unix || null,
      },
      activeTicket,
      agentRun: run,
      recentCommits: [],
      checkpoint: null,
      cursor: {},
      steps: plan.tasks || [],
      stepsUnavailable: false,
      localPlan: plan,
      localStep: step,
      worldSnapshot: {
        snapshot_id: world.snapshot_id,
        content_hash: world.content_hash,
        merkle_root: world.tree?.merkle_root || null,
        knowledge_generation_id: world.knowledge?.generation_id || null,
        knowledge_freshness: freshness,
        repository: world.repository,
        actions: projectedWorld.actions,
      },
      boundedEvidence: packet,
      canonicalWorld: projectedWorld,
    };
  } finally {
    ctx.close();
  }
}
