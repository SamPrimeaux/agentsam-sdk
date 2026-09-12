export const MERKLE_SNAPSHOT_TABLE = 'agentsam_fs_merkle_snapshots';
export const MERKLE_SNAPSHOT_STORAGE_PREFIX = 'agentsam_fs_merkle_snapshots';
export const MERKLE_WEBSITE_ASSETS_BINDING = 'WEBSITE_ASSETS';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function safeSegment(value, name) {
  const segment = clean(value);
  if (!segment) throw new Error(`${name}_required`);
  if (segment === '.' || segment === '..' || /[\u0000-\u001f\u007f]/.test(segment)) {
    throw new Error(`${name}_invalid`);
  }
  return encodeURIComponent(segment);
}

export function normalizeMerkleStoragePrefix(value = MERKLE_SNAPSHOT_STORAGE_PREFIX) {
  const prefix = clean(value || MERKLE_SNAPSHOT_STORAGE_PREFIX).replace(/^\/+|\/+$/g, '');
  if (!prefix || prefix.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('merkle_storage_prefix_invalid');
  }
  return prefix;
}

/**
 * Provider-neutral object key. The host chooses which physical bucket is bound
 * to the logical WEBSITE_ASSETS role; the SDK never owns cloud credentials.
 */
export const MERKLE_PERSISTENCE_SCHEMA_VERSION = 2;

export function merkleSnapshotStorageKey({ accountId, repositoryId, snapshotId, prefix = MERKLE_SNAPSHOT_STORAGE_PREFIX } = {}) {
  return `${normalizeMerkleStoragePrefix(prefix)}/${safeSegment(accountId, 'account_id')}/${safeSegment(repositoryId, 'repository_id')}/${safeSegment(snapshotId, 'snapshot_id')}.json`;
}

/** Portable D1/SQLite schema for hosts that opt into persisted Merkle snapshots. */
export const MERKLE_SNAPSHOT_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS ${MERKLE_SNAPSHOT_TABLE} (
  snapshot_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  repository TEXT,
  source TEXT NOT NULL CHECK (source IN ('github','gitlab','bitbucket','local','upload')),
  manifest_format TEXT NOT NULL DEFAULT 'agentsam-merkle',
  manifest_version INTEGER NOT NULL DEFAULT 1,
  hash_algorithm TEXT NOT NULL DEFAULT 'sha256',
  root_hash TEXT NOT NULL,
  policy_hash TEXT,
  resolved_commit_sha TEXT,
  resolved_tree_sha TEXT,
  git_branch TEXT,
  working_tree_dirty INTEGER NOT NULL DEFAULT 0,
  connection_id TEXT,
  runtime_lease_id TEXT,
  storage_backend TEXT NOT NULL DEFAULT 'r2' CHECK (storage_backend IN ('r2','local_fs','inline','none')),
  storage_bucket TEXT,
  storage_key TEXT,
  entry_count INTEGER,
  file_count INTEGER,
  directory_count INTEGER,
  symlink_count INTEGER,
  total_bytes INTEGER,
  capture_kind TEXT NOT NULL DEFAULT 'manual' CHECK (capture_kind IN ('deploy','manual','agent','index')),
  deployment_id TEXT,
  worker_version_id TEXT,
  reference_label TEXT,
  created_at INTEGER NOT NULL,
  persisted_at INTEGER,
  metadata_root TEXT,
  classifier_format TEXT,
  classifier_version INTEGER,
  classifier_source TEXT,
  CHECK (storage_backend IN ('inline','none') OR (storage_bucket IS NOT NULL AND storage_key IS NOT NULL)),
  CHECK (connection_id IS NOT NULL OR runtime_lease_id IS NOT NULL OR capture_kind = 'deploy')
);`;
