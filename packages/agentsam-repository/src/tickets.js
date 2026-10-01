import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function sqlEsc(value) {
  return String(value ?? '').replaceAll("'", "''");
}

function sqlText(value) {
  return value == null || value === '' ? 'NULL' : `'${sqlEsc(value)}'`;
}

function sqlInt(value) {
  return value == null || value === '' || !Number.isFinite(Number(value))
    ? 'NULL'
    : String(Math.trunc(Number(value)));
}

export function createAgentRunId() {
  return `arun_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function createTicketId() {
  return `tkt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Generate SQL for ticket creation.
 *
 * Goal state and execution state are separate nouns. Creating/activating a
 * ticket must not fabricate an agentsam_agent_run. Callers may link an
 * already-created real run explicitly via agentRunId.
 */
export function generateTicketCreateSql({
  accountId,
  ticketId = createTicketId(),
  title,
  description = null,
  status = 'active',
  statusReason = null,
  project = 'inneranimalmedia',
  subsystem = null,
  priority = 'P2',
  docPath = null,
  surface = 'platform',
  accountIdForTicket = accountId,
  repositoryId = null,
  ownerRef = null,
  source = 'agentsam_sdk',
  dedupKey = null,
  now = Math.floor(Date.now() / 1000),
  agentRunId = null,
}) {
  const account = clean(accountId);
  if (!account) throw new Error('account_id_required');
  const tTitle = clean(title);
  if (!tTitle) throw new Error('title_required');

  const statements = [];
  const runId = clean(agentRunId);

  statements.push(`INSERT INTO agentsam_tickets (
  id, title, description, status, status_reason, project, subsystem,
  priority, doc_path, surface, dedup_key, agent_run_id, owner_ref, source,
  account_id, repository_id, created_at, updated_at, closed_at
) VALUES (
  ${sqlText(ticketId)}, ${sqlText(tTitle.slice(0, 240))}, ${sqlText(description)}, ${sqlText(status)},
  ${sqlText(statusReason)}, ${sqlText(project)}, ${sqlText(subsystem)}, ${sqlText(priority)},
  ${sqlText(docPath)}, ${sqlText(surface)}, ${sqlText(dedupKey)}, ${sqlText(runId || null)},
  ${sqlText(ownerRef)}, ${sqlText(source)},
  ${sqlText(accountIdForTicket)}, ${sqlText(repositoryId)},
  ${sqlInt(now)}, ${sqlInt(now)}, ${status === 'shipped' || status === 'abandoned' ? sqlInt(now) : 'NULL'}
);`);

  statements.push(`INSERT INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, actor_type, created_at
) VALUES (
  'tke_' || lower(hex(randomblob(8))), ${sqlText(ticketId)}, 'status_change', NULL, ${sqlText(status)},
  'created', 'agentsam_sdk', ${sqlInt(now)}
);`);

  return {
    sql: statements.join('\n\n'),
    ticketId,
    agentRunId: runId || null,
  };
}

/**
 * Generate SQL to activate a ticket.
 *
 * agentRunId is optional and must reference a run created by the execution
 * subsystem. Activation itself never creates a run.
 */
export function generateTicketActivationSql({
  accountId,
  ticketId,
  agentRunId = null,
  statusReason = null,
  now = Math.floor(Date.now() / 1000),
}) {
  const account = clean(accountId);
  const tid = clean(ticketId);
  if (!account) throw new Error('account_id_required');
  if (!tid) throw new Error('ticket_id_required');
  const runId = clean(agentRunId);

  const statements = [
    `UPDATE agentsam_tickets SET
  status = 'active',
  status_reason = ${sqlText(statusReason)},
  agent_run_id = COALESCE(${sqlText(runId || null)}, agent_run_id),
  updated_at = ${sqlInt(now)},
  closed_at = NULL
WHERE id = ${sqlText(tid)};`,
    `INSERT INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, actor_type, created_at
) VALUES (
  'tke_' || lower(hex(randomblob(8))), ${sqlText(tid)}, 'status_change', 'backlog', 'active',
  'activated', 'agentsam_sdk', ${sqlInt(now)}
);`,
  ];

  return {
    sql: statements.join('\n\n'),
    ticketId: tid,
    agentRunId: runId || null,
  };
}

/**
 * Generate SQL to close a ticket (shipped/blocked/abandoned) and finish its agent run.
 */
export function generateTicketCloseSql({
  ticketId,
  status = 'shipped',
  statusReason = null,
  linkedCommit = null,
  now = Math.floor(Date.now() / 1000),
}) {
  const tid = clean(ticketId);
  if (!tid) throw new Error('ticket_id_required');
  const runStatus = status === 'abandoned' || status === 'blocked' ? 'failed' : 'completed';

  const statements = [
    `UPDATE agentsam_tickets SET
  status = ${sqlText(status)},
  status_reason = ${sqlText(statusReason)},
  linked_commit = COALESCE(${sqlText(linkedCommit)}, linked_commit),
  closed_at = ${status === 'shipped' || status === 'abandoned' ? sqlInt(now) : 'closed_at'},
  updated_at = ${sqlInt(now)}
WHERE id = ${sqlText(tid)};`,
    `UPDATE agentsam_agent_run SET
  status = ${sqlText(runStatus)},
  completed_at_unix = ${sqlInt(now)},
  updated_at_unix = ${sqlInt(now)}
WHERE id = (SELECT agent_run_id FROM agentsam_tickets WHERE id = ${sqlText(tid)})
  AND status = 'running';`,
    `INSERT INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, commit_sha, actor_type, created_at
) VALUES (
  'tke_' || lower(hex(randomblob(8))), ${sqlText(tid)}, 'status_change', 'active', ${sqlText(status)},
  ${sqlText(statusReason || `marked_${status}`)}, ${sqlText(linkedCommit)}, 'agentsam_sdk', ${sqlInt(now)}
);`,
  ];

  return {
    sql: statements.join('\n\n'),
    ticketId: tid,
  };
}
