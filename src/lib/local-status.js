import fs from 'node:fs';
import path from 'node:path';
import { tryResolveGitContext } from './git-context.js';
import { inspectLocalSqlite } from '../local/sqlite.js';
import { getCreatedWithVersion, getDefaultProfile, getDeployTarget, getLocalDatabasePath, getProjectName, getProjectPreset, getRepositoryId, tryReadProjectConfig } from './project-config.js';

export function findAgentSamProjectRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 16; i += 1) {
    if (fs.existsSync(path.join(dir, '.agentsam', 'config.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(500) });
    return { online: response.ok, status: response.status, url };
  } catch {
    return { online: false, status: null, url };
  }
}

export async function collectLocalStatus(cwd = process.cwd()) {
  const root = findAgentSamProjectRoot(cwd);
  const config = tryReadProjectConfig(root);
  const git = tryResolveGitContext({ cwd: root });

  let db = { ok: false, exists: false, tables: [] };
  if (config) {
    db = await inspectLocalSqlite(path.join(root, getLocalDatabasePath(config)));
  }

  const devPort = config?.dev_port ?? 8787;
  const ptyPort = config?.pty_port ?? 3099;
  const [api, pty] = await Promise.all([
    probe(`http://127.0.0.1:${devPort}/api/health`),
    probe(`http://127.0.0.1:${ptyPort}/health`),
  ]);

  return {
    schemaVersion: 'agentsam-local-status-v1',
    configured: Boolean(config),
    root,
    project: getProjectName(config, path.basename(root)),
    repositoryId: getRepositoryId(config),
    lane: getProjectPreset(config),
    agent: getDefaultProfile(config),
    deployTarget: getDeployTarget(config),
    scaffoldVersion: getCreatedWithVersion(config),
    git: git
      ? {
          repo: git.repoFullName || null,
          branch: git.branch || null,
          revision: git.revisionSha || null,
          dirty: Boolean(git.dirty),
        }
      : null,
    db: {
      ready: Boolean(db.exists),
      path: db.dbPath || path.join(root, '.agentsam/data/agentsam.sqlite'),
      tables: db.tables || [],
      sizeBytes: db.sizeBytes || 0,
    },
    api,
    pty,
  };
}
