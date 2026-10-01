import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  AgentSamError,
  ERROR_REASON,
  planRecovery,
} from '@inneranimalmedia/agentsam-errors';
import {
  GOAP_SCHEMAS,
  MemoryGoapAdapter,
  createD1SqliteGoapAdapter,
  createGoapControlPlane,
  goalStatusFromTicket,
  ticketStatusFromGoal,
} from '../src/index.js';

const scope = {
  account_id: 'acct_test',
  repository_id: 'github:example/repo',
  workspace_id: 'ws_test',
};

test('status mapping preserves database statuses while exposing logical GOAP states', () => {
  assert.equal(goalStatusFromTicket('backlog'), 'proposed');
  assert.equal(goalStatusFromTicket('in_review'), 'verifying');
  assert.equal(ticketStatusFromGoal('satisfied'), 'shipped');
});

test('memory adapter atomically activates goal with CAS and append-only cursor', async () => {
  const adapter = new MemoryGoapAdapter({
    blackboards: [{
      ...scope,
      id: 'bb_1',
      current_goal_id: null,
      state: { build: { valid: false } },
      revision: 4,
    }],
    goals: [{
      ...scope,
      id: 'tkt_1',
      title: 'Make build valid',
      status: 'backlog',
      goal_spec_json: { desired: [{ fact: 'build.valid', op: 'eq', value: true }] },
    }],
  });

  const service = createGoapControlPlane({ ports: adapter.ports(), clock: () => 100 });
  const activated = await service.activateGoal({
    scope,
    goalId: 'tkt_1',
    expectedRevision: 4,
    actor: { type: 'test', id: 'runner' },
  });

  assert.equal(activated.blackboard.revision, 5);
  assert.equal(activated.blackboard.current_goal_id, 'tkt_1');
  assert.equal(activated.goal.status, 'active');
  assert.equal(activated.events.length, 1);
  assert.equal(activated.events[0].type, 'goal.activated');
  assert.equal(activated.events[0].payload.blackboard_revision, 5);
  assert.match(activated.events[0].cursor, /^memory:/);

  await assert.rejects(
    service.activateGoal({ scope, goalId: 'tkt_1', expectedRevision: 4 }),
    (error) => {
      assert.equal(error instanceof AgentSamError, true);
      assert.equal(error.reason, ERROR_REASON.STALE_VERSION);
      assert.equal(error.code, 'ABORTED');
      assert.equal(error.envelope.tool, 'goap');
      assert.equal(planRecovery(error.envelope).disposition, 'retry');
      return true;
    },
  );
});

function d1Like(db) {
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...values) {
          return {
            async first() {
              return statement.get(...values) ?? null;
            },
            async all() {
              return { results: statement.all(...values) };
            },
            async run() {
              return statement.run(...values);
            },
          };
        },
      };
    },
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        throw error;
      }
    },
  };
}

function createSqlite({ eventOwnership = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  const eventOwnershipColumns = eventOwnership ? 'account_id TEXT, repository_id TEXT,' : '';
  sqlite.exec([
    'CREATE TABLE agentsam_workspace_state (',
    'id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, repository_id TEXT NOT NULL,',
    'current_task_id TEXT, state_json TEXT NOT NULL DEFAULT \'{}\',',
    'state_schema TEXT NOT NULL DEFAULT \'agentsam.blackboard.v1\',',
    'revision INTEGER NOT NULL DEFAULT 1, locked_by TEXT, lock_expires_at INTEGER,',
    'checkpoint_sha TEXT, last_agent_action TEXT, updated_at INTEGER NOT NULL);',
    'CREATE TABLE agentsam_tickets (',
    'id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, priority TEXT,',
    'account_id TEXT NOT NULL, repository_id TEXT NOT NULL, goal_schema TEXT,',
    'goal_spec_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);',
    'CREATE TABLE agentsam_ticket_events (',
    'id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, event_type TEXT NOT NULL, detail TEXT,',
    'created_at INTEGER NOT NULL, actor_type TEXT, actor_id TEXT, ' + eventOwnershipColumns,
    'payload_json TEXT NOT NULL DEFAULT \'{}\', workflow_run_id TEXT, execution_step_id TEXT,',
    'schema_version TEXT NOT NULL DEFAULT \'agentsam.event.v1\');',
  ].join('\n'));
  sqlite.prepare(
    'INSERT INTO agentsam_workspace_state ' +
    '(id, workspace_id, repository_id, current_task_id, state_json, revision, updated_at) ' +
    'VALUES (?, ?, ?, NULL, \'{}\', 7, 1)',
  ).run('bb_sql', scope.workspace_id, scope.repository_id);
  sqlite.prepare(
    'INSERT INTO agentsam_tickets ' +
    '(id, title, status, account_id, repository_id, goal_schema, goal_spec_json, created_at, updated_at) ' +
    'VALUES (?, ?, \'backlog\', ?, ?, ?, ?, 1, 1)',
  ).run(
    'tkt_sql',
    'Ship portable GOAP',
    scope.account_id,
    scope.repository_id,
    GOAP_SCHEMAS.goal,
    JSON.stringify({ schema: GOAP_SCHEMAS.goal, desired: [] }),
  );
  return sqlite;
}

test('D1/SQLite adapter atomically guards stale revisions with canonical AgentSam errors', async () => {
  const sqlite = createSqlite();
  const ports = createD1SqliteGoapAdapter({ db: d1Like(sqlite) });
  const service = createGoapControlPlane({ ports, clock: () => 1234 });

  await assert.rejects(
    service.activateGoal({ scope, goalId: 'tkt_sql', expectedRevision: 6 }),
    (error) => {
      assert.equal(error instanceof AgentSamError, true);
      assert.equal(error.reason, ERROR_REASON.STALE_VERSION);
      assert.equal(error.envelope.domain, 'tool');
      assert.equal(error.envelope.tool, 'goap');
      return true;
    },
  );

  assert.equal(sqlite.prepare('SELECT revision FROM agentsam_workspace_state').get().revision, 7);
  assert.equal(sqlite.prepare('SELECT status FROM agentsam_tickets').get().status, 'backlog');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM agentsam_ticket_events').get().n, 0);

  const result = await service.activateGoal({
    scope,
    goalId: 'tkt_sql',
    expectedRevision: 7,
    actor: { type: 'test', id: 'sqlite' },
  });

  assert.equal(result.blackboard.revision, 8);
  assert.equal(result.blackboard.current_goal_id, 'tkt_sql');
  assert.equal(result.goal.status, 'active');
  assert.equal(result.events[0].type, 'goal.activated');
  assert.match(result.events[0].cursor, /^sqlite:/);

  const eventRow = sqlite.prepare(
    'SELECT account_id, repository_id, payload_json, schema_version FROM agentsam_ticket_events LIMIT 1',
  ).get();
  assert.equal(eventRow.account_id, scope.account_id);
  assert.equal(eventRow.repository_id, scope.repository_id);
  assert.equal(eventRow.schema_version, GOAP_SCHEMAS.event);
  assert.equal(JSON.parse(eventRow.payload_json).blackboard_revision, 8);

  sqlite.close();
});

test('ticket_join event ownership supports the legacy platform event table', async () => {
  const sqlite = createSqlite({ eventOwnership: false });
  const ports = createD1SqliteGoapAdapter({
    db: d1Like(sqlite),
    eventOwnership: 'ticket_join',
    cursorPrefix: 'd1',
  });
  const service = createGoapControlPlane({ ports, clock: () => 2000 });

  const result = await service.activateGoal({
    scope,
    goalId: 'tkt_sql',
    expectedRevision: 7,
  });

  assert.equal(result.blackboard.revision, 8);
  assert.equal(result.goal.status, 'active');
  assert.equal(result.events.length, 1);
  assert.match(result.events[0].cursor, /^d1:/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM agentsam_ticket_events').get().n, 1);

  sqlite.close();
});
