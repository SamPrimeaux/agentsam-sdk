export const GOAP_SCHEMAS = Object.freeze({
  blackboard: 'agentsam.blackboard.v1',
  goal: 'agentsam.goal.v1',
  action: 'agentsam.goap.action.v1',
  plan: 'agentsam.goap.plan.v1',
  event: 'agentsam.event.v1',
});

export const GOAL_STATUSES = Object.freeze([
  'proposed',
  'active',
  'blocked',
  'verifying',
  'satisfied',
  'cancelled',
]);

export const TICKET_TO_GOAL_STATUS = Object.freeze({
  backlog: 'proposed',
  active: 'active',
  blocked: 'blocked',
  in_review: 'verifying',
  shipped: 'satisfied',
  abandoned: 'cancelled',
});

export const GOAL_TO_TICKET_STATUS = Object.freeze(
  Object.fromEntries(Object.entries(TICKET_TO_GOAL_STATUS).map(([ticket, goal]) => [goal, ticket])),
);

export const GOAP_PORT_METHODS = Object.freeze({
  blackboardStore: ['get', 'compareAndSwap'],
  goalStore: ['get', 'updateStatus'],
  eventStore: ['append', 'list'],
  planStore: ['get'],
  planRunStore: ['get', 'heartbeat'],
  actionRunStore: ['get', 'record'],
  approvalPort: ['request', 'get'],
  queuePort: ['dispatch'],
  runtimePort: ['execute'],
  evidencePort: ['attach'],
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export class GoapConflictError extends Error {
  constructor(message = 'goap_revision_conflict', detail = {}) {
    super(message);
    this.name = 'GoapConflictError';
    this.code = 'goap_revision_conflict';
    this.detail = detail;
  }
}

export function normalizeGoapScope(input = {}) {
  const accountId = clean(input.account_id ?? input.accountId);
  const repositoryId = clean(input.repository_id ?? input.repositoryId);
  const workspaceId = clean(input.workspace_id ?? input.workspaceId) || null;

  if (!accountId) throw new TypeError('scope.account_id is required');
  if (!repositoryId) throw new TypeError('scope.repository_id is required');

  return {
    account_id: accountId,
    repository_id: repositoryId,
    workspace_id: workspaceId,
  };
}

export function goalStatusFromTicket(status) {
  const mapped = TICKET_TO_GOAL_STATUS[clean(status)];
  if (!mapped) throw new TypeError('Unsupported ticket status: ' + status);
  return mapped;
}

export function ticketStatusFromGoal(status) {
  const mapped = GOAL_TO_TICKET_STATUS[clean(status)];
  if (!mapped) throw new TypeError('Unsupported GOAP goal status: ' + status);
  return mapped;
}

export function normalizeGoalSpec(input = {}) {
  const source = objectOrEmpty(input);
  const desired = Array.isArray(source.desired)
    ? source.desired.map((fact) => ({ ...objectOrEmpty(fact) }))
    : [];

  return {
    schema: GOAP_SCHEMAS.goal,
    desired,
    constraints: Array.isArray(source.constraints)
      ? source.constraints.map((constraint) => ({ ...objectOrEmpty(constraint) }))
      : [],
    metadata: { ...objectOrEmpty(source.metadata) },
  };
}

export function normalizeActionSpec(input = {}) {
  const source = objectOrEmpty(input);
  return {
    schema: GOAP_SCHEMAS.action,
    preconditions: Array.isArray(source.preconditions)
      ? source.preconditions.map((fact) => ({ ...objectOrEmpty(fact) }))
      : [],
    effects: Array.isArray(source.effects)
      ? source.effects.map((fact) => ({ ...objectOrEmpty(fact) }))
      : [],
    cost: Number.isFinite(Number(source.cost)) ? Number(source.cost) : 1,
    metadata: { ...objectOrEmpty(source.metadata) },
  };
}

export function normalizeBlackboard(input = {}) {
  const revision = Number(input.revision ?? 1);
  return {
    schema: GOAP_SCHEMAS.blackboard,
    id: clean(input.id) || null,
    account_id: clean(input.account_id ?? input.accountId) || null,
    repository_id: clean(input.repository_id ?? input.repositoryId) || null,
    workspace_id: clean(input.workspace_id ?? input.workspaceId) || null,
    current_goal_id: clean(input.current_goal_id ?? input.currentGoalId ?? input.current_task_id) || null,
    state: { ...objectOrEmpty(input.state ?? input.state_json) },
    revision: Number.isInteger(revision) && revision > 0 ? revision : 1,
    locked_by: clean(input.locked_by ?? input.lockedBy) || null,
    lock_expires_at: input.lock_expires_at ?? input.lockExpiresAt ?? null,
    checkpoint_sha: clean(input.checkpoint_sha ?? input.checkpointSha) || null,
    last_action: clean(input.last_action ?? input.lastAction ?? input.last_agent_action) || null,
    updated_at: input.updated_at ?? input.updatedAt ?? null,
  };
}

export function normalizeGoal(input = {}) {
  const status = input.goal_status
    ? clean(input.goal_status)
    : goalStatusFromTicket(input.status ?? 'backlog');

  if (!GOAL_STATUSES.includes(status)) {
    throw new TypeError('Unsupported GOAP goal status: ' + status);
  }

  return {
    schema: GOAP_SCHEMAS.goal,
    id: clean(input.id),
    account_id: clean(input.account_id ?? input.accountId),
    repository_id: clean(input.repository_id ?? input.repositoryId),
    title: clean(input.title),
    status,
    priority: clean(input.priority) || null,
    spec: normalizeGoalSpec(input.spec ?? input.goal_spec_json ?? {}),
    created_at: input.created_at ?? input.createdAt ?? null,
    updated_at: input.updated_at ?? input.updatedAt ?? null,
  };
}

export function normalizeEvent(input = {}) {
  const type = clean(input.type ?? input.event_type);
  if (!type) throw new TypeError('event.type is required');

  return {
    schema: GOAP_SCHEMAS.event,
    id: clean(input.id) || null,
    goal_id: clean(input.goal_id ?? input.goalId ?? input.ticket_id) || null,
    type,
    payload: { ...objectOrEmpty(input.payload ?? input.payload_json) },
    actor_type: clean(input.actor_type ?? input.actorType) || null,
    actor_id: clean(input.actor_id ?? input.actorId) || null,
    workflow_run_id: clean(input.workflow_run_id ?? input.workflowRunId) || null,
    execution_step_id: clean(input.execution_step_id ?? input.executionStepId) || null,
    created_at: input.created_at ?? input.createdAt ?? null,
    cursor: clean(input.cursor) || null,
  };
}

export function assertGoapPorts(ports = {}, required = ['blackboardStore', 'goalStore', 'eventStore']) {
  for (const portName of required) {
    const port = ports[portName];
    if (!port || typeof port !== 'object') throw new TypeError(portName + ' is required');
    for (const method of GOAP_PORT_METHODS[portName] || []) {
      if (typeof port[method] !== 'function') {
        throw new TypeError(portName + '.' + method + ' must be a function');
      }
    }
  }
  return ports;
}
