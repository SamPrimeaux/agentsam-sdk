import {
  GOAP_SCHEMAS,
  normalizeActionSpec,
  normalizeBlackboard,
  normalizeGoal,
} from './contracts.js';
import { goapInputError } from './errors.js';

const TODO_TO_GOAL_STATUS = Object.freeze({
  open: 'proposed',
  running: 'active',
  blocked: 'blocked',
  complete: 'satisfied',
  cancelled: 'cancelled',
});

const PRIORITY_COST = Object.freeze({
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function taskById(plan) {
  return new Map(array(plan?.tasks).map((task) => [task.id, task]));
}

function blockersFor(plan, task) {
  const byId = taskById(plan);
  return array(task?.metadata?.depends_on)
    .map((id) => byId.get(id) || { id, title: null, status: 'missing' })
    .filter((dependency) => dependency.status !== 'complete')
    .map((dependency) => ({
      id: dependency.id,
      title: dependency.title || null,
      status: dependency.status,
    }));
}

export function projectPlanActions(plan = {}) {
  const available = [];
  const blocked = [];

  for (const task of array(plan.tasks)) {
    if (task.status !== 'open') continue;
    const blockers = blockersFor(plan, task);
    const action = {
      id: task.id,
      title: task.title,
      status: task.status,
      spec: normalizeActionSpec({
        preconditions: array(task.metadata?.depends_on).map((todoId) => ({
          fact: 'todo.complete',
          todo_id: todoId,
          value: true,
        })),
        effects: [{
          fact: 'todo.complete',
          todo_id: task.id,
          value: true,
        }],
        cost: PRIORITY_COST[task.priority] ?? 3,
        metadata: {
          kind: task.metadata?.kind || 'work',
          priority: task.priority || 'medium',
          sort_order: Number(task.sort_order ?? 50),
        },
      }),
    };

    if (blockers.length) blocked.push({ ...action, blockers });
    else available.push(action);
  }

  return { available, blocked };
}

export function projectGoapWorld({
  repository = {},
  plan,
  activeTodo = null,
  actions = null,
  knowledge = {},
  evidence = null,
  accountId = null,
  revision = 1,
  updatedAt = null,
} = {}) {
  const repositoryId = clean(repository.repository_id ?? repository.repositoryId);
  if (!repositoryId) {
    throw goapInputError('repository.repository_id is required for GOAP world projection', {
      stage: 'project_world',
      details: { field: 'repository.repository_id' },
    });
  }
  if (!plan?.id) {
    throw goapInputError('plan.id is required for GOAP world projection', {
      stage: 'project_world',
      details: { field: 'plan.id' },
    });
  }

  const projectedActions = actions || projectPlanActions(plan);
  const todo = activeTodo || null;
  const goalId = todo?.id || plan.id;
  const goalTitle = todo?.title || plan.title || plan.id;
  const goalStatus = todo
    ? (TODO_TO_GOAL_STATUS[todo.status] || 'proposed')
    : (Number(plan.tasks_done || 0) === Number(plan.tasks_total || -1) ? 'satisfied' : 'active');

  const state = {
    plan: {
      id: plan.id,
      title: plan.title || null,
      status: plan.status || null,
      tasks_done: Number(plan.tasks_done || 0),
      tasks_total: Number(plan.tasks_total || array(plan.tasks).length),
    },
    todo: todo ? {
      id: todo.id,
      title: todo.title || null,
      status: todo.status || null,
      priority: todo.priority || null,
      kind: todo.metadata?.kind || 'work',
      depends_on: array(todo.metadata?.depends_on),
      acceptance: array(todo.metadata?.acceptance),
      evidence: array(todo.metadata?.evidence),
    } : null,
    repository: {
      repository_id: repositoryId,
      branch: repository.branch || null,
      revision_sha: repository.revision_sha || repository.revisionSha || null,
      dirty: repository.dirty ?? null,
      merkle_root: repository.merkle_root || null,
    },
    knowledge: { ...object(knowledge) },
    actions: projectedActions,
    evidence: evidence || null,
  };

  const blackboard = normalizeBlackboard({
    id: 'world:' + repositoryId,
    account_id: clean(accountId) || null,
    repository_id: repositoryId,
    current_goal_id: goalId,
    state,
    revision,
    locked_by: 'project_local_plan',
    checkpoint_sha: repository.revision_sha || repository.revisionSha || null,
    last_action: 'world_snapshot_projected',
    updated_at: updatedAt,
  });

  const goal = normalizeGoal({
    id: goalId,
    account_id: clean(accountId),
    repository_id: repositoryId,
    title: goalTitle,
    goal_status: goalStatus,
    priority: todo?.priority || null,
    spec: {
      desired: [{
        fact: todo ? 'todo.complete' : 'plan.complete',
        [todo ? 'todo_id' : 'plan_id']: goalId,
        value: true,
      }],
      constraints: array(todo?.metadata?.depends_on).map((todoId) => ({
        fact: 'todo.complete',
        todo_id: todoId,
        value: true,
      })),
      metadata: {
        source: 'project_local_plan',
        plan_id: plan.id,
        todo_id: todo?.id || null,
      },
    },
    updated_at: updatedAt,
  });

  return {
    schema: GOAP_SCHEMAS.world,
    source: 'project_local_plan',
    repository_id: repositoryId,
    blackboard,
    goal,
    actions: projectedActions,
    evidence: evidence || null,
  };
}
