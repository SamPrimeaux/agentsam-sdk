import {
  GoapConflictError,
  goalStatusFromTicket,
  normalizeBlackboard,
  normalizeEvent,
  normalizeGoal,
  normalizeGoapScope,
} from '../contracts.js';

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
    return {
      blackboardStore: {
        get: async (scope) => clone(this.blackboards.get(scopeKey(scope)) ?? null),
        compareAndSwap: async ({ scope, expectedRevision, patch = {} }) => {
          const key = scopeKey(scope);
          const current = this.blackboards.get(key);
          if (!current) throw new Error('blackboard_not_found');
          if (current.revision !== expectedRevision) {
            throw new GoapConflictError('goap_revision_conflict', {
              expected_revision: expectedRevision,
              actual_revision: current.revision,
            });
          }
          const next = normalizeBlackboard({
            ...current,
            ...patch,
            current_goal_id: patch.current_goal_id ?? current.current_goal_id,
            state: patch.state ?? current.state,
            revision: current.revision + 1,
          });
          this.blackboards.set(key, next);
          return clone(next);
        },
      },
      goalStore: {
        get: async ({ id, ...scope }) => clone(this.goals.get(goalKey(scope, id)) ?? null),
        updateStatus: async ({ id, status, updated_at, ...scope }) => {
          const key = goalKey(scope, id);
          const current = this.goals.get(key);
          if (!current) throw new Error('goal_not_found:' + id);
          const next = {
            ...current,
            status: goalStatusFromTicket(status),
            updated_at: updated_at ?? current.updated_at,
          };
          this.goals.set(key, next);
          return clone(next);
        },
      },
      eventStore: {
        append: async ({ scope, event }) => {
          const key = scopeKey(scope);
          const normalized = normalizeEvent(event);
          this.sequence += 1;
          normalized.cursor = 'memory:' + this.sequence;
          if (!this.events.has(key)) this.events.set(key, []);
          this.events.get(key).push(normalized);
          return clone(normalized);
        },
        list: async ({ cursor = null, limit = 50, goal_id = null, ...scope }) => {
          const rows = this.events.get(scopeKey(scope)) ?? [];
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
    };
  }
}
