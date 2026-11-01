import assert from 'node:assert/strict';
import test from 'node:test';
import { handleStudioContentMediaApi } from './content-media-api.js';

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
  assert.equal(data.account.id, 'acct_user_owned');
  assert.equal(data.source, 'cf_images');
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

test('#419 Cloudflare Images upload never calls IAM_API', async () => {
  const calls = [];
  const env = {
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
  assert.equal(data.assets[0].cloudflare_image_id, 'cfimg_upload_1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].hasForm, true);
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
