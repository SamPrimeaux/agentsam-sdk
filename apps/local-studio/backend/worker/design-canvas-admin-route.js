/**
 * One authenticated admin address for the already-installed Design Canvas.
 * This is an asset mount, not another editor, router or customer CMS page.
 * The existing /design-canvas/ distribution remains a compatibility URL.
 */
export async function serveDesignCanvasAdminRoute(request, env, guardDocument) {
  const url = new URL(request.url);
  const prefix = '/admin/design-canvas';
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  if (url.pathname === prefix) {
    const canonical = new URL(url);
    canonical.pathname = prefix + '/';
    return Response.redirect(canonical.toString(), 308);
  }
  // The admin mount is intentionally session-only, including its source
  // document dependencies. Do not use the site theme or CMS page router.
  const denied = await guardDocument(request, env);
  if (denied) return denied;
  const tail = url.pathname.slice(prefix.length + 1);
  if (tail.split('/').some(part => part === '..' || part === '.') ||
      !/^[A-Za-z0-9_./%-]*$/.test(tail))
    return new Response('Not found', { status: 404 });
  const assetUrl = new URL(url);
  assetUrl.pathname = '/design-canvas/' + tail;
  assetUrl.search = '';
  const upstream = await env.ASSETS.fetch(new Request(assetUrl, request));
  const headers = new Headers(upstream.headers);
  headers.set('cache-control', 'private, no-store');
  return new Response(request.method === 'HEAD' ? null : upstream.body,
    { status: upstream.status, statusText: upstream.statusText, headers });
}
