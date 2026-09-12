import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { resolveGitContext } from '../../packages/agentsam-repository/src/git-context.js';
import { getRepositoryId, tryReadProjectConfig } from '../lib/project-config.js';
import { buildMerkleTree } from '../../packages/agentsam-repository/src/merkle/index.js';
import { gitIgnoredPaths } from '../lib/merkle/git-ignore.js';
import { analyzeExecutionBoundaries } from '../indexing/execution-boundary.js';
import { showLatestDeployReceipt } from '../lib/deploy-receipt/index.js';
import { CONFIG_PATH, canonical, readConfig, scopeKey } from '../knowledge/config.js';
import { openSqliteStore } from '../knowledge/stores/sqlite.js';

const execute = promisify(execFile);

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function providerForHost(host) {
  const value = String(host || '').toLowerCase();
  if (value === 'github.com') return 'github';
  if (value === 'gitlab.com') return 'gitlab';
  if (value === 'bitbucket.org') return 'bitbucket';
  return value ? 'git' : null;
}


async function runRepositoryIntelligence(root, churnDays) {
  const pythonRoot = fileURLToPath(new URL('../../python', import.meta.url));
  const result = await execute(process.platform === 'win32' ? 'python' : 'python3', [
    '-B', '-m', 'agentsam_sdk.repository.intelligence', '--repo-root', root,
    '--churn-days', String(churnDays), '--json',
  ], {
    env: { ...process.env, PYTHONPATH: [pythonRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) },
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(result.stdout);
}

function readPackageInventory(root, manifests = []) {
  const packages = [];
  for (const row of manifests) {
    if (row.kind !== 'node' || path.basename(row.path) !== 'package.json') continue;
    const filename = path.join(root, row.path);
    try {
      const parsed = JSON.parse(fs.readFileSync(filename, 'utf8'));
      packages.push({
        path: row.path,
        name: parsed.name || null,
        version: parsed.version || null,
        private: parsed.private === true,
        type: parsed.type || null,
        bins: parsed.bin || null,
        exports: parsed.exports && typeof parsed.exports === 'object' ? Object.keys(parsed.exports) : [],
        scripts: parsed.scripts && typeof parsed.scripts === 'object' ? Object.keys(parsed.scripts).sort() : [],
        dependencies: parsed.dependencies && typeof parsed.dependencies === 'object' ? Object.keys(parsed.dependencies).sort() : [],
        dev_dependencies: parsed.devDependencies && typeof parsed.devDependencies === 'object' ? Object.keys(parsed.devDependencies).sort() : [],
        workspaces: parsed.workspaces || null,
      });
    } catch {
      packages.push({ path: row.path, invalid: true });
    }
  }
  return packages.sort((a, b) => a.path.localeCompare(b.path));
}

async function readKnowledgeState(root) {
  const filename = path.join(root, CONFIG_PATH);
  if (!fs.existsSync(filename)) return { configured: false };
  try {
    const config = readConfig(root);
    const state = {
      configured: true,
      repository_id: config.repository_id,
      scope: config.scope,
      storage: config.storage.driver,
      embedding_profile: config.embedding,
      legacy_workspace_id: config.workspace_id || null,
    };
    if (config.storage.driver !== 'sqlite') return state;
    const store = await openSqliteStore(path.join(root, '.agentsam', 'knowledge', 'index.sqlite'), { readOnly: true });
    if (!store) return { ...state, indexed: false };
    try {
      const generation = await store.active(scopeKey(config));
      if (!generation) return { ...state, indexed: false };
      return {
        ...state,
        indexed: true,
        generation_id: generation.id,
        created_at: generation.created_at,
        source_hash: generation.source_hash,
        profile_id: generation.profile_id || null,
        receipt: generation.receipt || null,
      };
    } finally {
      await store.close();
    }
  } catch (error) {
    return { configured: true, error: error?.message || String(error) };
  }
}

/**
 * Canonical deterministic repository evidence snapshot.
 * Read-only: no source/config/index/deploy state is created or modified.
 */
export async function repositorySnapshot({ cwd = process.cwd(), churnDays = 30 } = {}) {
  if (!Number.isInteger(churnDays) || churnDays < 1 || churnDays > 3650) {
    throw new RangeError('churnDays must be an integer from 1..3650');
  }
  const git = resolveGitContext({ cwd });
  const root = git.root;
  const ignored = await gitIgnoredPaths(root);
  const projectConfig = tryReadProjectConfig(root);
  const [intelligence, merkle, knowledge, deployReceipt] = await Promise.all([
    runRepositoryIntelligence(root, churnDays),
    buildMerkleTree(root, { exclude: ignored, semantic: true }),
    readKnowledgeState(root),
    showLatestDeployReceipt({ root }),
  ]);
  const provider = providerForHost(git.remoteHost);
  const portableRepositoryId = provider && git.repoFullName
    ? `${provider}:${provider === 'github' ? git.repoFullName.toLowerCase() : git.repoFullName}`
    : null;
  const projectRepositoryId = getRepositoryId(projectConfig);
  if (projectRepositoryId && knowledge.repository_id && projectRepositoryId !== knowledge.repository_id) {
    throw new Error(`repository_identity_mismatch: project=${projectRepositoryId} knowledge=${knowledge.repository_id}`);
  }
  const repositoryId = projectRepositoryId || knowledge.repository_id || portableRepositoryId;
  const packages = readPackageInventory(root, intelligence.manifests || []);
  const trustBoundary = analyzeExecutionBoundaries(merkle.semantic);

  const evidence = {
    repository: {
      repository_id: repositoryId,
      identity_source: projectRepositoryId ? 'project-config' : knowledge.repository_id ? 'knowledge-config' : portableRepositoryId ? 'git-remote' : 'unresolved',
      provider,
      full_name: git.repoFullName,
      remote_url: git.remoteUrl || null,
      branch: git.branch,
      revision_sha: git.revisionSha,
      dirty: git.dirty,
    },
    tree: {
      merkle_root: merkle.rootHash,
      metadata_root: merkle.semantic.rootHash,
      manifest: {
        format: merkle.format,
        version: merkle.version,
        hash_algorithm: merkle.algorithm,
        policy_hash: merkle.policyHash,
      },
      classifier: merkle.semantic.classifier,
      stats: merkle.stats,
      semantic_stats: merkle.semantic.stats,
      paths: merkle.entries
        .filter((entry) => entry.type === 'file' || entry.type === 'symlink')
        .map((entry) => entry.path),
      files: merkle.semantic.entries,
    },
    intelligence: {
      summary: intelligence.summary,
      languages: intelligence.languages || [],
      manifests: intelligence.manifests || [],
      top_level: intelligence.top_level || [],
      pressure_points: intelligence.pressure_points || [],
    },
    packages,
    knowledge,
    analysis: {
      trust_boundary: trustBoundary,
    },
    deploy: deployReceipt ? {
      status: deployReceipt.status,
      root_hash: deployReceipt.root_hash,
      git_sha: deployReceipt.git_sha,
      deployment_id: deployReceipt.deployment_id || null,
      worker_version_id: deployReceipt.worker_version_id || null,
      completed_at: deployReceipt.completed_at || null,
    } : null,
  };
  const contentHash = sha256(evidence);
  return {
    schema_version: 1,
    capability: 'repository.snapshot',
    snapshot_id: `rsnap_${contentHash.slice(0, 24)}`,
    created_at: new Date().toISOString(),
    content_hash: `sha256:${contentHash}`,
    ...evidence,
  };
}
