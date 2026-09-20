import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tryResolveGitContext } from './git-context.js';

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

/**
 * Generate idempotent SQL to upsert workspace state keyed on repository_id (singleton per repo).
 */
export function generateWorkspaceStateUpsertSql({
  repositoryId,
  workspaceId = null,
  currentTaskId = null,
  lockedBy = null,
  checkpointSha = null,
  checkpointLabel = null,
  activeFile = null,
  lastAgentAction = null,
  stateJson = '{}',
  now = Math.floor(Date.now() / 1000),
}) {
  const repoId = clean(repositoryId);
  if (!repoId) throw new Error('repository_id_required');

  const wsId = clean(workspaceId) || `ws_${repoId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const taskId = clean(currentTaskId) || null;
  const locker = clean(lockedBy) || null;
  const sha = clean(checkpointSha) || null;
  const label = clean(checkpointLabel) || null;
  const file = clean(activeFile) || null;
  const action = clean(lastAgentAction) || null;
  const state = typeof stateJson === 'string' ? stateJson : JSON.stringify(stateJson || {});

  const insertSql = `INSERT INTO agentsam_workspace_state (
  id, repository_id, workspace_id, current_task_id, locked_by, checkpoint_sha,
  checkpoint_label, active_file, last_agent_action, state_json, created_at, updated_at
) VALUES (
  'wss_' || lower(hex(randomblob(8))),
  ${sqlText(repoId)},
  ${sqlText(wsId)},
  ${sqlText(taskId)},
  ${sqlText(locker)},
  ${sqlText(sha)},
  ${sqlText(label)},
  ${sqlText(file)},
  ${sqlText(action)},
  ${sqlText(state)},
  ${sqlInt(now)},
  ${sqlInt(now)}
)
ON CONFLICT(repository_id) DO UPDATE SET
  current_task_id = COALESCE(excluded.current_task_id, agentsam_workspace_state.current_task_id),
  locked_by = COALESCE(excluded.locked_by, agentsam_workspace_state.locked_by),
  checkpoint_sha = COALESCE(excluded.checkpoint_sha, agentsam_workspace_state.checkpoint_sha),
  checkpoint_label = COALESCE(excluded.checkpoint_label, agentsam_workspace_state.checkpoint_label),
  active_file = COALESCE(excluded.active_file, agentsam_workspace_state.active_file),
  last_agent_action = COALESCE(excluded.last_agent_action, agentsam_workspace_state.last_agent_action),
  state_json = CASE WHEN excluded.state_json != '{}' THEN excluded.state_json ELSE agentsam_workspace_state.state_json END,
  updated_at = excluded.updated_at;`;

  return insertSql;
}

/**
 * Read workspace state from D1 for a repository.
 */
export async function readWorkspaceStateFromD1({
  cwd = process.cwd(),
  repositoryId = null,
  wranglerConfig = 'apps/local-studio/backend/wrangler.jsonc',
  databaseName = 'inneranimalmedia-business',
} = {}) {
  const git = tryResolveGitContext({ cwd });
  const repoId = repositoryId || (git?.repoFullName ? `github:${git.repoFullName.toLowerCase()}` : null);
  if (!repoId) return null;

  try {
    const configPath = path.resolve(wranglerConfig);
    const args = [
      'd1', 'execute', databaseName, '--remote', '--json',
      `--command=SELECT * FROM agentsam_workspace_state WHERE repository_id = '${sqlEsc(repoId)}' LIMIT 1;`,
    ];
    if (fs.existsSync(configPath)) {
      args.push('--config', configPath);
    }
    const out = execFileSync('npx', ['wrangler', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(out);
    const rows = parsed?.[0]?.results;
    return rows && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

/**
 * Sync workspace state beliefs to Cloudflare D1.
 */
export async function syncWorkspaceStateToD1({
  cwd = process.cwd(),
  repositoryId = null,
  workspaceId = null,
  currentTaskId = null,
  lockedBy = 'agentsam_cli',
  checkpointSha = null,
  checkpointLabel = null,
  activeFile = null,
  lastAgentAction = null,
  stateJson = '{}',
  wranglerConfig = 'apps/local-studio/backend/wrangler.jsonc',
  databaseName = 'inneranimalmedia-business',
} = {}) {
  const git = tryResolveGitContext({ cwd });
  const repoId = repositoryId || (git?.repoFullName ? `github:${git.repoFullName.toLowerCase()}` : null);
  if (!repoId) throw new Error('repository_identity_unresolved');

  const sha = checkpointSha || git?.headSha || null;
  const sql = generateWorkspaceStateUpsertSql({
    repositoryId: repoId,
    workspaceId,
    currentTaskId,
    lockedBy,
    checkpointSha: sha,
    checkpointLabel,
    activeFile,
    lastAgentAction,
    stateJson,
  });

  const tmpFile = path.join(os.tmpdir(), `agentsam-ws-sync-${Date.now()}.sql`);
  fs.writeFileSync(tmpFile, `${sql}\n`, 'utf8');

  try {
    const configPath = path.resolve(wranglerConfig);
    const args = ['d1', 'execute', databaseName, '--remote', '--yes', `--file=${tmpFile}`];
    if (fs.existsSync(configPath)) {
      args.push('--config', configPath);
    }
    execFileSync('npx', ['wrangler', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return {
      ok: true,
      repository_id: repoId,
      current_task_id: currentTaskId,
      checkpoint_sha: sha,
    };
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }
}
