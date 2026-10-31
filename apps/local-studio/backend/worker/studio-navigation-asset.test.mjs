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

const hostCodeAssets = [
  ['/admin/js/agentsam-nav.js', 'text/javascript; charset=utf-8', 'window.AgentSamNav = {};'],
  ['/admin/js/shell-appearance.mjs', 'application/javascript', 'export const project = () => ({});'],
  ['/admin/css/agentsam-nav.css', 'text/css; charset=utf-8', '.as-nav-scope{color:inherit}'],
  ['/admin/css/shared-nav-host.css', 'text/css', '.console-workspace{min-width:0}'],
];
for (const [pathname, contentType, body] of hostCodeAssets) {
  test('serves installation-owned asset at its original path: ' + pathname, async () => {
    const calls = [];
    const env = { ASSETS: { fetch: async request => {
      calls.push({ pathname:new URL(request.url).pathname, search:new URL(request.url).search, method:request.method });
      return new Response(request.method === 'HEAD' ? null : body, { headers:{'content-type':contentType} });
    } } };
    const response = await serveStudioNavigationAsset(new Request('https://studio.test' + pathname + '?v=revision'), env);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), body);
    assert.equal(response.headers.get('content-type'), contentType);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(calls, [{pathname,search:'',method:'GET'}], 'never remap to /ecommerce-cms-agentsam/admin');
    const head = await serveStudioNavigationAsset(new Request('https://studio.test' + pathname, {method:'HEAD'}), env);
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(calls.at(-1).method, 'HEAD');
  });
}
test('host assets fail closed for HTML fallbacks, wrong MIME, missing assets and non-read methods', async () => {
  for (const [pathname, expectedType] of hostCodeAssets) {
    for (const contentType of ['text/html', 'text/plain']) {
      const response = await serveStudioNavigationAsset(new Request('https://studio.test' + pathname), {
        ASSETS:{fetch:async()=>new Response('<!doctype html><title>Login</title>',{headers:{'content-type':contentType}})},
      });
      assert.equal(response.status, 503, pathname + ' must reject ' + contentType);
    }
    const missing = await serveStudioNavigationAsset(new Request('https://studio.test' + pathname), {
      ASSETS:{fetch:async()=>new Response(null,{status:404,headers:{'content-type':expectedType}})},
    });
    assert.equal(missing.status, 503);
    let fetched = false;
    const denied = await serveStudioNavigationAsset(new Request('https://studio.test' + pathname, {method:'POST'}), {
      ASSETS:{fetch:async()=>{fetched=true;return new Response('');}},
    });
    assert.equal(denied.status, 405);
    assert.equal(denied.headers.get('allow'), 'GET, HEAD');
    assert.equal(fetched, false);
  }
});
test('host asset allowlist does not intercept unrelated packaged scripts or styles', async () => {
  for (const pathname of ['/admin/js/shell.js','/admin/css/console.css','/admin/js/other.mjs','/admin/js/shell-appearance.mjs/extra']) {
    assert.equal(await serveStudioNavigationAsset(new Request('https://studio.test'+pathname), {}), null);
  }
});
