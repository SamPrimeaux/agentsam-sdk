import fs from 'node:fs';
import path from 'node:path';
import { tryResolveGitContext } from './git-context.js';
import { inspectLocalSqlite } from '../local/sqlite.js';

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

function readProjectConfig(root) {
  const configPath = path.join(root, '.agentsam', 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
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
  const config = readProjectConfig(root);
  const git = tryResolveGitContext({ cwd: root });

  let db = { ok: false, exists: false, tables: [] };
  if (config) {
    db = await inspectLocalSqlite(path.join(root, config.db_path || '.agentsam/data/agentsam.sqlite'));
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
    project: config?.project || path.basename(root),
    lane: config?.lane || null,
    agent: config?.agent || null,
    deployTarget: config?.deploy_target || null,
    scaffoldVersion: config?.scaffold_version || null,
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
