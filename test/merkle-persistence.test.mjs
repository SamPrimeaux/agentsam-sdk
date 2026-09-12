import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MERKLE_SNAPSHOT_SCHEMA_SQL,
  MERKLE_SNAPSHOT_STORAGE_PREFIX,
  MERKLE_SNAPSHOT_TABLE,
  MERKLE_WEBSITE_ASSETS_BINDING,
  buildMerklePersistencePlan,
  merklePersistenceUpsertSql,
  merkleSnapshotStorageKey,
  resolveWranglerMerklePersistence,
} from '../src/lib/merkle/index.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('portable Merkle persistence names one table, prefix, and logical asset role', () => {
  assert.equal(MERKLE_SNAPSHOT_TABLE, 'agentsam_fs_merkle_snapshots');
  assert.equal(MERKLE_SNAPSHOT_STORAGE_PREFIX, 'agentsam_fs_merkle_snapshots');
  assert.equal(MERKLE_WEBSITE_ASSETS_BINDING, 'WEBSITE_ASSETS');
  assert.match(MERKLE_SNAPSHOT_SCHEMA_SQL, /metadata_root TEXT/);
  assert.match(MERKLE_SNAPSHOT_SCHEMA_SQL, /classifier_format TEXT/);
  assert.match(MERKLE_SNAPSHOT_SCHEMA_SQL, /storage_bucket TEXT/);
});

test('snapshot storage keys stay beneath the canonical prefix and encode repo identity', () => {
  const key = merkleSnapshotStorageKey({
    accountId: 'au_example',
    repositoryId: 'github:owner/repo',
    snapshotId: 'mrs_example',
  });
  assert.equal(key, 'agentsam_fs_merkle_snapshots/au_example/github%3Aowner%2Frepo/mrs_example.json');
  const escaped = merkleSnapshotStorageKey({ accountId: '../oops', repositoryId: 'repo', snapshotId: 'snap' });
  assert.ok(!escaped.includes('/../'));
  assert.ok(escaped.includes('..%2Foops'));
});

test('Wrangler persistence resolves logical WEBSITE_ASSETS and DB bindings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-wrangler-'));
  const config = path.join(dir, 'wrangler.toml');
  fs.writeFileSync(config, `name = "fixture"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "fixture-db"\ndatabase_id = "db-id"\n\n[[r2_buckets]]\nbinding = "WEBSITE_ASSETS"\nbucket_name = "fixture-assets"\n`);
  try {
    const resolved = resolveWranglerMerklePersistence({ configPath: config });
    assert.equal(resolved.r2_binding, 'WEBSITE_ASSETS');
    assert.equal(resolved.storage_bucket, 'fixture-assets');
    assert.equal(resolved.d1_binding, 'DB');
    assert.equal(resolved.database_name, 'fixture-db');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('persistence plan keeps content, policy, and metadata identities separate', () => {
  const snapshot = {
    format: 'agentsam-merkle', version: 1, algorithm: 'sha256',
    rootHash: `sha256:${'1'.repeat(64)}`,
    policyHash: `sha256:${'2'.repeat(64)}`,
    entries: [{ path: 'src/a.js', type: 'file', size: 10, hash: `sha256:${'4'.repeat(64)}` }],
    stats: { files: 1, directories: 1, symlinks: 0, bytes: 10 },
    semantic: {
      format: 'agentsam-filemeta', version: 1, rootHash: `sha256:${'3'.repeat(64)}`,
      classifier: { format: 'agentsam-filemeta', version: 1, source: 'path+package+ast' }, entries: [],
    },
  };
  const plan = buildMerklePersistencePlan({
    snapshot, root: process.cwd(), accountId: 'au_test', repositoryId: 'github:owner/repo', source: 'github',
    captureKind: 'agent', connectionId: 'conn_test',
    wrangler: { storage_bucket: 'customer-assets', r2_binding: 'WEBSITE_ASSETS', database_name: 'customer-db', d1_binding: 'DB' },
  });
  assert.equal(plan.row.root_hash, snapshot.rootHash);
  assert.equal(plan.row.policy_hash, snapshot.policyHash);
  assert.equal(plan.row.metadata_root, snapshot.semantic.rootHash);
  assert.equal(plan.row.classifier_format, 'agentsam-filemeta');
  assert.equal(plan.row.storage_bucket, 'customer-assets');
  assert.match(plan.row.storage_key, /^agentsam_fs_merkle_snapshots\//);
  const sql = merklePersistenceUpsertSql(plan.row);
  assert.match(sql, /INSERT INTO agentsam_fs_merkle_snapshots/);
  assert.match(sql, /metadata_root/);
  assert.match(sql, /classifier_source/);
});

test('non-deploy persistence requires execution provenance', () => {
  const snapshot = {
    format: 'agentsam-merkle', version: 1, algorithm: 'sha256', rootHash: `sha256:${'1'.repeat(64)}`,
    policyHash: `sha256:${'2'.repeat(64)}`, entries: [], stats: { files: 0, directories: 0, symlinks: 0, bytes: 0 },
  };
  assert.throws(() => buildMerklePersistencePlan({
    snapshot, root: process.cwd(), accountId: 'au_test', repositoryId: 'github:owner/repo', captureKind: 'agent',
    wrangler: { storage_bucket: 'customer-assets', r2_binding: 'WEBSITE_ASSETS', database_name: 'customer-db', d1_binding: 'DB' },
  }), /execution_provenance_required/);
});
