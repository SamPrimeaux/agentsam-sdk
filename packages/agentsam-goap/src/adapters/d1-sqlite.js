import {
  GoapConflictError,
  GOAP_SCHEMAS,
  normalizeBlackboard,
  normalizeEvent,
  normalizeGoal,
  normalizeGoapScope,
} from '../contracts.js';

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
  return db.prepare(sql).bind(...values).first();
}

async function all(db, sql, values = []) {
  const result = await db.prepare(sql).bind(...values).all();
  return Array.isArray(result) ? result : (result?.results ?? []);
}

async function run(db, sql, values = []) {
  return db.prepare(sql).bind(...values).run();
}

function bound(db, sql, values = []) {
  return db.prepare(sql).bind(...values);
}

export function createD1SqliteGoapAdapter({
  db,
  strictOwnership = true,
  eventOwnership = 'columns',
  cursorPrefix = 'sqlite',
} = {}) {
  if (!db?.prepare) throw new TypeError('A D1/SQLite-compatible db.prepare() binding is required');
  if (!['columns', 'ticket_join'].includes(eventOwnership)) {
    throw new TypeError('eventOwnership must be columns or ticket_join');
  }

  const cursorFor = (row) => row?.event_rowid == null ? null : cursorPrefix + ':' + row.event_rowid;
  const eventSelectFrom = eventOwnership === 'columns'
    ? 'FROM agentsam_ticket_events e WHERE e.account_id = ? AND e.repository_id = ?'
    : 'FROM agentsam_ticket_events e JOIN agentsam_tickets t ON t.id = e.ticket_id ' +
      'WHERE t.account_id = ? AND t.repository_id = ?';

  const blackboardStore = {
    async get(scopeInput) {
      const scope = normalizeGoapScope(scopeInput);
      const workspaceFilter = scope.workspace_id ? ' AND workspace_id = ?' : '';
      const values = scope.workspace_id
        ? [scope.repository_id, scope.workspace_id]
        : [scope.repository_id];

      const sql =
        'SELECT id, workspace_id, repository_id, current_task_id, state_json, ' +
        'state_schema, revision, locked_by, lock_expires_at, checkpoint_sha, ' +
        'last_agent_action, updated_at ' +
        'FROM agentsam_workspace_state ' +
        'WHERE repository_id = ?' + workspaceFilter + ' ' +
        'ORDER BY updated_at DESC LIMIT 1';

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
      if (!current) throw new Error('blackboard_not_found');
      if (current.revision !== expectedRevision) {
        throw new GoapConflictError('goap_revision_conflict', {
          expected_revision: expectedRevision,
          actual_revision: current.revision,
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

      const result = await run(
        db,
        'UPDATE agentsam_workspace_state ' +
          'SET current_task_id = ?, state_json = ?, state_schema = ?, ' +
          'revision = revision + 1, last_agent_action = ?, updated_at = ? ' +
          'WHERE id = ? AND revision = ?',
        [
          nextGoalId,
          JSON.stringify(nextState),
          GOAP_SCHEMAS.blackboard,
          nextAction,
          nextUpdatedAt,
          current.id,
          expectedRevision,
        ],
      );

      if (resultChanges(result) !== 1) {
        const latest = await blackboardStore.get(scope);
        throw new GoapConflictError('goap_revision_conflict', {
          expected_revision: expectedRevision,
          actual_revision: latest?.revision ?? null,
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
      if (resultChanges(result) !== 1) throw new Error('goal_not_found:' + id);
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
        throw new TypeError('db.batch() is required for atomic GOAP mutations');
      }

      const scope = normalizeGoapScope(scopeInput);
      const blackboard = await blackboardStore.get(scope);
      const goal = await goalStore.get({ ...scope, id: goal_id });
      if (!blackboard) throw new Error('blackboard_not_found');
      if (!goal) throw new Error('goal_not_found:' + goal_id);
      if (blackboard.revision !== expected_revision) {
        throw new GoapConflictError('goap_revision_conflict', {
          expected_revision,
          actual_revision: blackboard.revision,
        });
      }

      const normalizedEvent = normalizeEvent(event);
      const nextRevision = expected_revision + 1;
      const now = updated_at ?? Math.floor(Date.now() / 1000);

      const updateBlackboard = bound(
        db,
        'UPDATE agentsam_workspace_state ' +
          'SET current_task_id = ?, state_schema = ?, revision = revision + 1, ' +
          'last_agent_action = ?, updated_at = ? ' +
          'WHERE id = ? AND revision = ? ' +
          'AND EXISTS (SELECT 1 FROM agentsam_tickets ' +
          'WHERE id = ? AND account_id = ? AND repository_id = ?)',
        [
          goal_id,
          GOAP_SCHEMAS.blackboard,
          'activated_goal',
          now,
          blackboard.id,
          expected_revision,
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

      const results = await db.batch([updateBlackboard, updateGoal, insertEvent]);
      if (resultChanges(results?.[0]) !== 1) {
        const latest = await blackboardStore.get(scope);
        throw new GoapConflictError('goap_revision_conflict', {
          expected_revision,
          actual_revision: latest?.revision ?? null,
        });
      }
      if (resultChanges(results?.[1]) !== 1 || resultChanges(results?.[2]) !== 1) {
        throw new Error('goap_atomic_activation_incomplete');
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
