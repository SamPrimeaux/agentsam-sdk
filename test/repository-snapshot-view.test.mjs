import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRepositorySnapshotFacets,
  projectRepositorySnapshot,
  repositoryFileMatches,
} from '../src/capabilities/repository-snapshot-view.js';

function snapshot() {
  return {
    schema_version: 1,
    capability: 'repository.snapshot',
    snapshot_id: 'rsnap_0123456789abcdef01234567',
    created_at: '2026-09-11T00:00:00.000Z',
    content_hash: `sha256:${'1'.repeat(64)}`,
    repository: { full_name: 'SamPrimeaux/agentsam-sdk', branch: 'main', revision_sha: 'abc123', dirty: false },
    tree: {
      merkle_root: `sha256:${'2'.repeat(64)}`,
      metadata_root: `sha256:${'3'.repeat(64)}`,
      manifest: { format: 'agentsam-merkle', version: 1, hash_algorithm: 'sha256', policy_hash: `sha256:${'4'.repeat(64)}` },
      classifier: { format: 'agentsam-filemeta', version: 1, source: 'path+package+ast' },
      stats: { files: 4, directories: 3, symlinks: 0, bytes: 1000 },
      semantic_stats: { entries: 4, files: 4, packages: 2, ast_indexed: 4 },
      paths: ['packages/identity/src/core/accounts.js', 'packages/identity/src/oauth/login.js', 'apps/cms/src/editor.tsx', 'apps/cms/src/assets.ts'],
      files: [
        {
          path: 'packages/identity/src/core/accounts.js', type: 'file', size: 213, mode: 420, hash: `sha256:${'a'.repeat(64)}`,
          package: '@inneranimalmedia/agentsam-sdk-identity', package_root: 'packages/identity', system: 'identity',
          category: 'accounts', layer: 'core', kind: 'source', language: 'javascript', role: 'business-logic',
          tags: ['account-scoped', 'authentication'], symbols: ['accountLinkingNotConfigured'], imports: [],
        },
        {
          path: 'packages/identity/src/oauth/login.js', type: 'file', size: 300, mode: 420, hash: `sha256:${'b'.repeat(64)}`,
          package: '@inneranimalmedia/agentsam-sdk-identity', package_root: 'packages/identity', system: 'identity',
          category: 'login', layer: 'oauth', kind: 'source', language: 'javascript', role: 'business-logic',
          tags: ['authentication'], symbols: ['login'], imports: ['./accounts.js'],
        },
        {
          path: 'apps/cms/src/editor.tsx', type: 'file', size: 250, mode: 420, hash: `sha256:${'c'.repeat(64)}`,
          package: '@inneranimalmedia/cms', package_root: 'apps/cms', system: 'cms-frontend', category: 'editor', layer: 'ui',
          kind: 'source', language: 'typescript', role: 'ui', tags: ['cms'], symbols: ['CmsEditor'], imports: ['react'],
        },
        {
          path: 'apps/cms/src/assets.ts', type: 'file', size: 237, mode: 420, hash: `sha256:${'d'.repeat(64)}`,
          package: '@inneranimalmedia/cms', package_root: 'apps/cms', system: 'cms-frontend', category: 'assets', layer: 'data',
          kind: 'source', language: 'typescript', role: 'business-logic', tags: ['cms', 'assets'], symbols: ['loadAsset'], imports: [],
        },
      ],
    },
    intelligence: { summary: { file_count: 4 } },
    packages: [], knowledge: { configured: false }, deploy: null,
  };
}

test('repository snapshot index is bounded and preserves the three canonical identities', () => {
  const full = snapshot();
  const view = projectRepositorySnapshot(full, { view: 'index' });
  assert.equal(view.snapshot_id, full.snapshot_id);
  assert.equal(view.content_hash, full.content_hash);
  assert.equal(view.tree.merkle_root, full.tree.merkle_root);
  assert.equal(view.tree.metadata_root, full.tree.metadata_root);
  assert.equal(view.tree.manifest.policy_hash, full.tree.manifest.policy_hash);
  assert.equal(view.files, undefined);
  assert.equal(view.projection.matched, 4);
  assert.match(view.projection.projection_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(view.tree.paths, undefined);
  assert.equal(view.tree.files, undefined);
});

test('repository snapshot files view filters semantics before bounding output', () => {
  const full = snapshot();
  const view = projectRepositorySnapshot(full, {
    view: 'files',
    filters: { system: ['identity'], tag: ['authentication'], category: ['accounts'] },
    limit: 1,
  });
  assert.equal(view.projection.matched, 1);
  assert.equal(view.projection.returned, 1);
  assert.equal(view.projection.truncated, false);
  assert.deepEqual(view.files.map((entry) => entry.path), ['packages/identity/src/core/accounts.js']);
  assert.equal(view.files[0].hash, undefined);
  assert.equal(view.files[0].mode, undefined);
});

test('path globs, AST selectors, and facet counts are deterministic', () => {
  const full = snapshot();
  const files = full.tree.files;
  assert.equal(repositoryFileMatches(files[2], { path: ['apps/cms/**'], symbol: ['CmsEditor'] }), true);
  assert.equal(repositoryFileMatches(files[2], { import: ['react'], language: ['javascript'] }), false);
  const facets = buildRepositorySnapshotFacets(files);
  assert.deepEqual(facets.systems.slice(0, 2), [
    { value: 'cms-frontend', count: 2 },
    { value: 'identity', count: 2 },
  ]);
  assert.deepEqual(facets.tags.find((row) => row.value === 'authentication'), { value: 'authentication', count: 2 });
});
