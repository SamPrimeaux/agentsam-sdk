import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolveGitContext } from '../git-context.js';
import {
  MERKLE_SNAPSHOT_STORAGE_PREFIX,
  MERKLE_SNAPSHOT_TABLE,
  MERKLE_WEBSITE_ASSETS_BINDING,
  merkleSnapshotStorageKey,
  normalizeMerkleStoragePrefix,
} from './persistence.js';

const D1_BINDING = 'DB';
const CAPTURE_KINDS = new Set(['deploy', 'manual', 'agent', 'index']);
const SOURCES = new Set(['github', 'gitlab', 'bitbucket', 'local', 'upload']);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function stripJsonComments(input) {
  let out = '';
  let string = false;
  let quote = '';
  let escaped = false;
  let line = false;
  let block = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (line) {
      if (char === '\n') { line = false; out += char; }
      continue;
    }
    if (block) {
      if (char === '*' && next === '/') { block = false; i += 1; }
      continue;
    }
    if (string) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) string = false;
      continue;
    }
    if (char === '"' || char === "'") { string = true; quote = char; out += char; continue; }
    if (char === '/' && next === '/') { line = true; i += 1; continue; }
    if (char === '/' && next === '*') { block = true; i += 1; continue; }
    out += char;
  }
  return out;
}

function parseTomlBindings(text) {
  const rows = { r2_buckets: [], d1_databases: [] };
  let current = null;
  let currentType = null;
  const flush = () => {
    if (current && currentType) rows[currentType].push(current);
    current = null;
    currentType = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const header = line.match(/^\[\[(?:env\.([^.\]]+)\.)?(r2_buckets|d1_databases)\]\]$/);
    if (header) {
      flush();
      currentType = header[2];
      current = { environment: header[1] || null };
      continue;
    }
    if (/^\[/.test(line)) { flush(); continue; }
    if (!current || !line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*["']([^"']*)["']/);
    if (match) current[match[1]] = match[2];
  }
  flush();
  return rows;
}

function rowsFromJson(parsed, environment) {
  const base = parsed && typeof parsed === 'object' ? parsed : {};
  const env = environment && base.env?.[environment] && typeof base.env[environment] === 'object'
    ? base.env[environment]
    : {};
  return {
    r2_buckets: [...(env.r2_buckets || []), ...(base.r2_buckets || [])],
    d1_databases: [...(env.d1_databases || []), ...(base.d1_databases || [])],
  };
}

export function readWranglerPersistenceBindings(configPath, { environment = null } = {}) {
  const filename = path.resolve(configPath);
  const text = fs.readFileSync(filename, 'utf8');
  const ext = path.extname(filename).toLowerCase();
  let rows;
  if (ext === '.json' || ext === '.jsonc') rows = rowsFromJson(JSON.parse(stripJsonComments(text)), environment);
  else rows = parseTomlBindings(text);
  const scoped = (items) => {
    if (!environment) return items.filter((row) => !row.environment);
    const envRows = items.filter((row) => row.environment === environment);
    return envRows.length ? envRows : items.filter((row) => !row.environment);
  };
  return { configPath: filename, r2_buckets: scoped(rows.r2_buckets), d1_databases: scoped(rows.d1_databases) };
}

export function resolveWranglerMerklePersistence({
  configPath,
  environment = null,
  r2Binding = MERKLE_WEBSITE_ASSETS_BINDING,
  d1Binding = D1_BINDING,
  r2Only = false,
} = {}) {
  if (!clean(configPath)) throw new Error('wrangler_config_required');
  const rows = readWranglerPersistenceBindings(configPath, { environment });
  const r2 = rows.r2_buckets.find((row) => clean(row.binding) === clean(r2Binding));
  if (!r2?.bucket_name) throw new Error(`wrangler_r2_binding_not_found:${r2Binding}`);
  const d1 = rows.d1_databases.find((row) => clean(row.binding) === clean(d1Binding));
  if (!r2Only && !d1?.database_name) throw new Error(`wrangler_d1_binding_not_found:${d1Binding}`);
  return {
    config_path: rows.configPath,
    environment: environment || null,
    r2_binding: r2Binding,
    storage_bucket: String(r2.bucket_name),
    d1_binding: r2Only ? null : d1Binding,
    database_name: r2Only ? null : String(d1.database_name),
  };
}

function safeId(value) {
  return clean(value).replace(/[^A-Za-z0-9._-]+/g, '').slice(0, 96);
}

function snapshotIdFor({ snapshot, repositoryId, captureKind, deploymentId }) {
  const deployment = safeId(deploymentId);
  if (captureKind === 'deploy' && deployment) return `mrs_dep_${deployment.toLowerCase()}`;
  const digest = createHash('sha256')
    .update([repositoryId, snapshot.rootHash, snapshot.semantic?.rootHash || '', captureKind].join('\0'))
    .digest('hex');
  return `mrs_${digest.slice(0, 24)}`;
}

function sqlEsc(value) {
  return String(value ?? '').replaceAll("'", "''");
}

function sqlText(value) {
  return value == null || value === '' ? 'NULL' : `'${sqlEsc(value)}'`;
}

function sqlInt(value) {
  return value == null || value === '' || !Number.isFinite(Number(value)) ? 'NULL' : String(Math.trunc(Number(value)));
}

export function buildMerklePersistencePlan({
  snapshot,
  root = process.cwd(),
  accountId,
  repositoryId,
  source = 'local',
  captureKind = 'manual',
  connectionId = null,
  runtimeLeaseId = null,
  deploymentId = null,
  workerVersionId = null,
  referenceLabel = null,
  storagePrefix = MERKLE_SNAPSHOT_STORAGE_PREFIX,
  wrangler,
} = {}) {
  if (!snapshot?.rootHash || !Array.isArray(snapshot?.entries)) throw new Error('merkle_snapshot_required');
  const account = clean(accountId);
  const repository = clean(repositoryId);
  if (!account) throw new Error('account_id_required');
  if (!repository) throw new Error('repository_id_required');
  if (!CAPTURE_KINDS.has(captureKind)) throw new Error(`capture_kind_invalid:${captureKind}`);
  if (!SOURCES.has(source)) throw new Error(`source_invalid:${source}`);
  if (captureKind !== 'deploy' && !clean(connectionId) && !clean(runtimeLeaseId)) throw new Error('execution_provenance_required');
  let git = null;
  try { git = resolveGitContext({ cwd: root }); } catch { git = null; }
  const snapshotId = snapshotIdFor({ snapshot, repositoryId: repository, captureKind, deploymentId });
  const prefix = normalizeMerkleStoragePrefix(storagePrefix);
  const storageKey = merkleSnapshotStorageKey({ accountId: account, repositoryId: repository, snapshotId, prefix });
  const createdAt = Math.floor(Date.now() / 1000);
  const classifier = snapshot.semantic?.classifier || null;
  const row = {
    snapshot_id: snapshotId,
    account_id: account,
    repository_id: repository,
    repository: git?.remoteUrl || null,
    source,
    manifest_format: snapshot.format || 'agentsam-merkle',
    manifest_version: snapshot.version || 1,
    hash_algorithm: snapshot.algorithm || 'sha256',
    root_hash: snapshot.rootHash,
    policy_hash: snapshot.policyHash || null,
    resolved_commit_sha: git?.revisionSha || null,
    resolved_tree_sha: null,
    git_branch: git?.branch || null,
    working_tree_dirty: git?.dirty ? 1 : 0,
    connection_id: clean(connectionId) || null,
    runtime_lease_id: clean(runtimeLeaseId) || null,
    storage_backend: 'r2',
    storage_bucket: wrangler.storage_bucket,
    storage_key: storageKey,
    entry_count: snapshot.entries.length,
    file_count: snapshot.stats?.files ?? null,
    directory_count: snapshot.stats?.directories ?? null,
    symlink_count: snapshot.stats?.symlinks ?? 0,
    total_bytes: snapshot.stats?.bytes ?? null,
    capture_kind: captureKind,
    deployment_id: clean(deploymentId) || null,
    worker_version_id: clean(workerVersionId) || null,
    reference_label: clean(referenceLabel) || `${captureKind}:${snapshotId}`,
    created_at: createdAt,
    persisted_at: createdAt,
    metadata_root: snapshot.semantic?.rootHash || null,
    classifier_format: classifier?.format || null,
    classifier_version: classifier?.version ?? null,
    classifier_source: classifier?.source || null,
  };
  return { snapshot_id: snapshotId, storage_key: storageKey, row, wrangler, prefix };
}

export function merklePersistenceUpsertSql(row) {
  return `INSERT INTO ${MERKLE_SNAPSHOT_TABLE} (
  snapshot_id, account_id, repository_id, repository, source,
  manifest_format, manifest_version, hash_algorithm, root_hash, policy_hash,
  resolved_commit_sha, resolved_tree_sha, git_branch, working_tree_dirty,
  connection_id, runtime_lease_id, storage_backend, storage_bucket, storage_key,
  entry_count, file_count, directory_count, symlink_count, total_bytes,
  capture_kind, deployment_id, worker_version_id, reference_label,
  created_at, persisted_at, metadata_root, classifier_format, classifier_version, classifier_source
) VALUES (
  ${sqlText(row.snapshot_id)}, ${sqlText(row.owner_user_id)}, ${sqlText(row.repo_id)}, ${sqlText(row.repository)}, ${sqlText(row.source)},
  ${sqlText(row.manifest_format)}, ${sqlInt(row.manifest_version)}, ${sqlText(row.hash_algorithm)}, ${sqlText(row.root_hash)}, ${sqlText(row.policy_hash)},
  ${sqlText(row.resolved_commit_sha)}, ${sqlText(row.resolved_tree_sha)}, ${sqlText(row.git_branch)}, ${sqlInt(row.working_tree_dirty)},
  ${sqlText(row.connection_id)}, ${sqlText(row.runtime_lease_id)}, ${sqlText(row.storage_backend)}, ${sqlText(row.storage_bucket)}, ${sqlText(row.storage_key)},
  ${sqlInt(row.entry_count)}, ${sqlInt(row.file_count)}, ${sqlInt(row.directory_count)}, ${sqlInt(row.symlink_count)}, ${sqlInt(row.total_bytes)},
  ${sqlText(row.capture_kind)}, ${sqlText(row.deployment_id)}, ${sqlText(row.worker_version_id)}, ${sqlText(row.reference_label)},
  ${sqlInt(row.created_at)}, ${sqlInt(row.persisted_at)}, ${sqlText(row.metadata_root)}, ${sqlText(row.classifier_format)}, ${sqlInt(row.classifier_version)}, ${sqlText(row.classifier_source)}
)
ON CONFLICT(snapshot_id) DO UPDATE SET
  storage_backend=excluded.storage_backend,
  storage_bucket=excluded.storage_bucket,
  storage_key=excluded.storage_key,
  persisted_at=excluded.persisted_at,
  deployment_id=excluded.deployment_id,
  worker_version_id=excluded.worker_version_id,
  reference_label=excluded.reference_label,
  metadata_root=excluded.metadata_root,
  classifier_format=excluded.classifier_format,
  classifier_version=excluded.classifier_version,
  classifier_source=excluded.classifier_source;`;
}

function wranglerArgs(base, wrangler) {
  const args = [...base, '--config', wrangler.config_path];
  if (wrangler.environment) args.push('--env', wrangler.environment);
  return args;
}

export function persistMerkleSnapshotCloudflare({
  snapshotPath,
  snapshot,
  plan,
  wranglerBin = process.env.WRANGLER_BIN || 'wrangler',
  r2Only = false,
  dryRun = false,
} = {}) {
  const filename = path.resolve(snapshotPath);
  if (!fs.existsSync(filename)) throw new Error('snapshot_file_not_found');
  const result = {
    provider: 'cloudflare',
    binding: plan.wrangler.r2_binding,
    storage_bucket: plan.row.storage_bucket,
    storage_key: plan.row.storage_key,
    database_binding: plan.wrangler.d1_binding,
    database_name: plan.wrangler.database_name,
    table: r2Only ? null : MERKLE_SNAPSHOT_TABLE,
    snapshot_id: plan.row.snapshot_id,
    row: plan.row,
    dry_run: Boolean(dryRun),
  };
  if (dryRun) return result;

  const object = `${plan.row.storage_bucket}/${plan.row.storage_key}`;
  execFileSync(wranglerBin, wranglerArgs(['r2', 'object', 'put', object, '--file', filename, '--remote'], plan.wrangler), {
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
  });
  if (r2Only) return result;

  const tmp = path.join(os.tmpdir(), `agentsam-merkle-persist-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(tmp, `${merklePersistenceUpsertSql(plan.row)}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    execFileSync(wranglerBin, wranglerArgs(['d1', 'execute', plan.wrangler.database_name, '--remote', '--yes', `--file=${tmp}`], plan.wrangler), {
      stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
    });
  } catch (error) {
    try {
      execFileSync(wranglerBin, wranglerArgs(['r2', 'object', 'delete', object, '--remote'], plan.wrangler), {
        stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
      });
    } catch {}
    throw error;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return result;
}
