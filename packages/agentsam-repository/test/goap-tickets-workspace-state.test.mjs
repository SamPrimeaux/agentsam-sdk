import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentRunId,
  createTicketId,
  generateTicketCreateSql,
  generateTicketActivationSql,
  generateTicketCloseSql,
} from '../src/tickets.js';
import { generateWorkspaceStateUpsertSql } from '../src/workspace-state.js';
import {
  renderGoapStatus,
  renderGoapGoal,
  renderGoapWhy,
  renderGoapPlan,
} from '../src/goap.js';

test('createAgentRunId / createTicketId produce prefixed, collision-resistant ids', () => {
  const run1 = createAgentRunId();
  const run2 = createAgentRunId();
  const tkt1 = createTicketId();
  assert.match(run1, /^arun_[0-9a-f]{16}$/);
  assert.match(tkt1, /^tkt_[0-9a-f]{16}$/);
  assert.notEqual(run1, run2);
});

test('generateTicketCreateSql requires account_id and title', () => {
  assert.throws(() => generateTicketCreateSql({ title: 'x' }), /account_id_required/);
  assert.throws(() => generateTicketCreateSql({ accountId: 'acc_1' }), /title_required/);
});

test('generateTicketCreateSql with status=active mints an agent_run and links it on the ticket insert', () => {
  const { sql, ticketId, agentRunId } = generateTicketCreateSql({
    accountId: 'acc_1',
    title: 'Wire GOAP planner',
    status: 'active',
    now: 1000,
  });
  assert.ok(ticketId.startsWith('tkt_'));
  assert.ok(agentRunId && agentRunId.startsWith('arun_'));
  assert.match(sql, /INSERT INTO agentsam_agent_run/);
  assert.match(sql, /INSERT INTO agentsam_tickets/);
  assert.match(sql, /INSERT INTO agentsam_ticket_events/);
  const runOccurrences = sql.split(agentRunId).length - 1;
  assert.ok(runOccurrences >= 2, 'agent_run id should appear in both the run insert and the ticket insert');
});

test('generateTicketCreateSql with status=backlog does not mint an agent_run', () => {
  const { sql, agentRunId } = generateTicketCreateSql({
    accountId: 'acc_1',
    title: 'Later work',
    status: 'backlog',
  });
  assert.equal(agentRunId, null);
  assert.doesNotMatch(sql, /INSERT INTO agentsam_agent_run/);
});

test('generateTicketCreateSql escapes single quotes and truncates the title before escaping (past 240 chars)', () => {
  const longTitle = 'x'.repeat(300) + "'drop";
  const { sql } = generateTicketCreateSql({
    accountId: 'acc_1',
    title: longTitle,
    status: 'backlog',
  });
  // title is sliced to 240 chars BEFORE sql-escaping, so the trailing quote at position 300 never reaches the output
  assert.doesNotMatch(sql, /drop/);
  assert.doesNotMatch(sql, new RegExp('x'.repeat(241)));
  assert.match(sql, new RegExp('x'.repeat(240)));
});

test('generateTicketCreateSql escapes a single quote embedded inside the title itself', () => {
  const { sql } = generateTicketCreateSql({
    accountId: 'acc_1',
    title: "Sam's ticket",
    status: 'backlog',
  });
  assert.match(sql, /Sam''s ticket/);
});

test('generateTicketActivationSql requires account and ticket id', () => {
  assert.throws(() => generateTicketActivationSql({ ticketId: 't' }), /account_id_required/);
  assert.throws(() => generateTicketActivationSql({ accountId: 'a' }), /ticket_id_required/);
});

test('generateTicketActivationSql wires a fresh agent_run and clears closed_at', () => {
  const { sql, agentRunId } = generateTicketActivationSql({
    accountId: 'acc_1',
    ticketId: 'tkt_abc',
    now: 1000,
  });
  assert.ok(agentRunId.startsWith('arun_'));
  assert.match(sql, /status = 'active'/);
  assert.match(sql, /closed_at = NULL/);
  assert.match(sql, /COALESCE\(agent_run_id,/);
});

test('generateTicketCloseSql maps shipped -> completed and abandoned/blocked -> failed run status', () => {
  const shipped = generateTicketCloseSql({ ticketId: 'tkt_1', status: 'shipped', now: 1000 });
  assert.match(shipped.sql, /status = 'completed'/);
  assert.match(shipped.sql, /closed_at = 1000/);

  const abandoned = generateTicketCloseSql({ ticketId: 'tkt_1', status: 'abandoned', now: 1000 });
  assert.match(abandoned.sql, /status = 'failed'/);

  const blocked = generateTicketCloseSql({ ticketId: 'tkt_1', status: 'blocked', now: 1000 });
  assert.match(blocked.sql, /status = 'failed'/);
  assert.match(blocked.sql, /closed_at = closed_at/);
});

test('generateTicketCloseSql requires a ticket id', () => {
  assert.throws(() => generateTicketCloseSql({}), /ticket_id_required/);
});

test('generateWorkspaceStateUpsertSql requires repository_id and derives a default workspace id (non-alnum chars become underscores)', () => {
  assert.throws(() => generateWorkspaceStateUpsertSql({}), /repository_id_required/);
  const sql = generateWorkspaceStateUpsertSql({ repositoryId: 'SamPrimeaux/agentsam-sdk' });
  assert.match(sql, /INSERT INTO agentsam_workspace_state/);
  assert.match(sql, /ON CONFLICT\(repository_id\) DO UPDATE SET/);
  assert.match(sql, /ws_SamPrimeaux_agentsam_sdk/);
});

test('generateWorkspaceStateUpsertSql upsert preserves existing values via COALESCE when a field is omitted', () => {
  const sql = generateWorkspaceStateUpsertSql({ repositoryId: 'repo_1', currentTaskId: 'tkt_9' });
  assert.match(sql, /current_task_id = COALESCE\(excluded\.current_task_id, agentsam_workspace_state\.current_task_id\)/);
  assert.match(sql, /'tkt_9'/);
});

test('renderGoapStatus reflects ticket/workspace/run state and falls back gracefully on empty state', () => {
  const out = renderGoapStatus({
    repositoryId: 'SamPrimeaux/agentsam-sdk',
    workspaceState: { locked_by: 'agentsam_cli', current_task_id: 'tkt_1' },
    activeTicket: { id: 'tkt_1', title: 'Ship GOAP', status: 'active', priority: 'P1' },
    agentRun: { id: 'arun_1', status: 'running' },
    git: { branch: 'main', headSha: 'abcdef1234567890', dirty: false },
  });
  assert.match(out, /GOAP BLACKBOARD STATUS/);
  assert.match(out, /Ship GOAP/);
  assert.match(out, /CLEAN/);

  const empty = renderGoapStatus();
  assert.match(empty, /no active ticket/);
  assert.match(empty, /unlocked/);
});

test('renderGoapGoal / renderGoapWhy / renderGoapPlan render without throwing on minimal state', () => {
  for (const fn of [renderGoapGoal, renderGoapWhy, renderGoapPlan]) {
    const out = fn({ repositoryId: 'repo', activeTicket: {}, workspaceState: {}, agentRun: {}, git: {} });
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  }
});
