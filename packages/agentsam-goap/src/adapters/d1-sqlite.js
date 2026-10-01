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

function eventCursor(row) {
  return row?.event_rowid == null ? null : 'sqlite:' + row.event_rowid;
}

export function createD1SqliteGoapAdapter({
  db,
  strictOwnership = true,
} = {}) {
  if (!db?.prepare) throw new TypeError('A D1/SQLite-compatible db.prepare() binding is required');

  return {
    blackboardStore: {
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
        const current = await this.get(scope);
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
          const latest = await this.get(scope);
          throw new GoapConflictError('goap_revision_conflict', {
            expected_revision: expectedRevision,
            actual_revision: latest?.revision ?? null,
          });
        }
        return this.get(scope);
      },
    },

    goalStore: {
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
        return this.get({ id, ...scope });
      },
    },

    eventStore: {
      async append({ scope: scopeInput, event }) {
        const scope = normalizeGoapScope(scopeInput);
        const normalized = normalizeEvent(event);

        await run(
          db,
          'INSERT INTO agentsam_ticket_events (' +
            'id, ticket_id, event_type, detail, created_at, actor_type, actor_id, ' +
            'account_id, repository_id, payload_json, workflow_run_id, execution_step_id, schema_version' +
            ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            normalized.id,
            normalized.goal_id,
            normalized.type,
            normalized.payload?.detail ?? null,
            normalized.created_at ?? Math.floor(Date.now() / 1000),
            normalized.actor_type,
            normalized.actor_id,
            scope.account_id,
            scope.repository_id,
            JSON.stringify(normalized.payload ?? {}),
            normalized.workflow_run_id,
            normalized.execution_step_id,
            GOAP_SCHEMAS.event,
          ],
        );

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
          cursor: eventCursor(row),
        });
      },

      async list({ cursor = null, limit = 50, goal_id = null, ...scopeInput }) {
        const scope = normalizeGoapScope(scopeInput);
        const after = cursor ? Number(String(cursor).split(':').at(-1)) || 0 : 0;
        const goalClause = goal_id ? ' AND ticket_id = ?' : '';
        const values = goal_id
          ? [scope.account_id, scope.repository_id, after, goal_id, Math.max(1, Number(limit) || 50)]
          : [scope.account_id, scope.repository_id, after, Math.max(1, Number(limit) || 50)];

        const rows = await all(
          db,
          'SELECT rowid AS event_rowid, id, ticket_id, event_type, payload_json, ' +
            'actor_type, actor_id, workflow_run_id, execution_step_id, created_at ' +
            'FROM agentsam_ticket_events ' +
            'WHERE account_id = ? AND repository_id = ? AND rowid > ?' + goalClause + ' ' +
            'ORDER BY rowid ASC LIMIT ?',
          values,
        );

        return rows.map((row) => normalizeEvent({
          ...row,
          payload: parseJson(row.payload_json, {}),
          cursor: eventCursor(row),
        }));
      },
    },
  };
}
