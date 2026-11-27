import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { handleStudioContentMediaApi, resolveCloudflareProductMediaReference } from './content-media-api.js';

const origin = 'https://agentsam.example';
const principal = { id: 'au_media_account_a' };
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});
const parseJson = (response) => response.json();

function provider(handler) {
  const calls = [];
  return {
    calls,
    IAM_API: {
      async fetch(request) {
        calls.push(request.clone());
        return handler(request);
      },
    },
  };
}

function mediaRequest(path, { method = 'GET', headers = {}, body } = {}) {
  return new Request(new URL(path, origin), { method, headers, body });
}

test('non-media paths are left to the normal Ecommerce API router', async () => {
  const response = await handleStudioContentMediaApi(mediaRequest('/api/admin/products'), {}, principal);
  assert.equal(response, null);
});

test('media requests require the already-authenticated Local Studio principal', async () => {
  const env = provider(() => jsonResponse({ ok: true }));
  const response = await handleStudioContentMediaApi(mediaRequest('/api/admin/media'), env, null);
  assert.equal(response.status, 401);
  assert.equal((await parseJson(response)).error, 'authentication_required');
  assert.equal(env.calls.length, 0);
});

test('explicit InnerAnimalMedia provider still proxies image inventory through IAM_API', async () => {
  const env = provider((upstream) => {
    const url = new URL(upstream.url);
    assert.equal(url.origin, 'https://inneranimalmedia.com');
    assert.equal(url.pathname, '/api/images');
    assert.equal(url.searchParams.get('source'), 'cf_images');
    assert.equal(url.searchParams.get('page'), '2');
    assert.equal(url.searchParams.get('per_page'), '7');
    assert.equal(url.searchParams.get('q'), 'hero');
    assert.equal(url.searchParams.get('workspace_id'), 'ws_media_demo');
    assert.equal(url.searchParams.get('tenant_id'), 'tenant_media_demo');
    assert.equal(url.searchParams.get('r2_bucket'), 'inneranimalmedia');
    assert.equal(upstream.headers.get('cookie'), 'iam_session=account-session');
    assert.equal(upstream.headers.get('authorization'), 'Bearer session-token');
    assert.equal(upstream.headers.get('origin'), origin);
    return jsonResponse({
      ok: true,
      items: [{ id: 'img_hero', filename: 'hero.png', mime_type: 'image/png', size_bytes: 42, url: 'https://inneranimalmedia.com/media/hero.png', tags: ['brand'] }],
      total: 1,
      r2_buckets: [{ name: 'inneranimalmedia' }],
      r2_bucket: 'inneranimalmedia',
    });
  });
  const request = mediaRequest('/api/admin/media?provider=inneranimalmedia&source=cf_images&page=2&page_size=7&q=hero&workspace_id=ws_media_demo&tenant_id=tenant_media_demo&r2_bucket=inneranimalmedia', {
    headers: {
      cookie: 'iam_session=account-session',
      authorization: 'Bearer session-token',
      origin,
    },
  });
  const response = await handleStudioContentMediaApi(request, env, principal);
  const data = await parseJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.assets.length, 1);
  assert.equal(data.assets[0].id, 'img_hero');
  assert.equal(data.assets[0].content_type, 'image/png');
  assert.deepEqual(data.assets[0].tags, ['brand']);
  assert.equal(data.r2_buckets[0].bucket_name, 'inneranimalmedia');
  assert.equal(data.pagination.page, 2);
  assert.equal(env.calls.length, 1);
});

test('explicit InnerAnimalMedia provider video inventory uses Stream via IAM_API', async () => {
  const env = provider((upstream) => {
    const url = new URL(upstream.url);
    assert.equal(url.pathname, '/api/stream/videos');
    assert.equal(url.searchParams.get('limit'), '100');
    assert.equal(url.searchParams.get('workspace_id'), 'ws_video_demo');
    return jsonResponse({
      videos: [{ uid: 'stream_uid_1', thumbnail: 'https://images.example/thumb.jpg', hls: 'https://video.example/master.m3u8', duration: 12.5, ready: true }],
      total: 1,
    });
  });
  const response = await handleStudioContentMediaApi(mediaRequest('/api/admin/media?provider=inneranimalmedia&kind=video&workspace_id=ws_video_demo'), env, principal);
  const data = await parseJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.source, 'stream');
  assert.equal(data.counts.videos, 1);
  assert.equal(data.assets[0].source, 'stream');
  assert.equal(data.assets[0].folder, 'videos');
  assert.equal(data.assets[0].duration_ms, 12500);
});

test('#419 default Cloudflare gallery never calls IAM_API when OAuth client is available', async () => {
  const env = {
    // Intentionally no IAM_API binding.
    __agentsamTestCfClient: {
      accountId: 'acct_user_owned',
      connectionId: 'conn_user',
      authSource: 'oauth',
      requireAccount() {},
      accountPath(suffix) {
        return `/accounts/acct_user_owned${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
      },
      async request(method, path) {
        assert.equal(method, 'GET');
        assert.match(path, /\/images\/v2/);
        return {
          result: {
            images: [{
              id: 'cfimg_great_room',
              filename: 'great-room.png',
              size: 2048,
              uploaded: '2026-10-01T00:00:00.000Z',
              variants: ['https://imagedelivery.net/hash/cfimg_great_room/public'],
              requireSignedURLs: true,
            }],
          },
          result_info: { count: 1, page: 1 },
        };
      },
    },
  };
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media?provider=cloudflare&source=cf_images&per_page=24'),
    env,
    principal,
  );
  const data = await parseJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.capabilities.provider_api, 'cloudflare_oauth');
  assert.equal(data.assets.length, 1);
  assert.equal(data.assets[0].cloudflare_image_id, 'cfimg_great_room');
  assert.deepEqual(data.assets[0].meta.variants, ['https://imagedelivery.net/hash/cfimg_great_room/public']);
  assert.equal(data.assets[0].meta.require_signed_urls, true);
  assert.equal(data.account.id, 'acct_user_owned');
  assert.equal(data.source, 'cf_images');
});

test('Cloudflare image listing accepts a read-only grant and rejects grants without image read access', async () => {
  let requests = 0;
  const client = {
    accountId: 'acct_user_owned', authSource: 'oauth', grantedScopes: ['images.read'],
    requireAccount() {},
    accountPath(suffix) { return '/accounts/acct_user_owned' + suffix; },
    async request(method, path) {
      requests++;
      assert.equal(method, 'GET');
      assert.match(path, /images\/v2/);
      return { result: { images: [] }, result_info: { count: 0 } };
    },
  };
  const env = { __agentsamTestCfClient: client };
  const request = mediaRequest('/api/admin/media?provider=cloudflare&source=cf_images');
  const allowed = await handleStudioContentMediaApi(request, env, principal);
  assert.equal(allowed.status, 200);
  assert.equal(requests, 1);
  client.grantedScopes = ['stream.read'];
  const denied = await handleStudioContentMediaApi(request, env, principal);
  assert.equal(denied.status, 403);
  assert.deepEqual((await denied.json()).missing_scopes, ['images.read']);
  assert.equal(requests, 1);
});

test('#419 Stream gallery works without IAM_API via user OAuth client', async () => {
  const env = {
    __agentsamTestCfClient: {
      accountId: 'acct_user_owned',
      connectionId: 'conn_user',
      authSource: 'oauth',
      requireAccount() {},
      accountPath(suffix) {
        return `/accounts/acct_user_owned${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
      },
      async request(method, path) {
        assert.equal(method, 'GET');
        assert.match(path, /\/stream\?/);
        return {
          result: [{
            uid: 'stream_abc',
            thumbnail: 'https://customer-x.cloudflarestream.com/stream_abc/thumb.jpg',
            playback: { hls: 'https://customer-x.cloudflarestream.com/stream_abc/manifest/video.m3u8' },
            duration: 8,
            readyToStream: true,
            meta: { name: 'walkthrough.mp4' },
          }],
          result_info: {},
        };
      },
    },
  };
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media?provider=cloudflare&source=stream'),
    env,
    principal,
  );
  const data = await parseJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.capabilities.provider_api, 'cloudflare_oauth');
  assert.equal(data.assets[0].cloudflare_stream_uid, 'stream_abc');
  assert.equal(data.assets[0].filename, 'walkthrough.mp4');
});

test('#419 default gallery without OAuth does not fall back to IAM_API', async () => {
  let iamCalls = 0;
  const env = {
    IAM_API: {
      async fetch() {
        iamCalls += 1;
        return jsonResponse({ ok: true, items: [] });
      },
    },
  };
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media?source=cf_images'),
    env,
    principal,
  );
  const data = await parseJson(response);
  assert.notEqual(response.status, 200);
  assert.equal(iamCalls, 0);
  assert.match(String(data.error || ''), /cloudflare_/);
});

test('explicit InnerAnimalMedia provider uploads retain the source in the canonical R2 bucket', async () => {
  const env = provider(async (upstream) => {
    assert.equal(new URL(upstream.url).pathname, '/api/images/upload');
    assert.equal(new URL(upstream.url).searchParams.get('destination'), 'r2');
    const form = await upstream.formData();
    assert.equal(form.get('r2_bucket'), 'inneranimalmedia');
    assert.equal(form.get('alt_text'), 'Workshop model');
    assert.deepEqual(JSON.parse(form.get('tags')), ['project', 'models', 'derived', '3d']);
    assert.equal(form.get('file').name, 'workshop.glb');
    return jsonResponse({ ok: true, item: { id: 'asset_workshop', filename: 'workshop.glb', mime_type: 'model/gltf-binary', r2_bucket: 'inneranimalmedia', r2_key: 'models/workshop.glb' } });
  });
  const form = new FormData();
  form.set('file', new File(['glb-bytes'], 'workshop.glb', { type: 'model/gltf-binary' }));
  form.set('derivative_role', 'original');
  form.set('folder', 'models');
  form.set('source_media_asset_id', 'source_original_1');
  form.set('tags', JSON.stringify(['project']));
  form.set('alt_text', 'Workshop model');
  const request = mediaRequest('/api/admin/media?provider=inneranimalmedia', { method: 'POST', body: form, headers: { cookie: 'iam_session=account-session', origin } });
  const response = await handleStudioContentMediaApi(request, env, principal);
  const data = await parseJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.original_preserved, true);
  assert.equal(data.uploaded_count, 1);
  assert.equal(data.assets[0].r2_key, 'models/workshop.glb');
  assert.equal(data.provider_api, 'inneranimalmedia');
});

test('Cloudflare Images uploads return provider-native IDs without mirroring inventory into D1', async () => {
  const calls = [];
  const env = {
    DB: { prepare() { throw new Error('upload must not write media_assets'); } },
    __agentsamTestCfClient: {
      accountId: 'acct_user_owned',
      connectionId: 'conn_user',
      authSource: 'oauth',
      requireAccount() {},
      accountPath(suffix) {
        return `/accounts/acct_user_owned${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
      },
      async request(method, path, opts = {}) {
        calls.push({ method, path, hasForm: opts.body instanceof FormData });
        assert.equal(method, 'POST');
        assert.match(path, /\/images\/v1$/);
        return {
          result: {
            id: 'cfimg_upload_1',
            filename: 'hero.png',
            size: 12,
            variants: ['https://imagedelivery.net/hash/cfimg_upload_1/public'],
            meta: { tags: 'brand' },
          },
        };
      },
    },
  };
  const form = new FormData();
  form.set('file', new File(['png-bytes'], 'hero.png', { type: 'image/png' }));
  form.set('tags', JSON.stringify(['brand']));
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media?provider=cloudflare', { method: 'POST', body: form }),
    env,
    principal,
  );
  const data = await parseJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.provider_api, 'cloudflare_oauth');
  assert.equal(data.assets[0].id, 'cfimg_upload_1');
  assert.equal(data.assets[0].cloudflare_image_id, 'cfimg_upload_1');
  assert.equal(data.assets[0].provider, 'cloudflare_images');
  assert.equal(data.assets[0].provider_account_id, 'acct_user_owned');
  assert.equal(data.assets[0].provider_resource_id, 'cfimg_upload_1');
  assert.equal(Object.hasOwn(data.assets[0], 'media_asset_id'), false);
  assert.equal(calls.length, 1);
});

test('Google Drive listing uses the selected user OAuth account and native file IDs', async () => {
  const calls = [];
  const connection = { id: 'google_drive:owner@example.com', accountIdentifier: 'owner@example.com', accountLabel: 'Owner Drive' };
  const env = {
    __agentsamTestGoogleDrive: {
      connections: [connection],
      accessToken: 'user-google-token',
      fetch: async (input, init = {}) => {
        calls.push({ url: String(input), headers: new Headers(init.headers || {}) });
        return jsonResponse({
          nextPageToken: 'next-drive-page',
          files: [{ id: 'drive-file-1', name: 'brand-mark.png', mimeType: 'image/png', size: '512',
            createdTime: '2026-11-24T10:00:00Z', modifiedTime: '2026-11-24T11:00:00Z',
            thumbnailLink: 'https://lh3.googleusercontent.com/drive-thumbnail' }],
        });
      },
    },
  };
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media?source=drive&connection_id=google_drive%3Aowner%40example.com&page=1&per_page=25&kind=image&q=brand'),
    env,
    principal,
  );
  const data = await parseJson(response);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.get('authorization'), 'Bearer user-google-token');
  const requestUrl = new URL(calls[0].url);
  assert.equal(requestUrl.origin, 'https://www.googleapis.com');
  assert.equal(requestUrl.pathname, '/drive/v3/files');
  assert.match(requestUrl.searchParams.get('q'), /mimeType contains 'image\/'/);
  assert.match(requestUrl.searchParams.get('q'), /name contains 'brand'/);
  assert.equal(data.provider_api, 'google_drive_oauth');
  assert.equal(data.account.connection_id, connection.id);
  assert.equal(data.assets[0].provider_resource_id, 'drive-file-1');
  assert.equal(data.assets[0].provider_account_id, 'owner@example.com');
  assert.equal(data.assets[0].thumbnail_url, 'https://lh3.googleusercontent.com/drive-thumbnail');
  assert.equal(data.pagination.cursor, 'next-drive-page');
});

test('Google Drive never guesses between multiple connected accounts', async () => {
  let fetched = false;
  const env = { __agentsamTestGoogleDrive: {
    connections: [
      { id: 'google_drive:one@example.com', accountIdentifier: 'one@example.com', accountLabel: 'One' },
      { id: 'google_drive:two@example.com', accountIdentifier: 'two@example.com', accountLabel: 'Two' },
    ],
    fetch: async () => { fetched = true; return jsonResponse({ files: [] }); },
  } };
  const response = await handleStudioContentMediaApi(mediaRequest('/api/admin/media?source=drive'), env, principal);
  const data = await parseJson(response);
  assert.equal(response.status, 409);
  assert.equal(data.error, 'google_drive_account_selection_required');
  assert.equal(data.accounts.length, 2);
  assert.equal(fetched, false);
});

test('Cloudflare product references are materialized lazily and deduplicated by provider account and native ID', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE media_assets(
    id TEXT PRIMARY KEY, provider TEXT NOT NULL, provider_account_id TEXT, provider_resource_id TEXT,
    source_uri TEXT, filename TEXT, content_type TEXT, media_kind TEXT NOT NULL DEFAULT 'unknown',
    size_bytes INTEGER, width INTEGER, height INTEGER, status TEXT NOT NULL DEFAULT 'registered',
    created_by_user_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}'
  );`);
  db.exec("CREATE UNIQUE INDEX uq_media_assets_provider_resource ON media_assets(provider,provider_account_id,provider_resource_id) WHERE provider_resource_id IS NOT NULL;");
  const env = {
    DB: { prepare(sql) { return { bind(...values) {
      const statement = db.prepare(sql);
      return { async first() { return statement.get(...values) || null; }, async run() { return statement.run(...values); } };
    } }; } },
    __agentsamTestCfClient: {
      accountId: 'acct_user_owned',
      requireAccount() {},
      accountPath(suffix) { return `/accounts/acct_user_owned${suffix}`; },
      async request(method, path) {
        assert.equal(method, 'GET');
        assert.match(path, /cfimg_reference_1$/);
        return { result: { id: 'cfimg_reference_1', filename: 'reference.png', size: 100,
          variants: ['https://imagedelivery.net/hash/cfimg_reference_1/public'] } };
      },
    },
  };
  const input = { provider: 'cloudflare_images', provider_account_id: 'acct_user_owned',
    provider_resource_id: 'cfimg_reference_1', content_type: 'image/png', filename: 'reference.png',
    url: 'https://imagedelivery.net/hash/cfimg_reference_1/public', width: 20, height: 20 };
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media_assets').get().n, 0);
  const first = await resolveCloudflareProductMediaReference(env, principal.id, input);
  const second = await resolveCloudflareProductMediaReference(env, 'user_two', input);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.asset.id, second.asset.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media_assets').get().n, 1);
  const row = db.prepare('SELECT provider,provider_account_id,provider_resource_id,created_by_user_id,status FROM media_assets').get();
  assert.deepEqual({ ...row }, { provider: 'cloudflare_images', provider_account_id: 'acct_user_owned',
    provider_resource_id: 'cfimg_reference_1', created_by_user_id: principal.id, status: 'ready' });
  db.prepare("UPDATE media_assets SET status='deleted' WHERE provider_resource_id=?").run('cfimg_reference_1');
  const restored = await resolveCloudflareProductMediaReference(env, 'user_two', input);
  assert.equal(restored.ok, true);
  assert.equal(db.prepare('SELECT status FROM media_assets').get().status, 'ready');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media_assets').get().n, 1);
  const mismatch = await resolveCloudflareProductMediaReference(env, principal.id, {
    ...input, provider_account_id: 'acct_not_connected',
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, 'cloudflare_account_mismatch');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media_assets').get().n, 1);
  db.close();
});

test('Google Drive read-only scope is required for full account media inventory', async () => {
  const env = { __agentsamTestGoogleDrive: {
    connections: [{ id: 'google_drive:owner@example.com', accountIdentifier: 'owner@example.com', accountLabel: 'Owner Drive' }],
    grantedScopes: ['https://www.googleapis.com/auth/drive.file'],
    fetch: async () => { throw new Error('scope failure must stop before API call'); },
  } };
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media?source=drive&connection_id=google_drive%3Aowner%40example.com'),
    env,
    principal,
  );
  const data = await parseJson(response);
  assert.equal(response.status, 403);
  assert.equal(data.error, 'google_drive_scope_missing');
});


test('#419 R2 upload requires an explicit authorized bucket (no IAM default)', async () => {
  const env = {
    __agentsamTestCfClient: {
      accountId: 'acct_user_owned',
      requireAccount() {},
      accountPath(suffix) { return `/accounts/acct_user_owned${suffix}`; },
      async request() { throw new Error('should_not_upload_without_bucket'); },
    },
  };
  const form = new FormData();
  form.set('file', new File(['glb'], 'workshop.glb', { type: 'model/gltf-binary' }));
  form.set('derivative_role', 'original');
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media?provider=cloudflare', { method: 'POST', body: form }),
    env,
    principal,
  );
  const data = await parseJson(response);
  assert.equal(response.status, 400);
  assert.equal(data.error, 'r2_bucket_required');
});

test('video upload is routed to the explicit Stream direct-upload flow', async () => {
  const env = provider(() => jsonResponse({ ok: true }));
  const form = new FormData();
  form.set('file', new File(['video'], 'walkthrough.mp4', { type: 'video/mp4' }));
  const response = await handleStudioContentMediaApi(mediaRequest('/api/admin/media', { method: 'POST', body: form }), env, principal);
  const data = await parseJson(response);
  assert.equal(response.status, 400);
  assert.equal(data.endpoint, '/api/admin/media/stream/direct-upload');
  assert.equal(env.calls.length, 0);
});

test('explicit InnerAnimalMedia Stream direct-upload still proxies when provider=inneranimalmedia', async () => {
  const env = provider((upstream) => {
    const url = new URL(upstream.url);
    assert.equal(url.pathname, '/api/stream/direct-upload');
    assert.equal(url.searchParams.get('workspace_id'), 'ws_stream_upload');
    assert.equal(url.searchParams.get('tenant_id'), 'tenant_stream_upload');
    assert.equal(upstream.method, 'POST');
    assert.equal(upstream.headers.get('cookie'), 'iam_session=account-session');
    return jsonResponse({ ok: true, uploadURL: 'https://upload.example/stream' }, 201);
  });
  const response = await handleStudioContentMediaApi(mediaRequest('/api/admin/media/stream/direct-upload?provider=inneranimalmedia&workspace_id=ws_stream_upload&tenant_id=tenant_stream_upload', {
    method: 'POST', headers: { cookie: 'iam_session=account-session', origin }, body: '{}',
  }), env, principal);
  const data = await parseJson(response);
  assert.equal(response.status, 201);
  assert.equal(data.uploadURL, 'https://upload.example/stream');
  assert.equal(data.provider_api, 'inneranimalmedia');
});

test('#419 Stream direct-upload uses Cloudflare OAuth without IAM_API', async () => {
  const env = {
    __agentsamTestCfClient: {
      accountId: 'acct_user_owned',
      connectionId: 'conn_user',
      requireAccount() {},
      accountPath(suffix) {
        return `/accounts/acct_user_owned${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
      },
      async request(method, path) {
        assert.equal(method, 'POST');
        assert.match(path, /\/stream\/direct_upload$/);
        return { result: { uid: 'stream_new', uploadURL: 'https://upload.cloudflarestream.com/xyz' } };
      },
    },
  };
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media/stream/direct-upload?provider=cloudflare', {
      method: 'POST',
      body: JSON.stringify({ meta: { name: 'walkthrough.mp4' } }),
      headers: { 'content-type': 'application/json' },
    }),
    env,
    principal,
  );
  const data = await parseJson(response);
  assert.equal(response.status, 201);
  assert.equal(data.provider_api, 'cloudflare_oauth');
  assert.equal(data.uid, 'stream_new');
  assert.equal(data.uploadURL, 'https://upload.cloudflarestream.com/xyz');
});

test('#419 batch delete uses Cloudflare OAuth and never IAM_API', async () => {
  const deleted = [];
  const env = {
    IAM_API: {
      async fetch() {
        throw new Error('IAM must not be called');
      },
    },
    __agentsamTestCfClient: {
      accountId: 'acct_user_owned',
      requireAccount() {},
      accountPath(suffix) {
        return `/accounts/acct_user_owned${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
      },
      async request(method, path) {
        deleted.push({ method, path });
        return { result: {} };
      },
    },
  };
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media/batch?provider=cloudflare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', ids: ['cfimg_1', 'stream_abc'] }),
    }),
    env,
    principal,
  );
  const data = await parseJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.provider_api, 'cloudflare_oauth');
  assert.equal(data.deleted_count, 2);
  assert.equal(deleted.length, 2);
  assert.equal(deleted[0].method, 'DELETE');
});

test('unsupported media editing returns an explicit non-destructive response', async () => {
  const env = provider(() => jsonResponse({ ok: true }));
  const response = await handleStudioContentMediaApi(mediaRequest('/api/admin/media/asset_1/remove-background', { method: 'POST', body: '{}' }), env, principal);
  const data = await parseJson(response);
  assert.equal(response.status, 501);
  assert.equal(data.original_asset_preserved, true);
  assert.equal(env.calls.length, 0);
});

test('explicit InnerAnimalMedia provider with unbound IAM_API returns 503 (no OAuth fallback)', async () => {
  const env = {};
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media?provider=inneranimalmedia&source=cf_images'),
    env,
    principal,
  );
  const data = await parseJson(response);
  assert.equal(response.status, 503);
  assert.equal(data.error, 'iam_media_provider_unavailable');
});

test('default Cloudflare media path with unbound IAM_API never falls back to IAM', async () => {
  const env = { DB: null };
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media?provider=cloudflare&source=cf_images'),
    env,
    principal,
  );
  const data = await parseJson(response);
  assert.notEqual(response.status, 200);
  assert.notEqual(data.error, 'iam_media_provider_unavailable');
  assert.ok(!Object.prototype.hasOwnProperty.call(data, 'provider_api') || data.provider_api !== 'inneranimalmedia');
  assert.match(
    String(data.error || ''),
    /cloudflare|oauth|authorization|credential|token|media_list/i,
  );
});

test('Cloudflare Images metadata editing uses the existing OAuth PATCH and preserves original bytes', async () => {
  const operations = [];
  const env = {
    __agentsamTestCfClient: {
      accountId: 'account_owned',
      requireAccount() {},
      accountPath(suffix) { return '/accounts/account_owned' + suffix; },
      async request(method, path, opts) {
        operations.push({ method, path, opts });
        if (method === 'GET') return {
          result: {
            id: 'brand_asset', filename: 'original.png', size: 734,
            variants: ['https://imagedelivery.net/test/brand_asset/public'],
            meta: { campaign: 'keep-me' },
          },
        };
        if (method === 'PATCH') return {
          result: {
            id: 'brand_asset', filename: 'original.png', size: 734,
            variants: ['https://imagedelivery.net/test/brand_asset/public'],
            meta: opts.body.metadata,
          },
        };
        throw new Error('unexpected_provider_operation');
      },
    },
  };
  const response = await handleStudioContentMediaApi(mediaRequest('/api/admin/media/brand_asset?provider=cloudflare', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ alt_text: 'Accessible description', folder: 'campaigns' }),
  }), env, principal);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.asset.meta.alt_text, 'Accessible description');
  assert.equal(result.asset.meta.folder, 'campaigns');
  assert.equal(result.asset.filename, 'original.png');
  assert.equal(result.asset.size_bytes, 734);
  assert.deepEqual(operations.map(({ method }) => method), ['GET', 'PATCH']);
  assert.equal(operations[1].opts.body.metadata.campaign, 'keep-me');
  assert.equal(operations[1].opts.body.metadata.alt_text, 'Accessible description');
});

test('R2 upload creates collision-resistant object keys without changing existing objects', async () => {
  const keys = [];
  const env = {
    __agentsamTestCfClient: {
      accountId: 'account_owned',
      requireAccount() {},
      accountPath(path) { return '/accounts/account_owned' + path; },
      async request(method, path, options) {
        assert.equal(method, 'PUT');
        assert.equal(options.capabilityId, 'cloudflare.r2');
        keys.push(path);
        return { success: true };
      },
    },
  };
  const form = new FormData();
  form.append('files', new File(['a'], 'design.png', { type: 'image/png' }));
  form.append('files', new File(['b'], 'design.png', { type: 'image/png' }));
  form.set('r2_bucket', 'my-media');
  form.set('derivative_role', 'original');
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media?provider=cloudflare', { method: 'POST', body: form }), env, principal,
  );
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.uploaded_count, 2);
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1], 'identical filenames must not overwrite one another');
  assert.ok(keys.every((path) => path.includes('/r2/buckets/my-media/objects/')));
  assert.ok(keys.every((path) => path.endsWith('/design.png')));
  assert.ok(data.assets.every((asset) => asset.r2_bucket === 'my-media' && asset.source === 'r2'));
});


function testPng() {
  const png = new Uint8Array(33);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer);
  view.setUint32(16, 1);
  view.setUint32(20, 1);
  png[25] = 6;
  return png;
}

test('image editor exposes canonical image-edit models only when the signed-in account has an OpenAI credential', async () => {
  const calls = [];
  const env = {
    DB: { prepare(sql) {
      calls.push(sql);
      return { async all() { return { results: [{ id: 'gpt-image-1', name: 'GPT Image 1' }] }; } };
    } },
  };
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media/image-models'), env, principal, new URL(origin + '/api/admin/media/image-models'), null,
    { resolveCredential: async (providerId) => providerId === 'openai' ? 'account-vault-key' : null },
  );
  const data = await parseJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.configured, true);
  assert.deepEqual(data.models, [{ id: 'gpt-image-1', name: 'GPT Image 1' }]);
  assert.match(calls[0], /api_platform = 'openai_images'/);
});

test('image editor does not treat a platform environment key as the signed-in account connection', async () => {
  const env = {
    OPENAI_API_KEY: 'platform-env-key-must-not-be-used',
    DB: { prepare() { return { async all() { return { results: [{ id: 'gpt-image-1', name: 'GPT Image 1' }] }; } }; } },
  };
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media/image-models'), env, principal, new URL(origin + '/api/admin/media/image-models'), null,
    { resolveCredential: async () => null },
  );
  const data = await parseJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.configured, false);
  assert.deepEqual(data.models, []);
});

test('image editor uses the signed-in account vault key for masked edits', async () => {
  const png = testPng();
  const encoded = Buffer.from(png).toString('base64');
  let providerRequest;
  const env = {
    DB: { prepare() { return { async all() { return { results: [{ id: 'gpt-image-1' }] }; } }; } },
  };
  const form = new FormData();
  form.append('image', new File([png], 'source.png', { type: 'image/png' }));
  form.append('mask', new File([png], 'mask.png', { type: 'image/png' }));
  form.append('prompt', 'Remove the selected object and reconstruct the background.');
  form.append('model_id', 'gpt-image-1');
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media/image/edit', { method: 'POST', body: form }), env, principal,
    new URL(origin + '/api/admin/media/image/edit'), null,
    {
      resolveCredential: async (providerId) => providerId === 'openai' ? 'account-vault-key' : null,
      fetchImpl: async (url, options) => {
        providerRequest = { url: String(url), authorization: options.headers.authorization, body: options.body };
        return jsonResponse({ data: [{ b64_json: encoded }] });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(providerRequest.url, 'https://api.openai.com/v1/images/edits');
  assert.equal(providerRequest.authorization, 'Bearer account-vault-key');
  assert.ok(providerRequest.body instanceof FormData);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
});

test('image editor refuses masked edits when the signed-in account has no OpenAI image credential', async () => {
  const form = new FormData();
  form.append('image', new File([testPng()], 'source.png', { type: 'image/png' }));
  form.append('mask', new File([testPng()], 'mask.png', { type: 'image/png' }));
  form.append('prompt', 'Remove the selected object.');
  form.append('model_id', 'gpt-image-1');
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media/image/edit', { method: 'POST', body: form }),
    { OPENAI_API_KEY: 'platform-env-key', DB: { prepare() { return { async all() { return { results: [{ id: 'gpt-image-1' }] }; } }; } } },
    principal, new URL(origin + '/api/admin/media/image/edit'), null,
    { resolveCredential: async () => null },
  );
  const data = await parseJson(response);
  assert.equal(response.status, 503);
  assert.equal(data.error, 'image_edit_unavailable');
});

test('automatic background removal refuses to call Cloudflare Images as an image transformation provider', async () => {
  const env = { IMAGES: { input() { throw new Error('must not be called'); } } };
  const form = new FormData();
  form.append('file', new File([testPng()], 'source.png', { type: 'image/png' }));
  const response = await handleStudioContentMediaApi(
    mediaRequest('/api/admin/media/image/background-remove', { method: 'POST', body: form }), env, principal,
  );
  const data = await parseJson(response);
  assert.equal(response.status, 501);
  assert.equal(data.error, 'subject_segmentation_provider_required');
});
