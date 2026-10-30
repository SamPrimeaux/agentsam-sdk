const NAVIGATION_PATH = '/admin/data/navigation.json';

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
 * Serve the public host-navigation projection directly from the Worker's
 * static asset manifest. It is configuration, not an authenticated app route,
 * and must not fall through to Nitro's document router.
 */
export async function serveStudioNavigationAsset(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== NAVIGATION_PATH) return null;
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
    if (!asset.ok) return unavailable();
    const headers = new Headers(asset.headers);
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
