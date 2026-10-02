import {
  goalStatusFromTicket,
  normalizeBlackboard,
  normalizeEvent,
  normalizeGoal,
  normalizeGoapScope,
} from '../contracts.js';
import {
  goapStaleVersion,
  goapTargetNotFound,
} from '../errors.js';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function scopeKey(scopeInput) {
  const scope = normalizeGoapScope(scopeInput);
  return [scope.account_id, scope.repository_id, scope.workspace_id || 'default'].join('::');
}

function goalKey(scopeInput, id) {
  const scope = normalizeGoapScope(scopeInput);
  return [scope.account_id, scope.repository_id, id].join('::');
}

export class MemoryGoapAdapter {
  constructor({ blackboards = [], goals = [], events = [] } = {}) {
    this.blackboards = new Map();
    this.goals = new Map();
    this.events = new Map();
    this.sequence = 0;

    for (const row of blackboards) this.seedBlackboard(row);
    for (const row of goals) this.seedGoal(row);
    for (const row of events) this.seedEvent(row);
  }

  seedBlackboard(row) {
    const normalized = normalizeBlackboard(row);
    const scope = {
      account_id: normalized.account_id,
      repository_id: normalized.repository_id,
      workspace_id: normalized.workspace_id,
    };
    this.blackboards.set(scopeKey(scope), normalized);
    return clone(normalized);
  }

  seedGoal(row) {
    const normalized = normalizeGoal(row);
    this.goals.set(goalKey(normalized, normalized.id), normalized);
    return clone(normalized);
  }

  seedEvent(row) {
    const scope = normalizeGoapScope(row);
    const key = scopeKey(scope);
    const normalized = normalizeEvent(row.event ?? row);
    this.sequence += 1;
    normalized.cursor = 'memory:' + this.sequence;
    if (!this.events.has(key)) this.events.set(key, []);
    this.events.get(key).push(normalized);
    return clone(normalized);
  }

  ports() {
    const adapter = this;
    return {
      blackboardStore: {
        get: async (scope) => clone(adapter.blackboards.get(scopeKey(scope)) ?? null),
        compareAndSwap: async ({ scope, expectedRevision, patch = {} }) => {
          const key = scopeKey(scope);
          const current = adapter.blackboards.get(key);
          if (!current) {
            throw goapTargetNotFound('blackboard', key, {
              stage: 'compare_and_swap',
            });
          }
          if (current.revision !== expectedRevision) {
            throw goapStaleVersion({
              expectedRevision,
              actualRevision: current.revision,
              blackboardId: current.id,
            });
          }
          const next = normalizeBlackboard({
            ...current,
            ...patch,
            current_goal_id: Object.hasOwn(patch, 'current_goal_id')
              ? patch.current_goal_id
              : current.current_goal_id,
            state: patch.state ?? current.state,
            revision: current.revision + 1,
          });
          adapter.blackboards.set(key, next);
          return clone(next);
        },
      },
      goalStore: {
        get: async ({ id, ...scope }) => clone(adapter.goals.get(goalKey(scope, id)) ?? null),
        updateStatus: async ({ id, status, updated_at, ...scope }) => {
          const key = goalKey(scope, id);
          const current = adapter.goals.get(key);
          if (!current) {
            throw goapTargetNotFound('goal', id, {
              stage: 'update_goal_status',
            });
          }
          const next = {
            ...current,
            status: goalStatusFromTicket(status),
            updated_at: updated_at ?? current.updated_at,
          };
          adapter.goals.set(key, next);
          return clone(next);
        },
      },
      eventStore: {
        append: async ({ scope, event }) => {
          const key = scopeKey(scope);
          const normalized = normalizeEvent(event);
          adapter.sequence += 1;
          normalized.cursor = 'memory:' + adapter.sequence;
          if (!adapter.events.has(key)) adapter.events.set(key, []);
          adapter.events.get(key).push(normalized);
          return clone(normalized);
        },
        list: async ({ cursor = null, limit = 50, goal_id = null, ...scope }) => {
          const rows = adapter.events.get(scopeKey(scope)) ?? [];
          const after = cursor ? Number(String(cursor).split(':').at(-1)) || 0 : 0;
          return rows
            .filter((row) => {
              const seq = Number(String(row.cursor).split(':').at(-1)) || 0;
              if (seq <= after) return false;
              return !goal_id || row.goal_id === goal_id;
            })
            .slice(0, Math.max(0, Number(limit) || 50))
            .map(clone);
        },
      },
      mutationPort: {
        activateGoal: async ({ scope, goal_id, expected_revision, event, updated_at }) => {
          const bbKey = scopeKey(scope);
          const gKey = goalKey(scope, goal_id);
          const currentBlackboard = adapter.blackboards.get(bbKey);
          const currentGoal = adapter.goals.get(gKey);

          if (!currentBlackboard) {
            throw goapTargetNotFound('blackboard', bbKey, {
              stage: 'activate_goal',
            });
          }
          if (!currentGoal) {
            throw goapTargetNotFound('goal', goal_id, {
              stage: 'activate_goal',
            });
          }
          if (currentBlackboard.revision !== expected_revision) {
            throw goapStaleVersion({
              expectedRevision: expected_revision,
              actualRevision: currentBlackboard.revision,
              blackboardId: currentBlackboard.id,
              stage: 'activate_goal',
              action: 'activate_goal',
            });
          }

          const nextBlackboard = normalizeBlackboard({
            ...currentBlackboard,
            current_goal_id: goal_id,
            last_action: 'activated_goal',
            updated_at,
            revision: currentBlackboard.revision + 1,
          });
          const nextGoal = {
            ...currentGoal,
            status: 'active',
            updated_at,
          };
          const normalizedEvent = normalizeEvent(event);
          adapter.sequence += 1;
          normalizedEvent.cursor = 'memory:' + adapter.sequence;

          adapter.blackboards.set(bbKey, nextBlackboard);
          adapter.goals.set(gKey, nextGoal);
          if (!adapter.events.has(bbKey)) adapter.events.set(bbKey, []);
          adapter.events.get(bbKey).push(normalizedEvent);

          return {
            blackboard: clone(nextBlackboard),
            goal: clone(nextGoal),
            event: clone(normalizedEvent),
          };
        },
      },
    };
  }
}
