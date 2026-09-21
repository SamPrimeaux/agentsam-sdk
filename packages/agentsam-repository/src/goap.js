import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tryResolveGitContext } from './git-context.js';
import {
  createTicketId,
  createAgentRunId,
  generateTicketCreateSql,
  generateTicketCloseSql,
} from './tickets.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function sqlEsc(value) {
  return String(value ?? '').replaceAll("'", "''");
}

function formatDate(epoch) {
  if (!epoch) return 'none';
  const num = Number(epoch);
  return Number.isFinite(num) ? new Date(num * 1000).toISOString().replace('T', ' ').slice(0, 19) : String(epoch);
}

function executeD1JsonQuery({
  cwd = process.cwd(),
  sql,
  query = null,
  wranglerConfig = 'apps/local-studio/backend/wrangler.jsonc',
  databaseName = 'inneranimalmedia-business',
}) {
  if (typeof query === 'function') return query(sql);
  const configPath = path.resolve(cwd, wranglerConfig);
  const args = ['d1', 'execute', databaseName, '--remote', '--json'];
  if (fs.existsSync(configPath)) args.push('--config', configPath);
  args.push('--command', sql);

  const out = execFileSync('npx', ['wrangler', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const startIdx = out.indexOf('[');
  const endIdx = out.lastIndexOf(']');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Invalid JSON output from D1: ${out.slice(0, 200)}`);
  }
  return JSON.parse(out.slice(startIdx, endIdx + 1));
}

function executeD1WriteSql({
  cwd = process.cwd(),
  sql,
  write = null,
  wranglerConfig = 'apps/local-studio/backend/wrangler.jsonc',
  databaseName = 'inneranimalmedia-business',
}) {
  if (typeof write === 'function') return write(sql);
  const configPath = path.resolve(cwd, wranglerConfig);
  const tmpFile = path.join(os.tmpdir(), `agentsam-d1-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.sql`);
  fs.writeFileSync(tmpFile, `${sql}\n`, 'utf8');

  try {
    const args = ['d1', 'execute', databaseName, '--remote', '--yes'];
    if (fs.existsSync(configPath)) args.push('--config', configPath);
    args.push(`--file=${tmpFile}`);

    return execFileSync('npx', ['wrangler', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Read the complete GOAP state straight off tables:
 * - agentsam_workspace_state (beliefs, lock, checkpoint)
 * - agentsam_tickets (active goal/task, linked commit, agent run pointer)
 * - agentsam_agent_run (live run status, calls, tokens)
 * - agentsam_work_git_commits (recent commit history)
 * - agentsam_work_tracking_checkpoint (ingest cursor)
 */
export async function readGoapState({
  cwd = process.cwd(),
  repositoryId = null,
  accountId = null,
  wranglerConfig = 'apps/local-studio/backend/wrangler.jsonc',
  databaseName = 'inneranimalmedia-business',
  query = null,
} = {}) {
  const git = tryResolveGitContext({ cwd });
  const repoId = repositoryId || (git?.repoFullName ? `github:${git.repoFullName.toLowerCase()}` : null);
  if (!repoId) return { ok: false, error: 'repository_identity_unresolved', git };
  const accId = clean(accountId);
  if (!accId) return { ok: false, repositoryId: repoId, error: 'account_id_required', git };

  try {
    const sql = `
SELECT * FROM agentsam_workspace_state WHERE repository_id = '${sqlEsc(repoId)}' LIMIT 1;
SELECT * FROM agentsam_tickets WHERE id = (SELECT current_task_id FROM agentsam_workspace_state WHERE repository_id = '${sqlEsc(repoId)}') AND account_id = '${sqlEsc(accId)}' AND repository_id = '${sqlEsc(repoId)}' LIMIT 1;
SELECT * FROM agentsam_agent_run WHERE id = (SELECT agent_run_id FROM agentsam_tickets WHERE id = (SELECT current_task_id FROM agentsam_workspace_state WHERE repository_id = '${sqlEsc(repoId)}') AND account_id = '${sqlEsc(accId)}' AND repository_id = '${sqlEsc(repoId)}' LIMIT 1) LIMIT 1;
SELECT sha, message, committed_at FROM agentsam_work_git_commits WHERE repository_id = '${sqlEsc(repoId)}' ORDER BY committed_at DESC LIMIT 3;
SELECT * FROM agentsam_work_tracking_checkpoint WHERE repository_id = '${sqlEsc(repoId)}' AND tracker_key = 'git_commit_ingest' LIMIT 1;
SELECT id, title, status, sort_order FROM agentsam_todo
WHERE plan_id IN (SELECT id FROM agentsam_plans WHERE agent_run_id = (SELECT agent_run_id FROM agentsam_tickets WHERE id = (SELECT current_task_id FROM agentsam_workspace_state WHERE repository_id = '${sqlEsc(repoId)}') LIMIT 1))
ORDER BY sort_order, created_at_unix;
`;
  const data = await executeD1JsonQuery({ cwd, sql, query, wranglerConfig, databaseName });
    const workspaceState = data?.[0]?.results?.[0] || null;
    const activeTicket = data?.[1]?.results?.[0] || null;
    const agentRun = data?.[2]?.results?.[0] || null;
    const recentCommits = data?.[3]?.results || [];
    const checkpoint = data?.[4]?.results?.[0] || null;
    const steps = (data?.[5]?.results || []).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      sort_order: row.sort_order,
    }));

    let cursor = {};
    if (checkpoint?.cursor_json) {
      try { cursor = JSON.parse(checkpoint.cursor_json); } catch {}
    }

    return {
      ok: true,
      repositoryId: repoId,
      git,
      workspaceState,
      activeTicket,
      agentRun,
      recentCommits,
      checkpoint,
      cursor,
      steps,
    };
  } catch (err) {
    return {
      ok: false,
      repositoryId: repoId,
      git,
      error: err?.stderr || err?.message || String(err),
    };
  }
}

/**
 * List all GOAP tickets/goals for the current repository and workspace.
 */
export async function listGoapTickets({
  cwd = process.cwd(),
  repositoryId = null,
  accountId = null,
  limit = 20,
  wranglerConfig = 'apps/local-studio/backend/wrangler.jsonc',
  databaseName = 'inneranimalmedia-business',
  query = null,
} = {}) {
  const git = tryResolveGitContext({ cwd });
  const repoId = repositoryId || (git?.repoFullName ? `github:${git.repoFullName.toLowerCase()}` : null);
  if (!repoId) return { ok: false, error: 'repository_identity_unresolved', git, tickets: [] };

  try {
    const accId = clean(accountId);
    if (!accId) return { ok: false, repositoryId: repoId, error: 'account_id_required', tickets: [] };
    const sql = `
SELECT current_task_id FROM agentsam_workspace_state WHERE repository_id = '${sqlEsc(repoId)}' LIMIT 1;
SELECT id, title, status, priority, subsystem, surface, agent_run_id, linked_commit,
       account_id, repository_id, owner_ref, created_at, updated_at
FROM agentsam_tickets
WHERE account_id = '${sqlEsc(accId)}' AND repository_id = '${sqlEsc(repoId)}'
ORDER BY
  (id = (SELECT current_task_id FROM agentsam_workspace_state WHERE repository_id = '${sqlEsc(repoId)}' LIMIT 1)) DESC,
  CASE status
    WHEN 'active' THEN 1
    WHEN 'backlog' THEN 2
    WHEN 'blocked' THEN 3
    ELSE 4
  END,
  updated_at DESC
LIMIT ${Math.max(1, Math.min(Number(limit) || 20, 100))};
`;
    const data = await executeD1JsonQuery({ cwd, sql, query, wranglerConfig, databaseName });
    const currentTaskId = data?.[0]?.results?.[0]?.current_task_id || null;
    const tickets = data?.[1]?.results || [];

    return {
      ok: true,
      repositoryId: repoId,
      currentTaskId,
      tickets,
    };
  } catch (err) {
    return {
      ok: false,
      repositoryId: repoId,
      error: err?.stderr || err?.message || String(err),
      tickets: [],
    };
  }
}

/**
 * Create and activate a new GOAP goal/ticket.
 */
export async function createGoapGoal({
  cwd = process.cwd(),
  title,
  accountId = null,
  priority = 'P2',
  subsystem = 'agent-runtime',
  description = null,
  surface = 'platform',
  status = 'active',
  setActive = true,
  wranglerConfig = 'apps/local-studio/backend/wrangler.jsonc',
  databaseName = 'inneranimalmedia-business',
  write = null,
} = {}) {
  const cleanTitle = clean(title);
  if (!cleanTitle) throw new Error('title_required');

  const git = tryResolveGitContext({ cwd });
  const repoId = git?.repoFullName ? `github:${git.repoFullName.toLowerCase()}` : 'github:local/workspace';

  let accId = clean(accountId);
  if (!accId) throw new Error('account_id_required');

  const ticketId = createTicketId();
  const agentRunId = createAgentRunId();
  const now = Math.floor(Date.now() / 1000);

  const { sql: ticketSql } = generateTicketCreateSql({
    accountId: accId,
    ticketId,
    title: cleanTitle,
    description,
    status,
    priority,
    subsystem,
    surface,
    accountIdForTicket: accId,
    repositoryId: repoId,
    ownerRef: repoId,
    source: 'agentsam_sdk',
    agentRunId,
    now,
  });

  const statements = [ticketSql];

  if (setActive) {
    const wsId = `ws_${repoId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    statements.push(`
INSERT INTO agentsam_workspace_state (
  id, repository_id, workspace_id, current_task_id, locked_by, checkpoint_sha,
  last_agent_action, state_json, created_at, updated_at
) VALUES (
  'wss_' || lower(hex(randomblob(8))),
  '${sqlEsc(repoId)}',
  '${sqlEsc(wsId)}',
  '${sqlEsc(ticketId)}',
  'agentsam_cli',
  ${git?.headSha ? `'${sqlEsc(git.headSha.slice(0, 10))}'` : 'NULL'},
  'created_and_activated_goal',
  '{}',
  ${now},
  ${now}
)
ON CONFLICT(repository_id) DO UPDATE SET
  current_task_id = '${sqlEsc(ticketId)}',
  last_agent_action = 'activated_goal',
  updated_at = ${now};
`);
  }

  const fullSql = statements.join('\n\n');
  await executeD1WriteSql({ cwd, sql: fullSql, write, wranglerConfig, databaseName });

  return {
    ok: true,
    ticketId,
    agentRunId,
    title: cleanTitle,
    status,
    priority,
    subsystem,
    active: setActive,
  };
}

/**
 * Switch active GOAP focus to an existing ticket.
 */
export async function switchGoapGoal({
  cwd = process.cwd(),
  ticketId,
  accountId = null,
  wranglerConfig = 'apps/local-studio/backend/wrangler.jsonc',
  databaseName = 'inneranimalmedia-business',
  query = null,
  write = null,
} = {}) {
  const tid = clean(ticketId);
  if (!tid) throw new Error('ticket_id_required');

  const git = tryResolveGitContext({ cwd });
  const repoId = git?.repoFullName ? `github:${git.repoFullName.toLowerCase()}` : 'github:local/workspace';
  const now = Math.floor(Date.now() / 1000);
  const wsId = `ws_${repoId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const lookup = await executeD1JsonQuery({
    cwd,
    query,
    wranglerConfig,
    databaseName,
    sql: `SELECT id, account_id, repository_id FROM agentsam_tickets WHERE id = '${sqlEsc(tid)}' LIMIT 1;`,
  });
  const ticket = lookup?.[0]?.results?.[0];
  const accId = clean(accountId);
  if (!ticket) throw new Error('ticket_not_found');
  if (ticket.repository_id && ticket.repository_id !== repoId) throw new Error('ticket_repository_mismatch');
  if (!accId || ticket.account_id !== accId) throw new Error('ticket_account_mismatch');
  const runId = createAgentRunId();

  const sql = `
INSERT INTO agentsam_agent_run (
  id, account_id, mode, status, started_at_unix, created_at_unix, updated_at_unix
) VALUES ('${sqlEsc(runId)}', '${sqlEsc(accId)}', 'agent', 'running', ${now}, ${now}, ${now});

UPDATE agentsam_tickets SET
  status = 'active',
  agent_run_id = '${sqlEsc(runId)}',
  updated_at = ${now}
WHERE id = '${sqlEsc(tid)}';

INSERT INTO agentsam_workspace_state (
  id, repository_id, workspace_id, current_task_id, locked_by, checkpoint_sha,
  last_agent_action, state_json, created_at, updated_at
) VALUES (
  'wss_' || lower(hex(randomblob(8))),
  '${sqlEsc(repoId)}',
  '${sqlEsc(wsId)}',
  '${sqlEsc(tid)}',
  'agentsam_cli',
  ${git?.headSha ? `'${sqlEsc(git.headSha.slice(0, 10))}'` : 'NULL'},
  'switched_active_goal',
  '{}',
  ${now},
  ${now}
)
ON CONFLICT(repository_id) DO UPDATE SET
  current_task_id = '${sqlEsc(tid)}',
  last_agent_action = 'switched_active_goal',
  updated_at = ${now};
`;

  await executeD1WriteSql({ cwd, sql, write, wranglerConfig, databaseName });

  return {
    ok: true,
    ticketId: tid,
    repositoryId: repoId,
    agentRunId: runId,
  };
}

/**
 * Close/ship the active GOAP goal or a specified ticket.
 */
export async function closeGoapGoal({
  cwd = process.cwd(),
  ticketId = null,
  status = 'shipped',
  statusReason = null,
  linkedCommit = null,
  clearActive = true,
  accountId = null,
  wranglerConfig = 'apps/local-studio/backend/wrangler.jsonc',
  databaseName = 'inneranimalmedia-business',
  query = null,
  write = null,
} = {}) {
  const git = tryResolveGitContext({ cwd });
  const repoId = git?.repoFullName ? `github:${git.repoFullName.toLowerCase()}` : 'github:local/workspace';
  const now = Math.floor(Date.now() / 1000);

  let tid = clean(ticketId);
  if (!tid) {
    const existing = await readGoapState({ cwd, accountId, wranglerConfig, databaseName, query });
    tid = existing?.workspaceState?.current_task_id || existing?.activeTicket?.id;
  }
  if (!tid) throw new Error('no_active_ticket_to_close');
  const lookup = await executeD1JsonQuery({
    cwd,
    query,
    wranglerConfig,
    databaseName,
    sql: `SELECT id, account_id, repository_id FROM agentsam_tickets WHERE id = '${sqlEsc(tid)}' LIMIT 1;`,
  });
  const ticket = lookup?.[0]?.results?.[0];
  const accId = clean(accountId);
  if (!ticket) throw new Error('ticket_not_found');
  if (ticket.repository_id && ticket.repository_id !== repoId) throw new Error('ticket_repository_mismatch');
  if (!accId || ticket.account_id !== accId) throw new Error('ticket_account_mismatch');

  const commitSha = clean(linkedCommit) || clean(git?.headSha) || null;
  const { sql: closeSql } = generateTicketCloseSql({
    ticketId: tid,
    status,
    statusReason: statusReason || `closed_via_goap_${status}`,
    linkedCommit: commitSha,
    now,
  });

  const statements = [closeSql];

  if (clearActive) {
    statements.push(`
UPDATE agentsam_workspace_state SET
  current_task_id = NULL,
  last_agent_action = 'closed_task_${sqlEsc(tid)}_${sqlEsc(status)}',
  updated_at = ${now}
WHERE repository_id = '${sqlEsc(repoId)}';
`);
  }

  const fullSql = statements.join('\n\n');
  await executeD1WriteSql({ cwd, sql: fullSql, write, wranglerConfig, databaseName });

  return {
    ok: true,
    ticketId: tid,
    status,
    linkedCommit: commitSha,
    clearedActive: clearActive,
  };
}

/**
 * Render GOAP status view.
 */
export function renderGoapStatus(state = {}) {
  const ws = state.workspaceState || {};
  const ticket = state.activeTicket || {};
  const run = state.agentRun || {};
  const cp = state.cursor || {};
  const git = state.git || {};
  const headSha = git?.revisionSha || git?.headSha || 'unknown';

  return [
    '================================================================================',
    '                           GOAP BLACKBOARD STATUS                               ',
    '================================================================================',
    `Repository:    ${state.repositoryId || git?.repoFullName || 'unknown'}`,
    `Branch / HEAD: ${git?.branch || 'main'} @ ${headSha !== 'unknown' ? headSha.slice(0, 10) : 'unknown'} (${git?.dirty ? 'DIRTY' : 'CLEAN'})`,
    `Locked By:     ${ws.locked_by || 'unlocked'}`,
    `Active Task:   ${ws.current_task_id || ticket.id || 'none'}`,
    `Task Title:    ${ticket.title || 'no active ticket'}`,
    `Task Status:   ${ticket.status || 'none'} [Priority: ${ticket.priority || 'P2'}] [Subsystem: ${ticket.subsystem || 'general'}]`,
    `Agent Run:     ${ticket.agent_run_id || run.id || 'none'} [Status: ${run.status || 'none'}] [Mode: ${run.mode || 'agent'}]`,
    `Linked Commit: ${ticket.linked_commit ? ticket.linked_commit.slice(0, 10) : 'none'}`,
    `Checkpoint:    ${ws.checkpoint_sha ? ws.checkpoint_sha.slice(0, 10) : 'none'} (Tracker cursor: ${cp.last_sha ? cp.last_sha.slice(0, 10) : 'none'})`,
    `Last Action:   ${ws.last_agent_action || 'none'}`,
    `Updated:       ${formatDate(ws.updated_at || ticket.updated_at)}`,
    '--------------------------------------------------------------------------------',
    `Recent Ingested Commits (${state.recentCommits?.length || 0}):`,
    ...(state.recentCommits && state.recentCommits.length
      ? state.recentCommits.map((c) => `  * ${c.sha.slice(0, 8)} ${c.message?.slice(0, 65)} (${formatDate(c.committed_at)})`)
      : ['  (no commits ingested yet)']),
    '================================================================================',
  ].join('\n');
}

/**
 * Render GOAP list view.
 */
export function renderGoapList(state = {}) {
  const tickets = Array.isArray(state) ? state : (state.tickets || []);
  const currentTaskId = state.currentTaskId || state.activeTaskId || null;

  const header = [
    '================================================================================',
    '                                 GOAP TICKETS & GOALS                           ',
    '================================================================================',
  ];

  if (!tickets.length) {
    return [
      ...header,
      '  (no tickets found in agentsam_tickets)',
      '',
      '  To create a new goal, run:',
      '    agentsam goap new "Your goal title" [--priority P1] [--subsystem sys]',
      '================================================================================',
    ].join('\n');
  }

  const rows = [
    '  ACT  STATUS    PRI   TICKET ID                   TITLE',
    '  ---  --------  ----  --------------------------  -----------------------------',
  ];

  for (const t of tickets) {
    const isActive = Boolean(currentTaskId && t.id === currentTaskId);
    const actMark = isActive ? ' * ' : '   ';
    const status = (t.status || 'open').padEnd(8).slice(0, 8);
    const pri = (t.priority || 'P2').padEnd(4).slice(0, 4);
    const id = (t.id || '').padEnd(26).slice(0, 26);
    const title = (t.title || 'untitled').slice(0, 42);
    rows.push(`  ${actMark}  ${status}  ${pri}  ${id}  ${title}`);
  }

  return [
    ...header,
    ...rows,
    '--------------------------------------------------------------------------------',
    '  * = active blackboard goal',
    '  Commands:',
    '    agentsam goap new "<title>"        Create and activate a new goal',
    '    agentsam goap switch <ticket_id>   Switch active goal focus',
    '    agentsam goap close [ticket_id]    Close/ship active goal',
    '================================================================================',
  ].join('\n');
}

/**
 * Render GOAP goal view.
 */
export function renderGoapGoal(state = {}) {
  const ws = state.workspaceState || {};
  const ticket = state.activeTicket || {};
  const run = state.agentRun || {};

  return [
    '================================================================================',
    '                              GOAP ACTIVE GOAL                                  ',
    '================================================================================',
    `Goal ID:       ${ticket.id || ws.current_task_id || 'none'}`,
    `Title:         ${ticket.title || 'no goal active'}`,
    `Priority:      ${ticket.priority || 'P2'}`,
    `Subsystem:     ${ticket.subsystem || 'general'}`,
    `Surface:       ${ticket.surface || 'platform'}`,
    `Status:        ${ticket.status || 'none'}`,
    `Reason:        ${ticket.status_reason || 'primary sprint goal'}`,
    '--------------------------------------------------------------------------------',
    'EXECUTION RUN ENVELOPE:',
    `Agent Run ID:  ${ticket.agent_run_id || run.id || 'unassigned'}`,
    `Run Status:    ${run.status || 'unknown'}`,
    `Run Mode:      ${run.mode || 'agent'}`,
    `Started At:    ${formatDate(run.started_at_unix)}`,
    `Calls / Tools: ${run.model_call_count || 0} model / ${run.tool_call_count || 0} tool calls`,
    '--------------------------------------------------------------------------------',
    'GOAL SUCCESS CRITERIA:',
    '  1. Verify code changes pass local tests and typecheck.',
    '  2. Commit changes with a why-focused message.',
    '  3. Sync commit to agentsam_work_git_commits & advance checkpoint.',
    `  4. Populate agentsam_tickets.linked_commit for ${ticket.id || 'active task'}.`,
    '  5. Transition ticket to shipped and complete agent_run.',
    '================================================================================',
  ].join('\n');
}

/**
 * Render GOAP why view.
 */
export function renderGoapWhy(state = {}) {
  const ws = state.workspaceState || {};
  const ticket = state.activeTicket || {};
  const git = state.git || {};
  const headSha = git?.revisionSha || git?.headSha || 'unknown';

  return [
    '================================================================================',
    '                          GOAP BELIEF GROUNDING (WHY)                           ',
    '================================================================================',
    `Question: Why is task [${ticket.id || ws.current_task_id || 'none'}] active right now?`,
    '',
    'BELIEF FOUNDATIONS:',
    `  1. Repository Identity: ${state.repositoryId || git?.repoFullName || 'unknown'}`,
    `     - Workspace lock is held by '${ws.locked_by || 'agentsam_cli'}'.`,
    `     - Current HEAD is ${headSha !== 'unknown' ? headSha.slice(0, 10) : 'unknown'} (${git?.dirty ? 'working tree dirty' : 'clean'}).`,
    '',
    `  2. Ticket Priority & Assignment:`,
    `     - Ticket [${ticket.id || ws.current_task_id || 'none'}] is marked '${ticket.status || 'active'}' with priority '${ticket.priority || 'P2'}'.`,
    `     - Subsystem: '${ticket.subsystem || 'agent-runtime'}'.`,
    `     - Title: ${ticket.title || 'no active ticket'}`,
    '',
    `  3. Operational Provenance:`,
    `     - Linked Agent Run: ${ticket.agent_run_id || 'none'}`,
    `     - Checkpoint Commit: ${ws.checkpoint_sha ? ws.checkpoint_sha.slice(0, 10) : 'none'}`,
    `     - Linked Commit: ${ticket.linked_commit ? ticket.linked_commit.slice(0, 10) : 'pending commit'}`,
    `     - Last Agent Action: ${ws.last_agent_action || 'none'}`,
    '',
    'CONCLUSION:',
    ticket.id
      ? `  The agent selected this action because ticket [${ticket.id}] has active operator\n  focus, satisfies all prerequisite blockers, and is linked to the live workspace belief state.`
      : '  No ticket is currently active. Run `agentsam goap list` or `agentsam goap new` to establish focus.',
    '================================================================================',
  ].join('\n');
}

/**
 * Render GOAP plan view.
 */
export function renderGoapPlan(state = {}) {
  const ws = state.workspaceState || {};
  const ticket = state.activeTicket || {};
  const run = state.agentRun || {};
  const git = state.git || {};

  let steps = [];
  if (Array.isArray(state.steps) && state.steps.length > 0) {
    steps = state.steps.map((step) => ({
      text: step.title || step.text || String(step),
      status: step.status || 'open',
    }));
  } else if (ticket.plan_steps && Array.isArray(ticket.plan_steps)) {
    steps = ticket.plan_steps;
  } else if (ticket.description) {
    const lines = ticket.description.split('\n')
      .map((l) => l.trim())
      .filter((l) => /^(\d+\.|\*|\-|\-\s*\[[ x]\])/i.test(l));
    if (lines.length > 0) {
      steps = lines.map((l) => l.replace(/^(\d+\.|\*|\-\s*\[[ x]\]|\-)\s*/, '').trim());
    }
  }

  if (!steps.length) {
    if (ticket.title) {
      steps = [
        `Step 1: Understand context and isolate scope for "${ticket.title}"`,
        `Step 2: Implement focused changes with test-driven verification`,
        `Step 3: Run repository test suite and verify build integrity`,
        `Step 4: Commit changes with why-focused message linked to ${ticket.id || 'ticket'}`,
        `Step 5: Transition ticket ${ticket.id || ''} to shipped and finalize agent run`,
      ];
    } else {
      steps = [
        'No active goal selected. Use `agentsam goap new "<title>"` or `agentsam goap switch <ticket_id>` to select a goal.',
      ];
    }
  }

  return [
    '================================================================================',
    '                         GOAP OPERATIONAL ACTION PLAN                           ',
    '================================================================================',
    `Objective:      ${ticket.title || 'No active goal selected'}`,
    `Active Ticket:  ${ticket.id || ws.current_task_id || 'none'} [Priority: ${ticket.priority || 'P2'}]`,
    `Active Run:     ${ticket.agent_run_id || run.id || 'none'}`,
    `Repository:     ${state.repositoryId || git?.repoFullName || 'unknown'}`,
    '',
    'PLANNED ACTION SEQUENCE:',
    ...steps.map((step, idx) => {
      const text = typeof step === 'string' ? step : step.text;
      const status = typeof step === 'string' ? 'open' : step.status;
      const prefix = text.startsWith('Step ') || /^\d+\./.test(text) ? '' : `Step ${idx + 1}: `;
      const marker = status === 'complete' ? 'x' : status === 'blocked' ? '!' : ' ';
      return `  [${marker}] ${prefix}${text}`;
    }),
    '================================================================================',
  ].join('\n');
}
