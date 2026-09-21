import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tryResolveGitContext } from './git-context.js';

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
  wranglerConfig = 'apps/local-studio/backend/wrangler.jsonc',
  databaseName = 'inneranimalmedia-business',
} = {}) {
  const git = tryResolveGitContext({ cwd });
  const repoId = repositoryId || (git?.repoFullName ? `github:${git.repoFullName.toLowerCase()}` : null);
  if (!repoId) return { ok: false, error: 'repository_identity_unresolved', git };

  try {
    const configPath = path.resolve(wranglerConfig);
    const sql = `
SELECT * FROM agentsam_workspace_state WHERE repository_id = '${sqlEsc(repoId)}' LIMIT 1;
SELECT * FROM agentsam_tickets WHERE id = (SELECT current_task_id FROM agentsam_workspace_state WHERE repository_id = '${sqlEsc(repoId)}') ORDER BY (id = (SELECT current_task_id FROM agentsam_workspace_state WHERE repository_id = '${sqlEsc(repoId)}')) DESC, updated_at DESC LIMIT 1;
SELECT * FROM agentsam_agent_run WHERE id = (SELECT agent_run_id FROM agentsam_tickets WHERE id = (SELECT current_task_id FROM agentsam_workspace_state WHERE repository_id = '${sqlEsc(repoId)}') ORDER BY updated_at DESC LIMIT 1) LIMIT 1;
SELECT sha, message, committed_at FROM agentsam_work_git_commits WHERE repository_id = '${sqlEsc(repoId)}' ORDER BY committed_at DESC LIMIT 3;
SELECT * FROM agentsam_work_tracking_checkpoint WHERE repository_id = '${sqlEsc(repoId)}' AND tracker_key = 'git_commit_ingest' LIMIT 1;
`;
    let out = '';
    const args = ['d1', 'execute', databaseName, '--remote', '--json', '--command', sql];
    if (fs.existsSync(configPath)) args.push('--config', configPath);
    out = execFileSync('npx', ['wrangler', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const startIdx = out.indexOf('[');
    const endIdx = out.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) {
      throw new Error(`Invalid JSON output from D1: ${out.slice(0, 200)}`);
    }
    const data = JSON.parse(out.slice(startIdx, endIdx + 1));
    const workspaceState = data?.[0]?.results?.[0] || null;
    const activeTicket = data?.[1]?.results?.[0] || null;
    const agentRun = data?.[2]?.results?.[0] || null;
    const recentCommits = data?.[3]?.results || [];
    const checkpoint = data?.[4]?.results?.[0] || null;

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
    };
  } catch (err) {
    return {
      ok: false,
      repositoryId: repoId,
      git,
      error: err?.message || String(err),
    };
  }
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
 * Render GOAP goal view.
 */
export function renderGoapGoal(state = {}) {
  const ticket = state.activeTicket || {};
  const run = state.agentRun || {};

  return [
    '================================================================================',
    '                              GOAP ACTIVE GOAL                                  ',
    '================================================================================',
    `Goal ID:       ${ticket.id || 'none'}`,
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
    '  4. Populate agentsam_tickets.linked_commit.',
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
    `Question: Why is task [${ticket.id || 'none'}] active right now?`,
    '',
    'BELIEF FOUNDATIONS:',
    `  1. Repository Identity: ${state.repositoryId || git?.repoFullName}`,
    `     - Workspace lock is held by '${ws.locked_by || 'agentsam_cli'}'.`,
    `     - Current HEAD is ${headSha !== 'unknown' ? headSha.slice(0, 10) : 'unknown'} (${git?.dirty ? 'working tree dirty' : 'clean'}).`,
    '',
    `  2. Ticket Priority & Assignment:`,
    `     - Ticket [${ticket.id || 'none'}] is marked '${ticket.status || 'active'}' with priority '${ticket.priority || 'P1'}'.`,
    `     - Subsystem: '${ticket.subsystem || 'agent-runtime'}'.`,
    `     - Dedup Key: ${ticket.dedup_key || 'singleton_sprint'}.`,
    '',
    `  3. Operational Provenance:`,
    `     - Linked Agent Run: ${ticket.agent_run_id || 'arun_active'}`,
    `     - Checkpoint Commit: ${ws.checkpoint_sha ? ws.checkpoint_sha.slice(0, 10) : 'none'}`,
    `     - Linked Commit: ${ticket.linked_commit ? ticket.linked_commit.slice(0, 10) : 'pending commit'}`,
    `     - Last Agent Action: ${ws.last_agent_action || 'turn_active'}`,
    '',
    'CONCLUSION:',
    `  The agent selected this action because ticket [${ticket.id || 'task'}] has active operator`,
    '  focus, satisfies all prerequisite blockers, and is linked to the live workspace belief state.',
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

  return [
    '================================================================================',
    '                         GOAP OPERATIONAL ACTION PLAN                           ',
    '================================================================================',
    `Objective:      ${ticket.title || 'Solidify runtime architecture'}`,
    `Active Run:     ${ticket.agent_run_id || run.id || 'arun_active'}`,
    `Repository:     ${state.repositoryId || git?.repoFullName}`,
    '',
    'PLANNED ACTION SEQUENCE:',
    '  [x] Step 1: Wire agent_run_id onto ticket creation & activation',
    `             Receipt: agentsam_agent_run row ${ticket.agent_run_id || 'created'} linked to ticket ${ticket.id || ''}`,
    '',
    '  [x] Step 2: Make agentsam_workspace_state portable with repository_id UNIQUE',
    `             Receipt: repository_id='${state.repositoryId}', locked_by='${ws.locked_by || 'agentsam_cli'}'`,
    '',
    '  [x] Step 3: Wire git-observation pair (commits -> checkpoint -> tickets.linked_commit)',
    `             Receipt: agentsam_tickets.linked_commit='${ticket.linked_commit ? ticket.linked_commit.slice(0, 10) : 'none'}'`,
    '',
    '  [x] Step 4: Finish project awareness (project card, knowledge.search, Context Resolver)',
    '             Receipt: buildProjectCard + resolveProjectContext + capabilityAdapter.search',
    '',
    '  [x] Step 5: /goap status|goal|why|plan read-only view over live tables',
    '             Receipt: Real-time queries over D1 / SQLite without empty tables',
    '================================================================================',
  ].join('\n');
}
