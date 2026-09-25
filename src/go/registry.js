import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { SDK_ROOT } from './discover.js';
import { writeProductRegistryLocal } from './receipts.js';

const DEFAULT_DB = 'inneranimalmedia-business';
const DEFAULT_WRANGLER = 'apps/local-studio/backend/wrangler.jsonc';
const DEFAULT_REPOSITORY_ID = 'github:samprimeaux/agentsam-sdk';

function quote(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function json(value) {
  return JSON.stringify(value);
}

export function buildGoProductRegistrySql({
  product = 'agentsam-go-worker',
  status = 'deployed',
  version = '0.1.0',
  repositoryId = DEFAULT_REPOSITORY_ID,
  canonicalPath = 'apps/agentsam-go-worker',
  packageName = '@inneranimalmedia/agentsam-go-worker',
  url = null,
  commit = null,
  health = null,
  workerDeploymentId = null,
  workerVersionId = null,
  artifactDigest = null,
  containerDigest = null,
  description = 'AgentSam Go runtime (Worker edge + native Cloudflare Container)',
} = {}) {
  const metadata = {
    runtime: 'go',
    origin: 'agentsam.go.cloudflare',
    deployment: {
      provider: 'cloudflare',
      mode: 'worker-container',
      url: url || null,
      health: health || null,
      worker_deployment_id: workerDeploymentId,
      worker_version_id: workerVersionId,
      artifact_digest: artifactDigest,
      container_image_digest: containerDigest,
    },
    source: { commit: commit || null },
    capabilities: ['hash', 'inspect', 'runtime', 'capabilities'],
    cli_commands: [
      {
        id: 'agentsam:go:cloudflare',
        command: 'agentsam go --cloudflare agentsam-go-worker',
        description: 'Discover, build, deploy, and verify the Go runtime product',
      },
    ],
  };

  const statements = [];
  statements.push(
    `INSERT INTO agentsam_products (
  slug, name, kind, status, description, repository_id, canonical_path, package_name, version, tags, metadata, updated_at
) VALUES (
  ${quote(product)},
  ${quote(product)},
  'service',
  ${quote(status)},
  ${quote(description)},
  ${quote(repositoryId)},
  ${quote(canonicalPath)},
  ${quote(packageName)},
  ${quote(version)},
  ${quote(json(['go', 'cloudflare', 'runtime']))},
  ${quote(json(metadata))},
  unixepoch()
)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  kind = excluded.kind,
  status = excluded.status,
  description = excluded.description,
  repository_id = COALESCE(excluded.repository_id, agentsam_products.repository_id),
  canonical_path = excluded.canonical_path,
  package_name = excluded.package_name,
  version = excluded.version,
  tags = excluded.tags,
  metadata = excluded.metadata,
  updated_at = excluded.updated_at;`,
  );

  const relationships = [
    {
      target_type: 'code_repository',
      target_id: repositoryId,
      relationship_type: 'sourced_from',
      metadata: { origin: 'agentsam.go.cloudflare' },
    },
    {
      target_type: 'runtime',
      target_id: 'go',
      relationship_type: 'runs_on',
      metadata: { origin: 'agentsam.go.cloudflare' },
    },
    {
      target_type: 'cloudflare_worker',
      target_id: product,
      relationship_type: 'deployed_as',
      metadata: { origin: 'agentsam.go.cloudflare', url: url || null },
    },
    {
      target_type: 'cli_command',
      target_id: 'agentsam:go:cloudflare',
      relationship_type: 'exposes_command',
      metadata: {
        origin: 'agentsam.go.cloudflare',
        command: 'agentsam go --cloudflare agentsam-go-worker',
      },
    },
  ];

  for (const rel of relationships) {
    statements.push(
      `INSERT INTO asset_relationships (source_type, source_id, target_type, target_id, relationship_type, metadata)
SELECT 'agentsam_product', p.id, ${quote(rel.target_type)}, ${quote(rel.target_id)}, ${quote(rel.relationship_type)}, ${quote(json(rel.metadata))}
FROM agentsam_products p WHERE p.slug = ${quote(product)}
ON CONFLICT(source_type, source_id, target_type, target_id, relationship_type)
DO UPDATE SET metadata = excluded.metadata;`,
    );
  }

  return statements.join('\n');
}

export function applyGoProductRegistry({
  productRoot,
  product = 'agentsam-go-worker',
  cwd = SDK_ROOT,
  status = 'deployed',
  url = null,
  commit = null,
  health = null,
  workerDeploymentId = null,
  workerVersionId = null,
  artifactDigest = null,
  containerDigest = null,
  dryRun = false,
  skipRemote = false,
  spawn = spawnSync,
  repositoryId = DEFAULT_REPOSITORY_ID,
} = {}) {
  const sql = buildGoProductRegistrySql({
    product,
    status,
    url,
    commit,
    health,
    repositoryId,
  });

  const localRow = {
    slug: product,
    kind: 'service',
    name: product,
    status,
    repository_id: repositoryId,
    canonical_path: 'apps/agentsam-go-worker',
    package_name: '@inneranimalmedia/agentsam-go-worker',
    metadata: {
      runtime: 'go',
      deployment: { provider: 'cloudflare', mode: 'worker-container', url, health },
      source: { commit },
    },
  };
  const localPath = productRoot ? writeProductRegistryLocal(productRoot, localRow) : null;

  if (dryRun || skipRemote) {
    return {
      ok: true,
      remote: false,
      skipped: true,
      reason: dryRun ? 'dry_run' : 'skip_remote',
      sql,
      localPath,
      sql_sha256: createHash('sha256').update(sql).digest('hex'),
    };
  }

  const wranglerConfig = path.resolve(cwd, DEFAULT_WRANGLER);
  const tmpFile = path.join(os.tmpdir(), `agentsam-go-registry-${Date.now()}-${randomBytes(3).toString('hex')}.sql`);
  fs.writeFileSync(tmpFile, `${sql}\n`, 'utf8');

  try {
    const args = ['d1', 'execute', DEFAULT_DB, '--remote', '--yes', `--file=${tmpFile}`];
    if (fs.existsSync(wranglerConfig)) args.push('--config', wranglerConfig);

    const wranglerJs = path.join(cwd, 'apps/agentsam-go-worker/node_modules/wrangler/bin/wrangler.js');
    const localStudioWrangler = path.join(cwd, 'apps/local-studio/node_modules/wrangler/bin/wrangler.js');
    const rootWrangler = path.join(cwd, 'node_modules/wrangler/bin/wrangler.js');
    let command = 'npx';
    let cmdArgs = ['--yes', 'wrangler', ...args];
    for (const candidate of [wranglerJs, localStudioWrangler, rootWrangler]) {
      if (fs.existsSync(candidate)) {
        command = process.execPath;
        cmdArgs = [candidate, ...args];
        break;
      }
    }

    const res = spawn(command, cmdArgs, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env },
    });
    if (res.status !== 0) {
      const err = new Error('d1_registry_upsert_failed');
      err.detail = `${res.stdout || ''}\n${res.stderr || ''}`.trim().slice(0, 2000);
      throw err;
    }

    return {
      ok: true,
      remote: true,
      database: DEFAULT_DB,
      localPath,
      sql_sha256: createHash('sha256').update(sql).digest('hex'),
      stdout: (res.stdout || '').trim().slice(0, 500),
    };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}
