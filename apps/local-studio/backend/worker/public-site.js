/**
 * Serve public marketing/docs pages.
 *
 * D1 cms_sites resolves the request hostname; WEBSITE_ASSETS R2 stores the
 * site's published files. Worker env.ASSETS (.output/public) is bootstrap
 * fallback only. Public HTML delivery intentionally bypasses KV.
 */
import {
  resolveWebsiteAssets,
  resolveWorkerStaticAssets,
  websitePublicKey,
} from './bindings.js';

/**
 * Resolve the public site from its verified hostname. Public requests do not
 * carry an account session, so the domain registration is the routing key;
 * page reads remain constrained to the resolved cms_sites.id by downstream
 * site-owned queries. Ambiguous aliases fail closed.
 */
export async function resolvePublicSiteIdentity(db, hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!host || !db?.prepare) return null;
  const result = await db.prepare(`
    SELECT id, account_id, slug, name, primary_domain, domain_aliases_json, status
    FROM cms_sites s
    WHERE s.status = 'active'
      AND (
        lower(trim(COALESCE(s.primary_domain, ''))) = ?
        OR EXISTS (
          SELECT 1 FROM json_each(COALESCE(s.domain_aliases_json, '[]')) alias
          WHERE lower(trim(CAST(alias.value AS TEXT))) = ?
        )
      )
    ORDER BY CASE WHEN lower(trim(COALESCE(s.primary_domain, ''))) = ? THEN 0 ELSE 1 END,
      s.created_at ASC
    LIMIT 2
  `).bind(host, host, host).all();
  const rows = result.results || [];
  if (rows.length > 1) throw new Error('cms_public_site_domain_ambiguous');
  const site = rows[0] || null;
  if (site && !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(String(site.slug || ''))) {
    throw new Error('cms_public_site_slug_invalid');
  }
  return site;
}

/** The standalone Theme Store (own worker/repo/R2). One constant, used below. */
const THEME_STORE_HOST = 'themes.inneranimalmedia.com';

/**
 * The v1 gallery that used to live at /themes/ on the shared AgentSam host is
 * retired; the store is its own site. Send the gallery root there. Preview and
 * demo paths under /themes/<slug>/… are left alone, and local development
 * hosts never redirect to production.
 */
function themeStoreRedirect(request, pathname) {
  if (pathname !== '/themes' && pathname !== '/themes/') return null;
  const host = new URL(request.url).hostname.toLowerCase();
  if (host === THEME_STORE_HOST || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) {
    return null;
  }
  return Response.redirect(`https://${THEME_STORE_HOST}/`, 301);
}

const PUBLIC_SITE_HTML = Object.freeze({
  '/': 'home/index.html',
  '/home': 'home/index.html',
  '/home/': 'home/index.html',
  '/privacy': 'privacy/index.html',
  '/privacy/': 'privacy/index.html',
  '/terms': 'terms/index.html',
  '/terms/': 'terms/index.html',
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
  '/docs': 'docs/sam/index.html',
  '/docs/': 'docs/sam/index.html',
  '/docs/sam': 'docs/sam/index.html',
  '/docs/sam/': 'docs/sam/index.html',
  '/docs/sam/structured-decisions': 'docs/sam/structured-decisions/index.html',
  '/docs/sam/structured-decisions/': 'docs/sam/structured-decisions/index.html',
  '/docs/sam/infrastructure-cookbooks': 'docs/sam/infrastructure-cookbooks/index.html',
  '/docs/sam/infrastructure-cookbooks/': 'docs/sam/infrastructure-cookbooks/index.html',
});

/**
 * The dedicated Theme Store hostname serves the generated /themes gallery at /.
 * Keep /themes as a backwards-compatible path on the shared AgentSam host.
 */
export function publicSitePathForRequest(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (host === THEME_STORE_HOST && (url.pathname === '/' || url.pathname === '/index.html')) {
    return '/themes';
  }
  return url.pathname;
}

export function isPublicSitePath(pathname) {
  return (
    Object.hasOwn(PUBLIC_SITE_HTML, pathname) ||
    isThemesPath(pathname) ||
    isDocsPath(pathname) ||
    isSiteStaticPath(pathname)
  );
}

/** Theme gallery + live demo mounts under /themes/<slug>/… */
export function isThemesPath(pathname) {
  return pathname === '/themes' || pathname.startsWith('/themes/');
}

/** SAM / public docs under /docs/… */
export function isDocsPath(pathname) {
  return pathname === '/docs' || pathname.startsWith('/docs/');
}

function themesRelative(pathname) {
  if (pathname === '/themes' || pathname === '/themes/') return 'themes/index.html';
  let rel = pathname.replace(/^\/+/, '');
  if (rel.endsWith('/')) rel += 'index.html';
  else if (!/\.[a-zA-Z0-9]+$/.test(rel)) rel += '/index.html';
  return rel;
}

function docsRelative(pathname) {
  if (pathname === '/docs' || pathname === '/docs/') return 'docs/sam/index.html';
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

function normalizedRoutePath(pathname) {
  const path = String(pathname || '/').split('?')[0];
  if (!path.startsWith('/') || path.includes('\\') || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f])/i.test(path)) return null;
  const segments = path.split('/').filter(Boolean);
  if (segments.some(part => part === '.' || part === '..' || /[\u0000-\u001f]/.test(part))) return null;
  return segments.length ? `/${segments.join('/')}/` : '/';
}

function sitePublicObjectKey(site, key) {
  if (typeof key !== 'string' || !key || key.startsWith('/') || key.includes('\\')) return false;
  if (key.split('/').some(part => !part || part === '.' || part === '..')) return false;
  return key.startsWith(`sites/${site.slug}/public/`) || key.startsWith(`sites/${site.id}/public/`);
}

/** Resolve only a published page owned by this exact cms_sites.id. */
export async function resolvePublishedPageSource(db, site, pathname) {
  const route = normalizedRoutePath(pathname);
  if (!route || !db?.prepare || !site?.id) return null;
  const withoutTrailingSlash = route === '/' ? '/' : route.slice(0, -1);
  const pageResult = await db.prepare(`
    SELECT id, site_id, slug, route_path, title, status, content_object_key, published_manifest_object_key
    FROM cms_pages
    WHERE site_id = ? AND status = 'published' AND route_path IN (?, ?)
    LIMIT 2
  `).bind(site.id, route, withoutTrailingSlash).all();
  const pages = pageResult.results || [];
  if (pages.length > 1) throw new Error('cms_public_page_route_ambiguous');
  const page = pages[0] || null;
  if (!page) return null;
  if (page.content_object_key) {
    if (!sitePublicObjectKey(site, page.content_object_key)) {
      throw new Error('cms_public_page_source_outside_site');
    }
    return { page, key: page.content_object_key };
  }
  if (page.published_manifest_object_key) {
    // Manifest-based theme rendering is handled by the installed theme
    // runtime; do not guess a static object path from a manifest pointer.
    return { page, key: null, manifest: page.published_manifest_object_key };
  }

  const sectionResult = await db.prepare(`
    SELECT section_key, section_type, section_data, is_visible, published_r2_key
    FROM cms_page_sections
    WHERE page_id = ? AND is_visible = 1
    ORDER BY sort_order ASC, created_at ASC
  `).bind(page.id).all();
  const section = (sectionResult.results || []).find(item =>
    item.section_key === 'html-document' || item.section_type === 'html_source'
  );
  if (!section) return { page, key: null };
  let data = {};
  try { data = typeof section.section_data === 'string' ? JSON.parse(section.section_data || '{}') : (section.section_data || {}); }
  catch { throw new Error('cms_public_page_source_invalid'); }
  const key = section.published_r2_key || data.source_r2_key || null;
  if (!key) return { page, key: null };
  if (!sitePublicObjectKey(site, key)) throw new Error('cms_public_page_source_outside_site');
  return { page, key };
}

/**
 * @param {Request} request
 * @param {object} env
 * @param {string} [pathname]
 */
export async function servePublicSitePage(
  request,
  env,
  pathname = new URL(request.url).pathname
) {
  const redirect = themeStoreRedirect(request, pathname);
  if (redirect) return redirect;

  let site;
  try {
    site = await resolvePublicSiteIdentity(env.DB, new URL(request.url).hostname);
  } catch (error) {
    console.error('Public CMS site resolution failed:', String(error?.message || error));
    return new Response('Site routing unavailable', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  if (!site) return null;

  const siteSlug = site.slug;
  const website = resolveWebsiteAssets(env);
  // Worker ASSETS is an AgentSam-only bootstrap copy. Never let another
  // hostname fall back to those files when its own R2 object is missing.
  const workerAssets = site.slug === 'agentsam-sdk' ? resolveWorkerStaticAssets(env) : null;

  let relative = null;
  let r2Key = null;
  let authoritativePage = false;
  if (isSiteStaticPath(pathname)) {
    relative = siteStaticRelative(pathname);
    r2Key = websitePublicKey(siteSlug, relative);
  } else {
    let pageSource;
    try {
      pageSource = await resolvePublishedPageSource(env.DB, site, pathname);
    } catch (error) {
      console.error('Public CMS page resolution failed:', String(error?.message || error));
      return new Response('Published page unavailable', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    if (pageSource) {
      authoritativePage = true;
      if (!pageSource.key) return null;
      r2Key = pageSource.key;
      relative = r2Key.split('/').pop() || 'index.html';
    } else if (site.slug === 'agentsam-sdk') {
      // Compatibility only for AgentSam's unmigrated legal/static routes.
      relative = PUBLIC_SITE_HTML[pathname];
      if (!relative && isThemesPath(pathname)) relative = themesRelative(pathname);
      if (!relative && isDocsPath(pathname)) relative = docsRelative(pathname);
      if (relative) r2Key = websitePublicKey(siteSlug, relative);
    }
  }
  if (!relative || !r2Key) return null;

  // D1 resolves the tenant; R2 is the existing content authority. Bypass KV
  // until the site-owned publish path is proven end to end. This avoids an
  // extra binding and guarantees cold requests read the current site object.
  // SSOT — WEBSITE_ASSETS R2
  if (website?.binding) {
    try {
      if (/\.(?:html|css|js|json)$/i.test(r2Key)) {
        const text = await readR2Text(website.binding, r2Key);
        if (text) {
          if (relative.endsWith('.html')) {
            return htmlResponse(text, {
              'x-public-site-source': `r2:${website.name}`,
              'x-public-site-key': r2Key,
            });
          }
          return new Response(text, {
            status: 200,
            headers: {
              'content-type': guessType(r2Key),
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

  // A registered, published D1 page must never silently fall back to a
  // different old Worker asset if its authoritative R2 object is missing.
  if (authoritativePage) {
    return new Response('Published CMS page source unavailable', {
      status: 503, headers: { 'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8' },
    });
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

export { PUBLIC_SITE_HTML };
