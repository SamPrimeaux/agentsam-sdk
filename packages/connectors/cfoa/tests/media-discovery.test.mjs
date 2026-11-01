import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cloudflareMediaConnectUrl,
  discoverCloudflareMedia,
  listCloudflareR2Buckets,
  listCloudflareR2Objects,
  listCloudflareImages,
  listCloudflareStream,
  normalizeCloudflareReturnTo,
  uploadCloudflareImage,
  createCloudflareStreamDirectUpload,
  deleteCloudflareImage,
} from '../src/families/media.js';
import { getCloudflareFeaturePack } from '../src/capabilities.js';
import { isCloudflareConnectionPath } from '../src/routes.js';

function mockClient({ accountId = 'acct123', scopes = [], responses = {} } = {}) {
  return {
    accountId,
    connectionId: 'conn_1',
    authSource: 'oauth',
    grantedScopes: scopes,
    requireAccount() {},
    accountPath(suffix) {
      return `/accounts/${accountId}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
    },
    async request(method, path) {
      const key = `${method} ${path.split('?')[0]}`;
      if (typeof responses[key] === 'function') return responses[key]();
      if (responses[key]) return responses[key];
      const err = new Error('not mocked: ' + key);
      err.httpStatus = 403;
      throw err;
    },
  };
}

describe('cloudflare media discovery', () => {
  it('preserves originating return_to on connect URLs', () => {
    assert.equal(
      normalizeCloudflareReturnTo('https://studio.example/media'),
      '/media',
    );
    assert.equal(
      cloudflareMediaConnectUrl({ returnTo: '/media' }),
      '/api/connections/cloudflare/start?packs=media%2Cdata&return_to=%2Fmedia',
    );
  });

  it('uses caller returnTo when account is required', async () => {
    const discovery = await discoverCloudflareMedia(
      { accountId: '', grantedScopes: [] },
      { returnTo: '/media' },
    );
    assert.equal(discovery.status, 'account_required');
    assert.match(discovery.connect_url, /return_to=%2Fmedia/);
    assert.doesNotMatch(discovery.connect_url, /settings%2Fintegrations/);
  });

  it('exposes a media feature pack with Images, Stream, and R2', () => {
    const pack = getCloudflareFeaturePack('media');
    assert.ok(pack);
    assert.deepEqual(pack.capabilities.sort(), [
      'cloudflare.images',
      'cloudflare.r2',
      'cloudflare.stream',
    ].sort());
  });

  it('registers resources and R2 object paths on the connector router', () => {
    assert.equal(isCloudflareConnectionPath('/api/connections/cloudflare/resources'), true);
    assert.equal(
      isCloudflareConnectionPath('/api/connections/cloudflare/r2/buckets/my-bucket/objects'),
      true,
    );
    assert.equal(isCloudflareConnectionPath('/api/connections/cloudflare/other'), false);
  });

  it('lists R2 buckets without scanning objects', async () => {
    const client = mockClient({
      scopes: ['workers-r2.read'],
      responses: {
        'GET /accounts/acct123/r2/buckets': {
          result: { buckets: [{ name: 'website-assets' }, { name: 'uploads' }] },
          result_info: { count: 2, cursor: null },
        },
      },
    });
    const page = await listCloudflareR2Buckets(client);
    assert.equal(page.buckets.length, 2);
    assert.equal(page.buckets[0].name, 'website-assets');
    assert.equal(page.truncated, false);
  });

  it('pages R2 objects for a single selected bucket', async () => {
    const client = mockClient({
      scopes: ['workers-r2-bucket-item.read'],
      responses: {
        'GET /accounts/acct123/r2/buckets/website-assets/objects': {
          result: [{ key: 'public/great-room.png', size: 1200 }],
          result_info: { cursor: 'next', truncated: true },
        },
      },
    });
    const page = await listCloudflareR2Objects(client, 'website-assets');
    assert.equal(page.bucket, 'website-assets');
    assert.equal(page.objects[0].key, 'public/great-room.png');
    assert.equal(page.truncated, true);
  });

  it('distinguishes needs_scope from empty discovery results', async () => {
    const denied = mockClient({
      scopes: [],
      responses: {
        'GET /accounts/acct123/r2/buckets': () => {
          const err = new Error('forbidden');
          err.httpStatus = 403;
          throw err;
        },
        'GET /accounts/acct123/images/v2': () => {
          const err = new Error('forbidden');
          err.httpStatus = 403;
          throw err;
        },
        'GET /accounts/acct123/stream': () => {
          const err = new Error('forbidden');
          err.httpStatus = 403;
          throw err;
        },
      },
    });
    const discovery = await discoverCloudflareMedia(denied);
    assert.equal(discovery.r2.status, 'needs_scope');
    assert.equal(discovery.images.status, 'needs_scope');
    assert.equal(discovery.stream.status, 'needs_scope');
    assert.equal(discovery.status, 'needs_scope');
  });

  it('reports empty R2 without claiming the provider is disconnected', async () => {
    const client = mockClient({
      scopes: ['workers-r2.read', 'images.read', 'stream.read'],
      responses: {
        'GET /accounts/acct123/r2/buckets': { result: { buckets: [] }, result_info: { count: 0 } },
        'GET /accounts/acct123/images/v2': {
          result: { images: [] },
          result_info: { count: 0 },
        },
        'GET /accounts/acct123/stream': { result: [] },
      },
    });
    const discovery = await discoverCloudflareMedia(client);
    assert.equal(discovery.r2.status, 'empty');
    assert.equal(discovery.r2.available, true);
    assert.equal(discovery.images.status, 'connected');
    assert.equal(discovery.stream.status, 'connected');
    // Probe must not invent an account-wide total from a sample page.
    assert.equal(discovery.images.count, null);
    assert.equal(discovery.stream.count, null);
  });

  it('pages Images and Stream galleries through user OAuth client', async () => {
    const client = mockClient({
      scopes: ['images.read', 'stream.read'],
      responses: {
        'GET /accounts/acct123/images/v2': {
          result: {
            images: [{
              id: 'img_1',
              filename: 'great-room.png',
              size: 100,
              variants: ['https://imagedelivery.net/hash/img_1/public'],
            }],
          },
          result_info: { continuation_token: 'next-img', total_count: 40 },
        },
        'GET /accounts/acct123/stream': {
          result: [{
            uid: 'vid_1',
            thumbnail: 'https://customer-x.cloudflarestream.com/vid_1/thumb.jpg',
            playback: { hls: 'https://customer-x.cloudflarestream.com/vid_1/manifest/video.m3u8' },
            duration: 3,
            readyToStream: true,
            meta: { name: 'tour.mp4' },
          }],
          result_info: { truncated: true },
        },
      },
    });
    const images = await listCloudflareImages(client, { perPage: 24 });
    assert.equal(images.images[0].id, 'img_1');
    assert.equal(images.delivery_hash, 'hash');
    assert.equal(images.continuation_token, 'next-img');
    assert.equal(images.count, 40);

    const stream = await listCloudflareStream(client, { perPage: 24 });
    assert.equal(stream.videos[0].uid, 'vid_1');
    assert.equal(stream.customer_code, 'x');
    assert.equal(stream.truncated, true);
  });

  it('uploads Images and creates Stream direct-upload URLs through OAuth client', async () => {
    const calls = [];
    const client = mockClient({
      scopes: ['images.write', 'stream.write'],
      responses: {
        'POST /accounts/acct123/images/v1': () => {
          calls.push('images');
          return {
            result: {
              id: 'img_new',
              filename: 'a.png',
              size: 9,
              variants: ['https://imagedelivery.net/h/img_new/public'],
            },
          };
        },
        'POST /accounts/acct123/stream/direct_upload': () => {
          calls.push('stream');
          return { result: { uid: 'vid_new', uploadURL: 'https://upload.example/u' } };
        },
        'DELETE /accounts/acct123/images/v1/img_new': () => {
          calls.push('delete');
          return { result: {} };
        },
      },
    });
    const uploaded = await uploadCloudflareImage(client, new Blob(['x']), { filename: 'a.png' });
    assert.equal(uploaded.id, 'img_new');
    const direct = await createCloudflareStreamDirectUpload(client, { meta: { name: 'a.mp4' } });
    assert.equal(direct.uid, 'vid_new');
    assert.equal(direct.uploadURL, 'https://upload.example/u');
    await deleteCloudflareImage(client, 'img_new');
    assert.deepEqual(calls, ['images', 'stream', 'delete']);
  });

  it('classifies provider failures independently and never reports them as empty', async () => {
    const mk = (httpStatus, message, code) => {
      const err = new Error(message);
      err.httpStatus = httpStatus;
      err.providerErrors = code ? [{ code, message }] : [];
      return err;
    };
    const client = mockClient({
      scopes: [],
      responses: {
        'GET /accounts/acct123/r2/buckets': () => { throw mk(404, 'No route for that URI', 7003); },
        'GET /accounts/acct123/images/v2': () => { throw mk(403, 'Authentication error', 10000); },
        'GET /accounts/acct123/stream': () => ({ result: [], result_info: {} }),
      },
    });
    const out = await discoverCloudflareMedia(client, { returnTo: '/media' });
    assert.equal(out.r2.status, 'error');
    assert.equal(out.r2.http_status, 404);
    assert.match(out.r2.error, /No route/);
    assert.equal(out.images.status, 'needs_scope');
    assert.equal(out.stream.status, 'connected');
    assert.equal(out.status, 'partial');
  });
});
