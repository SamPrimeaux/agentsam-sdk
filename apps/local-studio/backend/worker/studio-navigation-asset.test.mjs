import test from 'node:test';
import assert from 'node:assert/strict';
import { serveStudioNavigationAsset } from './studio-navigation-asset.js';

test('serves the host navigation manifest directly from the static asset binding', async () => {
  const manifest = JSON.stringify({
    schema: 'agentsam.host-navigation.v1',
    primary: [{ id: 'media', label: 'Media', href: '/media' }],
    apps: [{ id: 'agentsam-copro-studio', label: 'MovieMode', href: '/admin/moviemode' }],
  });
  const calls = [];
  const env = {
    ASSETS: {
      fetch: async (request) => {
        const url = new URL(request.url);
        calls.push({ pathname: url.pathname, search: url.search, method: request.method });
        return new Response(manifest, {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      },
    },
  };

  const response = await serveStudioNavigationAsset(
    new Request('https://agentsam.inneranimalmedia.com/admin/data/navigation.json?cache=old'),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(await response.text(), manifest);
  assert.deepEqual(calls, [{
    pathname: '/admin/data/navigation.json',
    search: '',
    method: 'GET',
  }]);
});

test('supports HEAD without returning a body', async () => {
  const env = {
    ASSETS: {
      fetch: async (request) => new Response(null, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    },
  };
  const response = await serveStudioNavigationAsset(
    new Request('https://agentsam.inneranimalmedia.com/admin/data/navigation.json', { method: 'HEAD' }),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('does not intercept other routes and fails closed if the asset binding is unavailable', async () => {
  assert.equal(
    await serveStudioNavigationAsset(new Request('https://agentsam.inneranimalmedia.com/admin/home'), {}),
    null,
  );
  const response = await serveStudioNavigationAsset(
    new Request('https://agentsam.inneranimalmedia.com/admin/data/navigation.json'),
    {},
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'navigation_asset_unavailable',
  });
});

test('rejects non-read methods for the navigation manifest', async () => {
  const response = await serveStudioNavigationAsset(
    new Request('https://agentsam.inneranimalmedia.com/admin/data/navigation.json', { method: 'POST' }),
    { ASSETS: { fetch: async () => new Response('{}') } },
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
