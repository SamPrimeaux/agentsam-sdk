/**
 * Serve public marketing/docs pages.
 *
 * SSOT: WEBSITE_ASSETS R2 (sites/{slug}/public/…) — code sections for CMS.
 * D1 holds editable field metadata; KV (when bound) can cache rendered HTML.
 * Worker env.ASSETS (.output/public) is bootstrap fallback only, not SSOT.
 */
import {
  resolveWebsiteAssets,
  resolveWorkerStaticAssets,
  resolveSiteCacheKv,
  websitePublicKey,
} from './bindings.js';

const DEFAULT_SITE = 'agentsam-sdk';

const PUBLIC_SITE_HTML = Object.freeze({
  '/': 'home/index.html',
  '/home': 'home/index.html',
  '/home/': 'home/index.html',
  '/packages/sdk/help': 'packages/sdk/help/index.html',
  '/packages/sdk/help/': 'packages/sdk/help/index.html',
  '/packages/sdk/setup-guide': 'packages/sdk/setup-guide/index.html',
  '/packages/sdk/setup-guide/': 'packages/sdk/setup-guide/index.html',
  '/learn': 'learn/index.html',
  '/learn/': 'learn/index.html',
  '/learn/architecture-field-manual': 'learn/architecture-field-manual/index.html',
  '/learn/architecture-field-manual/': 'learn/architecture-field-manual/index.html',
  '/themes': 'themes/index.html',
  '/themes/': 'themes/index.html',
});

export function isPublicSitePath(pathname) {
  return Object.hasOwn(PUBLIC_SITE_HTML, pathname) || isThemesPath(pathname) || isSiteStaticPath(pathname);
}

/** Theme gallery + live demo mounts under /themes/<slug>/… */
export function isThemesPath(pathname) {
  return pathname === '/themes' || pathname.startsWith('/themes/');
}

function themesRelative(pathname) {
  if (pathname === '/themes' || pathname === '/themes/') return 'themes/index.html';
  let rel = pathname.replace(/^\/+/, '');
  if (rel.endsWith('/')) rel += 'index.html';
  else if (!/\.[a-zA-Z0-9]+$/.test(rel)) rel += '/index.html';
  return rel;
}

/** Absolute /site/* URLs used by ASBD HTML (CSS/JS/partials). */
export function isSiteStaticPath(pathname) {
  return pathname === '/site' || pathname.startsWith('/site/');
}

function siteStaticRelative(pathname) {
  if (pathname === '/site' || pathname === '/site/') return 'home/index.html';
  return pathname.replace(/^\/site\//, '');
}

async function readR2Text(r2, key) {
  const obj = await r2.get(key);
  if (!obj) return null;
  const text = await obj.text();
  return text && text.length ? text : null;
}

async function readCached(kv, cacheKey) {
  if (!kv) return null;
  try {
    return await kv.get(cacheKey);
  } catch {
    return null;
  }
}

async function writeCached(kv, cacheKey, html) {
  if (!kv || !html) return;
  try {
    await kv.put(cacheKey, html, { expirationTtl: 60 });
  } catch {
    // cache is best-effort
  }
}

function htmlResponse(html, extraHeaders = {}) {
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
      'x-robots-tag': 'index, follow',
      ...extraHeaders,
    },
  });
}

function binaryResponse(body, contentType, extraHeaders = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentType || 'application/octet-stream',
      'cache-control': 'public, max-age=60, must-revalidate',
      ...extraHeaders,
    },
  });
}

function guessType(path) {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

/**
 * @param {Request} request
 * @param {object} env
 * @param {string} [pathname]
 * @param {{ siteSlug?: string }} [opts]
 */
export async function servePublicSitePage(
  request,
  env,
  pathname = new URL(request.url).pathname,
  opts = {}
) {
  const siteSlug = opts.siteSlug || DEFAULT_SITE;
  const website = resolveWebsiteAssets(env);
  const kv = resolveSiteCacheKv(env)?.binding || null;
  const workerAssets = resolveWorkerStaticAssets(env);

  let relative = PUBLIC_SITE_HTML[pathname];
  if (!relative && isThemesPath(pathname)) {
    relative = themesRelative(pathname);
  }
  if (!relative && isSiteStaticPath(pathname)) {
    relative = siteStaticRelative(pathname);
  }
  if (!relative) return null;

  const r2Key = websitePublicKey(siteSlug, relative);
  const cacheKey = `site:${siteSlug}:${relative}`;

  // 1) KV refresh cache (optional)
  const cached = await readCached(kv, cacheKey);
  if (cached && relative.endsWith('.html')) {
    return htmlResponse(cached, {
      'x-public-site-source': 'kv',
      'x-public-site-key': r2Key,
    });
  }

  // 2) SSOT — WEBSITE_ASSETS R2
  if (website?.binding) {
    try {
      if (relative.endsWith('.html') || relative.endsWith('.css') || relative.endsWith('.js') || relative.endsWith('.json')) {
        const text = await readR2Text(website.binding, r2Key);
        if (text) {
          if (relative.endsWith('.html')) await writeCached(kv, cacheKey, text);
          if (relative.endsWith('.html')) {
            return htmlResponse(text, {
              'x-public-site-source': `r2:${website.name}`,
              'x-public-site-key': r2Key,
            });
          }
          return new Response(text, {
            status: 200,
            headers: {
              'content-type': guessType(relative),
              'cache-control': 'public, max-age=60, must-revalidate',
              'x-public-site-source': `r2:${website.name}`,
              'x-public-site-key': r2Key,
            },
          });
        }
      } else {
        const obj = await website.binding.get(r2Key);
        if (obj) {
          return binaryResponse(obj.body, obj.httpMetadata?.contentType || guessType(relative), {
            'x-public-site-source': `r2:${website.name}`,
            'x-public-site-key': r2Key,
          });
        }
      }
    } catch (err) {
      console.error('WEBSITE_ASSETS read failed', r2Key, String(err?.message || err));
    }
  }

  // 3) Bootstrap fallback — Worker static ASSETS (.output/public/site/…)
  if (workerAssets) {
    try {
      const assetPath = `site/${relative}`;
      const res = await workerAssets.fetch(new Request(`http://localhost/${assetPath}`));
      if (res && res.status === 200) {
        const headers = new Headers(res.headers);
        headers.set('x-public-site-source', 'worker-assets-fallback');
        headers.set('x-public-site-key', assetPath);
        return new Response(res.body, { status: 200, headers });
      }
    } catch {
      // fall through
    }
  }

  return null;
}

export { PUBLIC_SITE_HTML, DEFAULT_SITE };
