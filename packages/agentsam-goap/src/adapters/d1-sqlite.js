import {
  GOAP_SCHEMAS,
  normalizeBlackboard,
  normalizeEvent,
  normalizeGoal,
  normalizeGoapScope,
} from '../contracts.js';
import {
  goapAdapterError,
  goapInputError,
  goapInvariantError,
  goapPersistenceError,
  goapStaleVersion,
  goapTargetNotFound,
} from '../errors.js';

function parseJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function resultChanges(result) {
  return Number(
    result?.meta?.changes ??
    result?.changes ??
    result?.rowsAffected ??
    result?.rowCount ??
    0,
  );
}

async function first(db, sql, values = []) {
  try {
    return await db.prepare(sql).bind(...values).first();
  } catch (error) {
    throw goapPersistenceError(error, {
      stage: 'persistence_read',
      operation: {
        kind: 'persistence',
        action: 'read',
        read_only: true,
        idempotent: true,
        side_effect_state: 'none',
      },
    });
  }
}

async function all(db, sql, values = []) {
  try {
    const result = await db.prepare(sql).bind(...values).all();
    return Array.isArray(result) ? result : (result?.results ?? []);
  } catch (error) {
    throw goapPersistenceError(error, {
      stage: 'persistence_read',
      operation: {
        kind: 'persistence',
        action: 'list',
        read_only: true,
        idempotent: true,
        side_effect_state: 'none',
      },
    });
  }
}

async function run(db, sql, values = []) {
  try {
    return await db.prepare(sql).bind(...values).run();
  } catch (error) {
    throw goapPersistenceError(error, {
      stage: 'persistence_write',
      operation: {
        kind: 'persistence',
        action: 'write',
        read_only: false,
        idempotent: false,
        side_effect_state: 'unknown',
      },
    });
  }
}

function bound(db, sql, values = []) {
  try {
    return db.prepare(sql).bind(...values);
  } catch (error) {
    throw goapPersistenceError(error, {
      stage: 'prepare_atomic_mutation',
      operation: {
        kind: 'persistence',
        action: 'prepare',
        read_only: false,
        idempotent: false,
        side_effect_state: 'not_started',
      },
    });
  }
}

export function createD1SqliteGoapAdapter({
  db,
  strictOwnership = true,
  eventOwnership = 'columns',
  blackboardOwnership = 'repository',
  cursorPrefix = 'sqlite',
} = {}) {
  if (!db?.prepare) {
    throw goapAdapterError('A D1/SQLite-compatible db.prepare() binding is required', {
      stage: 'configure_adapter',
      adapter: 'd1-sqlite',
    });
  }
  if (!['columns', 'ticket_join'].includes(eventOwnership)) {
    throw goapInputError('eventOwnership must be columns or ticket_join', {
      stage: 'configure_adapter',
      details: { eventOwnership },
    });
  }
  if (!['repository', 'repository_join'].includes(blackboardOwnership)) {
    throw goapInputError('blackboardOwnership must be repository or repository_join', {
      stage: 'configure_adapter',
      details: { blackboardOwnership },
    });
  }

  const cursorFor = (row) => row?.event_rowid == null ? null : cursorPrefix + ':' + row.event_rowid;
  const eventSelectFrom = eventOwnership === 'columns'
    ? 'FROM agentsam_ticket_events e WHERE e.account_id = ? AND e.repository_id = ?'
    : 'FROM agentsam_ticket_events e JOIN agentsam_tickets t ON t.id = e.ticket_id ' +
      'WHERE t.account_id = ? AND t.repository_id = ?';

  const blackboardStore = {
    async get(scopeInput) {
      const scope = normalizeGoapScope(scopeInput);
      const workspaceFilter = scope.workspace_id ? ' AND w.workspace_id = ?' : '';
      const joined = blackboardOwnership === 'repository_join';
      const values = joined
        ? (scope.workspace_id
          ? [scope.account_id, scope.repository_id, scope.workspace_id]
          : [scope.account_id, scope.repository_id])
        : (scope.workspace_id
          ? [scope.repository_id, scope.workspace_id]
          : [scope.repository_id]);

      const sql =
        'SELECT w.id, w.workspace_id, w.repository_id, w.current_task_id, w.state_json, ' +
        'w.state_schema, w.revision, w.locked_by, w.lock_expires_at, w.checkpoint_sha, ' +
        'w.last_agent_action, w.updated_at ' +
        'FROM agentsam_workspace_state w ' +
        (joined
          ? 'JOIN code_repositories r ON r.id = w.repository_id AND r.account_id = ? '
          : '') +
        'WHERE w.repository_id = ?' + workspaceFilter + ' ' +
        'ORDER BY w.updated_at DESC LIMIT 1';

      const row = await first(db, sql, values);
      if (!row) return null;

      return normalizeBlackboard({
        ...row,
        account_id: scope.account_id,
        state: parseJson(row.state_json, {}),
        schema: row.state_schema || GOAP_SCHEMAS.blackboard,
        current_goal_id: row.current_task_id,
      });
    },

    async compareAndSwap({ scope: scopeInput, expectedRevision, patch = {} }) {
      const scope = normalizeGoapScope(scopeInput);
      const current = await blackboardStore.get(scope);
      if (!current) {
        throw goapTargetNotFound('blackboard', scope.repository_id, {
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

      const nextState = patch.state ?? current.state;
      const nextGoalId = Object.hasOwn(patch, 'current_goal_id')
        ? patch.current_goal_id
        : current.current_goal_id;
      const nextAction = Object.hasOwn(patch, 'last_action')
        ? patch.last_action
        : current.last_action;
      const nextUpdatedAt = patch.updated_at ?? Math.floor(Date.now() / 1000);

      const sharedOwnershipGuard = blackboardOwnership === 'repository_join'
        ? ' AND EXISTS (SELECT 1 FROM code_repositories r ' +
          'WHERE r.id = agentsam_workspace_state.repository_id AND r.account_id = ?)'
        : '';
      const result = await run(
        db,
        'UPDATE agentsam_workspace_state ' +
          'SET current_task_id = ?, state_json = ?, state_schema = ?, ' +
          'revision = revision + 1, last_agent_action = ?, updated_at = ? ' +
          'WHERE id = ? AND revision = ?' + sharedOwnershipGuard,
        [
          nextGoalId,
          JSON.stringify(nextState),
          GOAP_SCHEMAS.blackboard,
          nextAction,
          nextUpdatedAt,
          current.id,
          expectedRevision,
          ...(blackboardOwnership === 'repository_join' ? [scope.account_id] : []),
        ],
      );

      if (resultChanges(result) !== 1) {
        const latest = await blackboardStore.get(scope);
        throw goapStaleVersion({
          expectedRevision,
          actualRevision: latest?.revision ?? null,
          blackboardId: current.id,
        });
      }
      return blackboardStore.get(scope);
    },
  };

  const goalStore = {
    async get({ id, ...scopeInput }) {
      const scope = normalizeGoapScope(scopeInput);
      const ownership = strictOwnership ? ' AND account_id = ? AND repository_id = ?' : '';
      const values = strictOwnership ? [id, scope.account_id, scope.repository_id] : [id];

      const row = await first(
        db,
        'SELECT id, title, status, priority, account_id, repository_id, ' +
          'goal_schema, goal_spec_json, created_at, updated_at ' +
          'FROM agentsam_tickets WHERE id = ?' + ownership + ' LIMIT 1',
        values,
      );
      if (!row) return null;
      return normalizeGoal({
        ...row,
        spec: parseJson(row.goal_spec_json, {}),
      });
    },

    async updateStatus({ id, status, updated_at, ...scopeInput }) {
      const scope = normalizeGoapScope(scopeInput);
      const ownership = strictOwnership ? ' AND account_id = ? AND repository_id = ?' : '';
      const values = strictOwnership
        ? [status, updated_at ?? Math.floor(Date.now() / 1000), id, scope.account_id, scope.repository_id]
        : [status, updated_at ?? Math.floor(Date.now() / 1000), id];

      const result = await run(
        db,
        'UPDATE agentsam_tickets SET status = ?, updated_at = ? WHERE id = ?' + ownership,
        values,
      );
      if (resultChanges(result) !== 1) {
        throw goapTargetNotFound('goal', id, {
          stage: 'update_goal_status',
        });
      }
      return goalStore.get({ id, ...scope });
    },
  };

  const eventStore = {
    async append({ scope: scopeInput, event }) {
      const scope = normalizeGoapScope(scopeInput);
      const normalized = normalizeEvent(event);
      const commonValues = [
        normalized.id,
        normalized.goal_id,
        normalized.type,
        normalized.payload?.detail ?? null,
        normalized.created_at ?? Math.floor(Date.now() / 1000),
        normalized.actor_type,
        normalized.actor_id,
      ];

      if (eventOwnership === 'columns') {
        await run(
          db,
          'INSERT INTO agentsam_ticket_events (' +
            'id, ticket_id, event_type, detail, created_at, actor_type, actor_id, ' +
            'account_id, repository_id, payload_json, workflow_run_id, execution_step_id, schema_version' +
            ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            ...commonValues,
            scope.account_id,
            scope.repository_id,
            JSON.stringify(normalized.payload ?? {}),
            normalized.workflow_run_id,
            normalized.execution_step_id,
            GOAP_SCHEMAS.event,
          ],
        );
      } else {
        await run(
          db,
          'INSERT INTO agentsam_ticket_events (' +
            'id, ticket_id, event_type, detail, created_at, actor_type, actor_id, ' +
            'payload_json, workflow_run_id, execution_step_id, schema_version' +
            ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            ...commonValues,
            JSON.stringify(normalized.payload ?? {}),
            normalized.workflow_run_id,
            normalized.execution_step_id,
            GOAP_SCHEMAS.event,
          ],
        );
      }

      const row = await first(
        db,
        'SELECT rowid AS event_rowid, id, ticket_id, event_type, payload_json, ' +
          'actor_type, actor_id, workflow_run_id, execution_step_id, created_at ' +
          'FROM agentsam_ticket_events WHERE id = ? LIMIT 1',
        [normalized.id],
      );

      return normalizeEvent({
        ...row,
        payload: parseJson(row?.payload_json, {}),
        cursor: cursorFor(row),
      });
    },

    async list({ cursor = null, limit = 50, goal_id = null, ...scopeInput }) {
      const scope = normalizeGoapScope(scopeInput);
      const after = cursor ? Number(String(cursor).split(':').at(-1)) || 0 : 0;
      const goalClause = goal_id ? ' AND e.ticket_id = ?' : '';
      const values = goal_id
        ? [scope.account_id, scope.repository_id, after, goal_id, Math.max(1, Number(limit) || 50)]
        : [scope.account_id, scope.repository_id, after, Math.max(1, Number(limit) || 50)];

      const rows = await all(
        db,
        'SELECT e.rowid AS event_rowid, e.id, e.ticket_id, e.event_type, e.payload_json, ' +
          'e.actor_type, e.actor_id, e.workflow_run_id, e.execution_step_id, e.created_at ' +
          eventSelectFrom + ' AND e.rowid > ?' + goalClause + ' ORDER BY e.rowid ASC LIMIT ?',
        values,
      );

      return rows.map((row) => normalizeEvent({
        ...row,
        payload: parseJson(row.payload_json, {}),
        cursor: cursorFor(row),
      }));
    },
  };

  const mutationPort = {
    async activateGoal({ scope: scopeInput, goal_id, expected_revision, event, updated_at }) {
      if (typeof db.batch !== 'function') {
        throw goapAdapterError('db.batch() is required for atomic GOAP mutations', {
          stage: 'activate_goal',
          adapter: 'd1-sqlite',
        });
      }

      const scope = normalizeGoapScope(scopeInput);
      const blackboard = await blackboardStore.get(scope);
      const goal = await goalStore.get({ ...scope, id: goal_id });
      if (!blackboard) {
        throw goapTargetNotFound('blackboard', scope.repository_id, {
          stage: 'activate_goal',
        });
      }
      if (!goal) {
        throw goapTargetNotFound('goal', goal_id, {
          stage: 'activate_goal',
        });
      }
      if (blackboard.revision !== expected_revision) {
        throw goapStaleVersion({
          expectedRevision: expected_revision,
          actualRevision: blackboard.revision,
          blackboardId: blackboard.id,
          stage: 'activate_goal',
          action: 'activate_goal',
        });
      }

      const normalizedEvent = normalizeEvent(event);
      const nextRevision = expected_revision + 1;
      const now = updated_at ?? Math.floor(Date.now() / 1000);

      const sharedBlackboardGuard = blackboardOwnership === 'repository_join'
        ? ' AND EXISTS (SELECT 1 FROM code_repositories r ' +
          'WHERE r.id = agentsam_workspace_state.repository_id AND r.account_id = ?)'
        : '';
      const updateBlackboard = bound(
        db,
        'UPDATE agentsam_workspace_state ' +
          'SET current_task_id = ?, state_schema = ?, revision = revision + 1, ' +
          'last_agent_action = ?, updated_at = ? ' +
          'WHERE id = ? AND revision = ?' + sharedBlackboardGuard + ' ' +
          'AND EXISTS (SELECT 1 FROM agentsam_tickets ' +
          'WHERE id = ? AND account_id = ? AND repository_id = ?)',
        [
          goal_id,
          GOAP_SCHEMAS.blackboard,
          'activated_goal',
          now,
          blackboard.id,
          expected_revision,
          ...(blackboardOwnership === 'repository_join' ? [scope.account_id] : []),
          goal_id,
          scope.account_id,
          scope.repository_id,
        ],
      );

      const updateGoal = bound(
        db,
        'UPDATE agentsam_tickets SET status = ?, updated_at = ? ' +
          'WHERE id = ? AND account_id = ? AND repository_id = ? ' +
          'AND EXISTS (SELECT 1 FROM agentsam_workspace_state ' +
          'WHERE id = ? AND revision = ? AND current_task_id = ?)',
        [
          'active',
          now,
          goal_id,
          scope.account_id,
          scope.repository_id,
          blackboard.id,
          nextRevision,
          goal_id,
        ],
      );

      const eventGuard =
        ' WHERE EXISTS (SELECT 1 FROM agentsam_workspace_state ' +
        'WHERE id = ? AND revision = ? AND current_task_id = ?) ' +
        'AND EXISTS (SELECT 1 FROM agentsam_tickets ' +
        'WHERE id = ? AND account_id = ? AND repository_id = ? AND status = ?)';

      let insertEvent;
      if (eventOwnership === 'columns') {
        insertEvent = bound(
          db,
          'INSERT INTO agentsam_ticket_events (' +
            'id, ticket_id, event_type, detail, created_at, actor_type, actor_id, ' +
            'account_id, repository_id, payload_json, workflow_run_id, execution_step_id, schema_version' +
            ') SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?' + eventGuard,
          [
            normalizedEvent.id,
            goal_id,
            normalizedEvent.type,
            normalizedEvent.payload?.detail ?? null,
            normalizedEvent.created_at ?? now,
            normalizedEvent.actor_type,
            normalizedEvent.actor_id,
            scope.account_id,
            scope.repository_id,
            JSON.stringify(normalizedEvent.payload ?? {}),
            normalizedEvent.workflow_run_id,
            normalizedEvent.execution_step_id,
            GOAP_SCHEMAS.event,
            blackboard.id,
            nextRevision,
            goal_id,
            goal_id,
            scope.account_id,
            scope.repository_id,
            'active',
          ],
        );
      } else {
        insertEvent = bound(
          db,
          'INSERT INTO agentsam_ticket_events (' +
            'id, ticket_id, event_type, detail, created_at, actor_type, actor_id, ' +
            'payload_json, workflow_run_id, execution_step_id, schema_version' +
            ') SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?' + eventGuard,
          [
            normalizedEvent.id,
            goal_id,
            normalizedEvent.type,
            normalizedEvent.payload?.detail ?? null,
            normalizedEvent.created_at ?? now,
            normalizedEvent.actor_type,
            normalizedEvent.actor_id,
            JSON.stringify(normalizedEvent.payload ?? {}),
            normalizedEvent.workflow_run_id,
            normalizedEvent.execution_step_id,
            GOAP_SCHEMAS.event,
            blackboard.id,
            nextRevision,
            goal_id,
            goal_id,
            scope.account_id,
            scope.repository_id,
            'active',
          ],
        );
      }

      let results;
      try {
        results = await db.batch([updateBlackboard, updateGoal, insertEvent]);
      } catch (error) {
        throw goapPersistenceError(error, {
          stage: 'activate_goal',
          resource: { type: 'goal', id: goal_id },
          operation: {
            kind: 'persistence',
            action: 'activate_goal',
            resource_type: 'goal',
            resource_id: goal_id,
            read_only: false,
            idempotent: false,
            side_effect_state: 'unknown',
          },
        });
      }

      if (resultChanges(results?.[0]) !== 1) {
        const latest = await blackboardStore.get(scope);
        throw goapStaleVersion({
          expectedRevision: expected_revision,
          actualRevision: latest?.revision ?? null,
          blackboardId: blackboard.id,
          stage: 'activate_goal',
          action: 'activate_goal',
        });
      }
      if (resultChanges(results?.[1]) !== 1 || resultChanges(results?.[2]) !== 1) {
        throw goapInvariantError('Atomic GOAP activation did not update every required record.', {
          stage: 'activate_goal',
          resource: { type: 'goal', id: goal_id },
          details: {
            blackboard_changes: resultChanges(results?.[0]),
            goal_changes: resultChanges(results?.[1]),
            event_changes: resultChanges(results?.[2]),
          },
          sideEffectState: 'partially_applied',
        });
      }

      return {
        blackboard: await blackboardStore.get(scope),
        goal: await goalStore.get({ ...scope, id: goal_id }),
        event: (await eventStore.list({
          ...scope,
          goal_id,
          cursor: cursorPrefix + ':0',
          limit: 100,
        })).at(-1) ?? null,
      };
    },
  };

  return {
    blackboardStore,
    goalStore,
    eventStore,
    mutationPort,
  };
}
