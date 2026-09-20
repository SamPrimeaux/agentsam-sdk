import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveGitContext, tryResolveGitContext } from './git-context.js';

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
 * Scan git commits from a repository root.
 * Returns array of { sha, message, author_name, author_email, committed_at }.
 */
export function scanGitCommits(cwd = process.cwd(), { limit = 50, sinceSha = null } = {}) {
  const args = ['log', `-n${Math.max(1, limit)}`, '--format=%H%x1f%s%x1f%an%x1f%ae%x1f%at'];
  if (sinceSha) {
    args.splice(1, 0, `${sinceSha}..HEAD`);
  }
  try {
    const raw = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    const commits = [];
    for (const line of lines) {
      const parts = line.split('\x1f');
      if (parts.length >= 5) {
        commits.push({
          sha: clean(parts[0]),
          message: clean(parts[1]),
          author_name: clean(parts[2]),
          author_email: clean(parts[3]),
          committed_at: Number(parts[4]) || Math.floor(Date.now() / 1000),
        });
      }
    }
    return commits;
  } catch {
    return [];
  }
}

/**
 * Generate idempotent SQL to insert commits and advance the tracking checkpoint.
 */
export function generateGitCommitIngestSql({
  accountId,
  repositoryId,
  commits = [],
  trackerKey = 'git_commit_ingest',
  branch = 'main',
  ticketId = null,
}) {
  const account = clean(accountId);
  const repository = clean(repositoryId);
  if (!account) throw new Error('account_id_required');
  if (!repository) throw new Error('repository_id_required');

  const statements = [];

  for (const c of commits) {
    if (!c.sha) continue;
    statements.push(`INSERT OR IGNORE INTO agentsam_work_git_commits (
  id, account_id, repository_id, sha, message, author_name, author_email, committed_at, captured_at
) VALUES (
  'wgc_' || lower(hex(randomblob(8))),
  ${sqlText(account)},
  ${sqlText(repository)},
  ${sqlText(c.sha)},
  ${sqlText(c.message)},
  ${sqlText(c.author_name)},
  ${sqlText(c.author_email)},
  ${sqlInt(c.committed_at)},
  unixepoch()
);`);
  }

  if (commits.length > 0) {
    const latestSha = commits[0].sha;
    const cursor = JSON.stringify({
      last_sha: latestSha,
      branch: branch || 'main',
      ingested_count: commits.length,
      updated_at: Math.floor(Date.now() / 1000),
    });

    statements.push(`INSERT INTO agentsam_work_tracking_checkpoint (
  account_id, repository_id, tracker_key, last_run_at, cursor_json, updated_at
) VALUES (
  ${sqlText(account)},
  ${sqlText(repository)},
  ${sqlText(trackerKey)},
  unixepoch(),
  ${sqlText(cursor)},
  unixepoch()
)
ON CONFLICT(account_id, repository_id, tracker_key) DO UPDATE SET
  last_run_at = excluded.last_run_at,
  cursor_json = excluded.cursor_json,
  updated_at = excluded.updated_at;`);

    // Wire git observation to active tickets
    statements.push(`UPDATE agentsam_tickets
SET linked_commit = ${sqlText(latestSha)}, updated_at = unixepoch()
WHERE (${sqlText(ticketId)} IS NOT NULL AND id = ${sqlText(ticketId)})
   OR (status = 'active' AND (linked_commit IS NULL OR linked_commit = '') AND (
     id = (SELECT current_task_id FROM agentsam_workspace_state WHERE repository_id = ${sqlText(repository)} AND current_task_id IS NOT NULL)
     OR project = 'inneranimalmedia'
   ));`);

    statements.push(`INSERT INTO agentsam_ticket_events (
  id, ticket_id, event_type, commit_sha, detail, actor_type, created_at
) SELECT
  'tke_' || lower(hex(randomblob(8))),
  id,
  'commit_linked',
  ${sqlText(latestSha)},
  'git observation linked commit ' || ${sqlText(latestSha)},
  'agentsam_git_observation',
  unixepoch()
FROM agentsam_tickets
WHERE linked_commit = ${sqlText(latestSha)}
  AND updated_at >= unixepoch() - 2;`);
  }

  return statements.join('\n\n');
}

/**
 * Sync git commits for a local repo checkout to Cloudflare D1.
 */
export async function syncGitCommitsToD1({
  cwd = process.cwd(),
  accountId,
  repositoryId,
  ticketId = null,
  wranglerConfig = 'apps/local-studio/backend/wrangler.jsonc',
  databaseName = 'inneranimalmedia-business',
  limit = 25,
  trackerKey = 'git_commit_ingest',
} = {}) {
  const git = tryResolveGitContext({ cwd });
  const repoId = repositoryId || (git?.repoFullName ? `github:${git.repoFullName.toLowerCase()}` : null);
  if (!repoId) throw new Error('repository_identity_unresolved');
  if (!accountId) throw new Error('account_id_required');

  const commits = scanGitCommits(cwd, { limit });
  if (!commits.length) {
    return { ok: true, ingested: 0, latest_sha: null };
  }

  const sql = generateGitCommitIngestSql({
    accountId,
    repositoryId: repoId,
    commits,
    trackerKey,
    branch: git?.branch || 'main',
    ticketId,
  });

  const tmpFile = path.join(os.tmpdir(), `agentsam-commit-sync-${Date.now()}.sql`);
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
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      ok: true,
      ingested: commits.length,
      latest_sha: commits[0].sha,
      repository_id: repoId,
    };
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }
}
