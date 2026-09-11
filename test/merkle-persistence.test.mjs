import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MERKLE_SNAPSHOT_SCHEMA_SQL,
  MERKLE_SNAPSHOT_STORAGE_PREFIX,
  MERKLE_SNAPSHOT_TABLE,
  MERKLE_WEBSITE_ASSETS_BINDING,
  merkleSnapshotStorageKey,
} from '../src/lib/merkle/index.js';

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
    ownerUserId: 'au_example',
    repoId: 'github:owner/repo',
    snapshotId: 'mrs_example',
  });
  assert.equal(key, 'agentsam_fs_merkle_snapshots/au_example/github%3Aowner%2Frepo/mrs_example.json');
  const escaped = merkleSnapshotStorageKey({ ownerUserId: '../oops', repoId: 'repo', snapshotId: 'snap' });
  assert.ok(!escaped.includes('/../'));
  assert.ok(escaped.includes('..%2Foops'));
});
