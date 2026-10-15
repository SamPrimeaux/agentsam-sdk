/**
 * Portable model-facing view of the existing local Plan ledger and SAM GOAP
 * engine. This is not another planning store or planner.
 */
import {
  openPlanLedger, listPlans, getPlan, getNextPlanStep, createPlan,
  addPlanStep, addPlanStepEvidence, acceptPlanStep, addPlanDependency,
  setPlanStepStatus, setPlanStatus,
} from '../commands/plan-ledger.js';
import { planningGoapOp } from '../sam/operations/planning-goap.js';

const nonempty = (value, key, maximum = 1000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new Error(key + '_invalid');
  return value.trim();
};

export function invokePlanOperation(id, input = {}, root) {
  if (id === 'planning.goap') {
    if (!Array.isArray(input.actions) || input.actions.length > 120)
      throw new Error('planning_actions_invalid');
    // Use SAM's already registered GOAP/A* planner, not a second solver.
    return planningGoapOp.handler({ ...input, maxExpansions: Math.min(10000, input.maxExpansions ?? 1000) });
  }
  const readOnly = ['plan.list', 'plan.show', 'plan.next'].includes(id);
  const ctx = openPlanLedger(root, { readOnly });
  try {
    switch (id) {
      case 'plan.list': {
        const plans = listPlans(ctx, { all: input.all === true });
        return { initialized: Boolean(ctx.db), repository_id: ctx.repositoryId,
          plans: plans.slice(0, 30), count: plans.length, truncated: plans.length > 30 };
      }
      case 'plan.show': {
        const plan = getPlan(ctx, input.plan_id || 'current');
        if (!plan) return { initialized: Boolean(ctx.db), repository_id: ctx.repositoryId, plan: null };
        const limit = 80;
        return { initialized: true, repository_id: ctx.repositoryId,
          plan: { ...plan, tasks: plan.tasks.slice(0, limit) },
          task_count: plan.tasks.length, truncated: plan.tasks.length > limit };
      }
      case 'plan.next':
        return { repository_id: ctx.repositoryId,
          ...getNextPlanStep(ctx, { planId: input.plan_id || 'current', start: false }) };
      case 'plan.create':
        return createPlan(ctx, { title: nonempty(input.title, 'plan_title', 180),
          goal: input.goal ? nonempty(input.goal, 'plan_goal', 2000) : undefined,
          planType: input.plan_type || 'feature' });
      case 'plan.step.add':
        return addPlanStep(ctx, {
          planId: input.plan_id || 'current',
          title: nonempty(input.title, 'step_title', 180),
          description: input.description ? nonempty(input.description, 'step_description', 3000) : null,
          kind: input.kind || 'work',
          priority: input.priority || 'medium',
          acceptance: Array.isArray(input.acceptance) && input.acceptance.length <= 40 ? input.acceptance.map(criterion => ({
            criterion: nonempty(criterion, 'acceptance_criterion', 500),
            required: true, status: 'pending',
          })) : (input.acceptance === undefined ? [] : (() => { throw new Error('acceptance_limit_invalid'); })()),
          requiresApproval: input.requires_approval === true,
        });
      case 'plan.step.status':
        return setPlanStepStatus(ctx, nonempty(input.step_id, 'step_id', 120),
          nonempty(input.status, 'step_status', 30), { reason: input.reason || null });
      case 'plan.step.evidence':
        return addPlanStepEvidence(ctx, nonempty(input.step_id, 'step_id', 120), {
          type: input.type || 'evidence', ref: nonempty(input.ref, 'evidence_ref', 2048),
          note: input.note ? nonempty(input.note, 'evidence_note', 1000) : null,
        });
      case 'plan.step.accept':
        return acceptPlanStep(ctx, nonempty(input.step_id, 'step_id', 120),
          nonempty(input.criterion, 'acceptance_criterion', 500),
          { evidenceRef: input.evidence_ref || null });
      case 'plan.step.depends':
        return addPlanDependency(ctx, nonempty(input.step_id, 'step_id', 120),
          nonempty(input.dependency_id, 'dependency_id', 120));
      case 'plan.status':
        return setPlanStatus(ctx, input.plan_id || 'current',
          nonempty(input.status, 'plan_status', 30));
      default: throw new Error('plan_operation_unknown:' + id);
    }
  } finally { ctx.close(); }
}

export { PLAN_READ_OPERATIONS, PLAN_WRITE_OPERATIONS } from './plan-operation-ids.js';
