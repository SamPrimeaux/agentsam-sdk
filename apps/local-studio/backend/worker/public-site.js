/**
 * Serve public marketing/docs pages from the Worker static ASSETS binding
 * (built files under apps/local-studio/.output/public/site/*).
 *
 * This is NOT the R2 WEBSITE_ASSETS bucket (agentsam-os-blueprint-content).
 * R2 is only used by site-partials.js for optional header/footer injection.
 *
 * Asset paths in HTML are absolute (/site/global/...) so the same page works
 * at /, /home/, /learn/, /packages/sdk/help/, etc.
 */
const PUBLIC_SITE_HTML = Object.freeze({
  '/': 'site/home/index.html',
  '/home': 'site/home/index.html',
  '/home/': 'site/home/index.html',
  '/packages/sdk/help': 'site/packages/sdk/help/index.html',
  '/packages/sdk/help/': 'site/packages/sdk/help/index.html',
  '/packages/sdk/setup-guide': 'site/packages/sdk/setup-guide/index.html',
  '/packages/sdk/setup-guide/': 'site/packages/sdk/setup-guide/index.html',
  '/learn': 'site/learn/index.html',
  '/learn/': 'site/learn/index.html',
  '/learn/architecture-field-manual': 'site/learn/architecture-field-manual/index.html',
  '/learn/architecture-field-manual/': 'site/learn/architecture-field-manual/index.html',
});

export function isPublicSitePath(pathname) {
  return Object.hasOwn(PUBLIC_SITE_HTML, pathname);
}

export async function servePublicSitePage(request, env, pathname = new URL(request.url).pathname) {
  const assetPath = PUBLIC_SITE_HTML[pathname];
  if (!assetPath || !env?.ASSETS) {
    return null;
  }

  try {
    const res = await env.ASSETS.fetch(new Request(`http://localhost/${assetPath}`));
    if (!res || res.status !== 200) return null;
    const html = await res.text();
    if (!html || html.length < 200) return null;
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=0, must-revalidate',
        'x-robots-tag': 'index, follow',
        'x-public-site-asset': assetPath,
      },
    });
  } catch {
    return null;
  }
}
