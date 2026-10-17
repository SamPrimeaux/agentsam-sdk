/**
 * Same-origin, strictly allowlisted public chess-GLB pass-through.
 * The original models remain in InnerAnimalMedia R2; this route is only
 * an asset delivery boundary for embedded CAD Creator and local Studio.
 */
const BASE = '/cad-creator/assets/chess/baroque/';
const ORIGIN = 'https://assets.inneranimalmedia.com/glb/chess/baroque/';
const NAME = /^baroque_(?:pawn|knight|bishop|rook|queen|king)_(?:white|black)_opt\.glb$/;

export function resolveCadChessAsset(pathname) {
  if (!pathname.startsWith(BASE)) return null;
  const filename = pathname.slice(BASE.length);
  return NAME.test(filename) ? ORIGIN + filename : null;
}

/** Return null only for unrelated routes; malformed chess paths are rejected. */
export async function serveCadChessAsset(request, fetchAsset = fetch) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(BASE)) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const resolved = resolveCadChessAsset(url.pathname);
  if (!resolved) return new Response('Unknown chess asset', { status: 404 });
  try {
    const upstream = await fetchAsset(resolved, {
      method: request.method,
      headers: { Accept: 'model/gltf-binary' },
      cf: { cacheEverything: true, cacheTtl: 3600 },
    });
    if (!upstream.ok) return new Response('Chess asset unavailable', { status: 502 });
    const headers = new Headers({
      'Content-Type': 'model/gltf-binary',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    for (const name of ['content-length', 'etag', 'last-modified'])
      if (upstream.headers.has(name)) headers.set(name, upstream.headers.get(name));
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: 200, headers });
  } catch {
    return new Response('Chess asset upstream unreachable', { status: 502 });
  }
}
