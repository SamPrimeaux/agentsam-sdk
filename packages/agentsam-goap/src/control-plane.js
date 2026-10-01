import {
  GOAP_SCHEMAS,
  assertGoapPorts,
  normalizeEvent,
  normalizeGoapScope,
} from './contracts.js';
import {
  goapAdapterError,
  goapInputError,
} from './errors.js';

function defaultId(prefix) {
  return prefix + '_' + crypto.randomUUID().replaceAll('-', '');
}

export function createGoapControlPlane({
  ports,
  clock = () => Math.floor(Date.now() / 1000),
  idFactory = defaultId,
} = {}) {
  assertGoapPorts(ports);

  async function snapshot(scopeInput, { eventCursor = null, eventLimit = 50 } = {}) {
    const scope = normalizeGoapScope(scopeInput);
    const blackboard = await ports.blackboardStore.get(scope);
    const goal = blackboard?.current_goal_id
      ? await ports.goalStore.get({ ...scope, id: blackboard.current_goal_id })
      : null;
    const events = await ports.eventStore.list({
      ...scope,
      goal_id: blackboard?.current_goal_id ?? null,
      cursor: eventCursor,
      limit: eventLimit,
    });

    return {
      schema: 'agentsam.goap.snapshot.v1',
      scope,
      blackboard,
      goal,
      events,
    };
  }

  async function activateGoal({
    scope: scopeInput,
    goalId,
    expectedRevision,
    actor = {},
    payload = {},
  } = {}) {
    const scope = normalizeGoapScope(scopeInput);
    if (!goalId) {
      throw goapInputError('goalId is required', {
        stage: 'activate_goal',
        details: { field: 'goalId' },
      });
    }
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw goapInputError('expectedRevision must be a positive integer', {
        stage: 'activate_goal',
        details: { field: 'expectedRevision', value: expectedRevision ?? null },
      });
    }
    if (typeof ports.mutationPort?.activateGoal !== 'function') {
      throw goapAdapterError('mutationPort.activateGoal is required for durable goal activation', {
        stage: 'activate_goal',
        adapter: 'mutationPort',
      });
    }

    const event = normalizeEvent({
      id: idFactory('gevt'),
      goal_id: goalId,
      type: 'goal.activated',
      payload: {
        schema: GOAP_SCHEMAS.event,
        ...payload,
        blackboard_revision: expectedRevision + 1,
      },
      actor_type: actor.type ?? null,
      actor_id: actor.id ?? null,
      created_at: clock(),
    });

    await ports.mutationPort.activateGoal({
      scope,
      goal_id: goalId,
      expected_revision: expectedRevision,
      event,
      updated_at: clock(),
    });

    return snapshot(scope);
  }

  async function appendEvent({ scope: scopeInput, event } = {}) {
    const scope = normalizeGoapScope(scopeInput);
    const normalized = normalizeEvent({
      ...event,
      id: event?.id || idFactory('gevt'),
      created_at: event?.created_at ?? clock(),
    });
    return ports.eventStore.append({ scope, event: normalized });
  }

  return Object.freeze({
    snapshot,
    activateGoal,
    appendEvent,
  });
}
