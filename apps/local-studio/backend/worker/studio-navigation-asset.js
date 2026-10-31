// These installation-owned files are staged at /admin, outside the independently
// packaged Ecommerce application. Keep this exact allowlist ahead of its prefix mount.
const HOST_NAVIGATION_ASSETS = new Map([
  ['/admin/data/navigation.json', new Set(['application/json'])],
  ['/admin/js/agentsam-nav.js', new Set(['text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript'])],
  ['/admin/js/shell-appearance.mjs', new Set(['text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript'])],
  ['/admin/css/agentsam-nav.css', new Set(['text/css'])],
  ['/admin/css/shared-nav-host.css', new Set(['text/css'])],
]);

function unavailable() {
  return new Response(JSON.stringify({ ok: false, error: 'navigation_asset_unavailable' }), {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * Serve installation-owned navigation assets directly from the Worker's
 * static binding. These contain public code/configuration, not account data,
 * and must not fall through to the packaged Ecommerce prefix or document router.
 */
export async function serveStudioNavigationAsset(request, env) {
  const url = new URL(request.url);
  const allowedTypes = HOST_NAVIGATION_ASSETS.get(url.pathname);
  if (!allowedTypes) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, {
      status: 405,
      headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' },
    });
  }
  if (typeof env?.ASSETS?.fetch !== 'function') return unavailable();

  try {
    url.search = '';
    const asset = await env.ASSETS.fetch(new Request(url, { method: request.method }));
    // An ASSETS SPA/document fallback can be 200 HTML. Never return it as a
    // successful module, stylesheet or navigation manifest.
    const contentType = (asset.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    if (!asset.ok || !allowedTypes.has(contentType)) return unavailable();
    const headers = new Headers(asset.headers);
    headers.set('x-content-type-options', 'nosniff');
    headers.set('cache-control', 'private, no-store');
    return new Response(request.method === 'HEAD' ? null : asset.body, {
      status: asset.status,
      statusText: asset.statusText,
      headers,
    });
  } catch (error) {
    console.error('studio_navigation_asset_error', String(error?.message || error));
    return unavailable();
  }
}
