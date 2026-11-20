import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listAccountLibraryResources,
  serveAccountLibraryFile,
  mutateAccountLibraryArtifact,
} from './work-library-resources.js';

function dbHarness({ rows = {}, fileRow = null, existingRow = null, runResult = { meta: { changes: 1 } } } = {}) {
  const calls = [];
  const DB = {
    prepare(sql) {
      const call = { sql, values: [] };
      calls.push(call);
      return {
        bind(...values) {
          call.values = values;
          return {
            async all() {
              if (sql.includes('FROM agentsam_artifacts')) return { results: rows.artifacts || [] };
              if (sql.includes('FROM cms_assets')) return { results: rows.cmsAssets || [] };
              if (sql.includes('FROM media_assets')) return { results: rows.media || [] };
              if (sql.includes('FROM cms_artifacts')) return { results: rows.cmsArtifacts || [] };
              return { results: [] };
            },
            async first() {
              if (sql.includes('SELECT r2_bucket')) return fileRow;
              if (sql.includes('SELECT id FROM agentsam_artifacts')) return existingRow;
              return null;
            },
            async run() { return runResult; },
          };
        },
      };
    },
  };
  return { DB, calls };
}

const artifactRow = (overrides = {}) => ({
  id: 'art_1', name: 'DreamHouse.glb', artifact_type: 'cad-scene', mime_type: 'model/gltf-binary',
  file_size_bytes: 2048, updated_at: 1762500000, thumbnail_r2_key: 'thumbs/dreamhouse.webp',
  preview_r2_key: null, public_url: 'https://public.example/private.glb', thumbnail_url: null,
  preview_url: null, is_public: 0, archived_at: null, metadata_json: '{"library":{"starred":true}}',
  r2_bucket: 'cad', r2_key: 'users/owner_1/dreamhouse.glb', ...overrides,
});

test('account Library aggregates only owner-scoped source records and preserves provider identity', async () => {
  const h = dbHarness({ rows: {
    artifacts: [artifactRow()],
    cmsAssets: [{ id: 'cms_1', filename: 'logo.png', label: 'Logo', mime_type: 'image/png', category: 'brand', size: 1024,
      thumbnail_url: '/api/cms/assets/cms_1/thumbnail', public_url: 'https://cdn.example/logo.png', updated_at: 1762500000, site_name: 'InnerAnimalMedia' }],
    media: [{ id: 'media_1', filename: 'launch.mp4', media_kind: 'video', content_type: 'video/mp4', size_bytes: 4096,
      provider: 'cloudflare_stream', source_uri: 'https://customer.cloudflarestream.com/uid/manifest/video.m3u8',
      provider_resource_id: 'stream_uid_1', updated_at: 1762500000, status: 'ready', duration_ms: 3000 }],
    cmsArtifacts: [{ id: 'cms_art_1', artifact_key: 'home-page', artifact_type: 'page-build', content_mode: 'bundle',
      created_at: '2026-11-20 09:00:00', version: '1', status: 'ready', metadata_json: '{}' }],
  } });

  const items = await listAccountLibraryResources(h.DB, 'owner_1');
  assert.equal(items.length, 4);
  assert.equal(items[0].id, 'artifact:art_1');
  assert.equal(items[0].kind, 'model');
  assert.equal(items[0].open, '/api/work/library/artifacts/art_1/file');
  assert.equal(items[0].preview, '/api/work/library/artifacts/art_1/file?preview=1');
  assert.equal(items[0].starred, true);
  assert.equal(items[1].open, 'https://cdn.example/logo.png');
  assert.equal(items[1].sourceLabel, 'CMS · InnerAnimalMedia');
  assert.equal(items[2].source, 'stream');
  assert.equal(items[2].providerId, 'stream_uid_1');
  assert.equal(items[3].resourceType, 'cms-artifact');
  assert.equal(items[3].open, null);
  assert.equal(h.calls.length, 4);
  assert.ok(h.calls.every(call => call.values.length === 1 && call.values[0] === 'owner_1'));
});

test('archived and unsafe external resources retain safe state without unsafe navigation', async () => {
  const h = dbHarness({ rows: {
    artifacts: [artifactRow({ archived_at: 1762500000, is_public: 1, public_url: 'javascript:alert(1)' })],
    cmsAssets: [{ id: 'cms_bad', filename: 'bad.png', label: 'Bad image', mime_type: 'image/png', category: 'brand', size: 1,
      thumbnail_url: '/\\evil.example/image.png', public_url: 'javascript:alert(1)', updated_at: 1762500000, site_name: 'Test' }],
  } });
  const items = await listAccountLibraryResources(h.DB, 'owner_1');
  assert.equal(items[0].deleted, true);
  assert.equal(items[0].open, '/api/work/library/artifacts/art_1/file');
  assert.equal(items[1].open, null);
  assert.equal(items[1].preview, null);
});

test('private artifact delivery is owner-scoped and supports every registered R2 bucket', async () => {
  const bindings = [
    ['artifacts', 'ARTIFACTS'],
    ['inneranimalmedia-autorag', 'AUTORAG_BUCKET'],
    ['cms', 'CMS_CONTENT'],
    ['cad', 'CAD_PROJECT_ASSETS'],
    ['inneranimalmedia', 'INNERANIMALMEDIA_ASSETS'],
    ['cajunengravincompany', 'CAJUNENGRAVINCOMPANY_ASSETS'],
  ];
  for (const [bucketName, bindingName] of bindings) {
    const reads = [];
    const bucket = { async get(key) {
      reads.push(key);
      return { body: new Blob(['private payload']).stream(), httpMetadata: { contentType: 'application/pdf' } };
    } };
    const h = dbHarness({ fileRow: { r2_bucket: bucketName, r2_key: 'private/file.pdf', mime_type: 'application/pdf', name: 'file.pdf' } });
    const response = await serveAccountLibraryFile({ DB: h.DB, [bindingName]: bucket }, 'owner_1', 'art_1');
    assert.equal(response.status, 200, bucketName);
    assert.equal(await response.text(), 'private payload', bucketName);
    assert.deepEqual(reads, ['private/file.pdf'], bucketName);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('content-disposition'), 'inline; filename="file.pdf"');
    assert.deepEqual(h.calls[0].values, ['art_1', 'owner_1']);
  }
});

test('preview delivery prefers the thumbnail key and missing or cross-owner artifacts return 404', async () => {
  const reads = [];
  const bucket = { async get(key) {
    reads.push(key);
    return { body: new Blob(['preview']).stream(), httpMetadata: { contentType: 'image/webp' } };
  } };
  const h = dbHarness({ fileRow: { r2_bucket: 'artifacts', r2_key: 'original.json', thumbnail_r2_key: 'thumb.webp', mime_type: 'application/json', name: 'preview.webp' } });
  const response = await serveAccountLibraryFile({ DB: h.DB, ARTIFACTS: bucket }, 'owner_1', 'art_1', true);
  assert.equal(response.status, 200);
  assert.deepEqual(reads, ['thumb.webp']);
  assert.equal(response.headers.get('content-type'), 'image/webp');

  const missing = dbHarness({ fileRow: null });
  const denied = await serveAccountLibraryFile({ DB: missing.DB, ARTIFACTS: bucket }, 'other_owner', 'art_1');
  assert.equal(denied.status, 404);
  assert.equal(reads.length, 1);
});

test('artifact mutations validate fields and always constrain writes by owner', async () => {
  const h = dbHarness({ existingRow: { id: 'art_1' } });
  const request = new Request('https://studio.example/api/work/library/artifacts/art_1', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Renamed', starred: true, archived: true }),
  });
  const response = await mutateAccountLibraryArtifact(request, { DB: h.DB }, 'owner_1', 'art_1');
  assert.equal(response.status, 200);
  const update = h.calls.find(call => call.sql.startsWith('UPDATE'));
  assert.match(update.sql, /WHERE id=\? AND user_id=\?/);
  assert.deepEqual(update.values, ['Renamed', 'true', 'art_1', 'owner_1']);

  const invalidHarness = dbHarness({ existingRow: { id: 'art_1' } });
  const invalid = await mutateAccountLibraryArtifact(new Request('https://studio.example/', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ r2_key: 'other' }),
  }), { DB: invalidHarness.DB }, 'owner_1', 'art_1');
  assert.equal(invalid.status, 400);
  assert.equal(invalidHarness.calls.some(call => call.sql.startsWith('UPDATE')), false);

  const otherOwner = dbHarness({ existingRow: null });
  const notFound = await mutateAccountLibraryArtifact(new Request('https://studio.example/', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ starred: true }),
  }), { DB: otherOwner.DB }, 'other_owner', 'art_1');
  assert.equal(notFound.status, 404);
});
