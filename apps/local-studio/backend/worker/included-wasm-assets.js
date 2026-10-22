/** Cloudflare-hosted OpenCascade WASM delivery. Desktop bundles keep the uncompressed original. */
export async function serveIncludedWasmAsset(request, env) {
  const url = new URL(request.url);
  if (!/^\/samsketch\/assets\/opencascade\.full-[A-Za-z0-9_-]+\.wasm$/.test(url.pathname)) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  if (!env.ASSETS?.fetch) return new Response('Asset service unavailable', { status: 503 });
  const packedUrl = new URL(`${url.pathname}.gz`, url.origin);
  const asset = await env.ASSETS.fetch(new Request(packedUrl, { method: 'GET' }));
  if (!asset.ok) return new Response('CAD modeling engine unavailable', { status: asset.status === 404 ? 503 : asset.status });
  return new Response(request.method === 'HEAD' ? null : asset.body, {
    status: 200,
    headers: {
      'content-type': 'application/wasm',
      'content-encoding': 'gzip',
      'cache-control': 'public, max-age=31536000, immutable',
      'vary': 'Accept-Encoding',
    },
  });
}
