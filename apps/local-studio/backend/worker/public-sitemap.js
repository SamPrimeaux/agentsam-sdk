const SEARCH_DISCOVERY_PATHS = new Set([
  '/sitemap',
  '/sitemap/',
  '/sitemap.xml',
  '/robots.txt',
]);

const PRIVATE_ROUTE = /^\/(?:admin|api|auth|dashboard|media|projects|settings|terminal|work)(?:\/|$)/i;
const PRIVATE_PAGE_TYPES = new Set(['auth', 'portal', 'dashboard', 'login', 'sitemap']);
const AGENTSAM_STATIC_PAGES = Object.freeze([
  { path: '/privacy', title: 'Privacy Policy' },
  { path: '/terms', title: 'Terms of Service' },
  { path: '/packages/sdk/setup-guide/', title: 'SDK Setup Guide' },
]);

export function isPublicSearchDiscoveryPath(pathname) {
  return SEARCH_DISCOVERY_PATHS.has(String(pathname || ''));
}

function canonicalOrigin(request, site) {
  const fallback = new URL(request.url).origin;
  const domain = String(site?.primary_domain || '').trim();
  if (!domain) return fallback;
  try {
    const parsed = new URL(domain.includes('://') ? domain : `https://${domain}`);
    return `https://${parsed.host.toLowerCase()}`;
  } catch {
    return fallback;
  }
}

function normalizePublicPath(value) {
  const raw = String(value || '').trim();
  if (
    !raw.startsWith('/') ||
    raw.includes('?') ||
    raw.includes('#') ||
    raw.includes('\\') ||
    raw.includes('//') ||
    /%(?:2f|5c|0[0-9a-f]|1[0-9a-f])/i.test(raw)
  ) return null;

  const segments = raw.split('/').filter(Boolean);
  if (segments.some(segment =>
    segment === '.' || segment === '..' || /[\u0000-\u001f]/.test(segment)
  )) return null;

  if (!segments.length) return '/';
  return `/${segments.join('/')}${raw.endsWith('/') ? '/' : ''}`;
}

function isExcludedPath(pathname) {
  const path = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  return path === '/sitemap' || path === '/themes' || PRIVATE_ROUTE.test(pathname);
}

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(String(value || '{}'));
  } catch {
    return {};
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]);
}

function lastModified(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  try {
    return new Date(seconds * 1000).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function sitemapGroup(pathname) {
  if (pathname === '/') return 'Overview';
  if (pathname.startsWith('/docs/')) return 'Documentation';
  if (pathname.startsWith('/learn/')) return 'Learning';
  if (pathname.startsWith('/packages/')) return 'SDK resources';
  if (pathname === '/privacy' || pathname === '/terms') return 'Legal';
  return 'Other';
}

export async function resolvePublicSitemapEntries(db, site, request) {
  if (!db?.prepare || !site?.id) throw new Error('public_sitemap_database_unavailable');

  const origin = canonicalOrigin(request, site);
  const result = await db.prepare(`
    SELECT route_path, title, page_type, requires_auth, seo_json, published_at
    FROM cms_pages
    WHERE site_id = ? AND status = 'published' AND COALESCE(requires_auth, 0) = 0
    ORDER BY route_path ASC
    LIMIT 5000
  `).bind(site.id).all();

  const entries = new Map();
  const add = (rawPath, title, seo = {}, publishedAt = null) => {
    const pathname = normalizePublicPath(rawPath);
    if (!pathname || isExcludedPath(pathname)) return;

    const robots = String(seo?.robots || '').toLowerCase();
    if (/\bnoindex\b/.test(robots)) return;

    let location = new URL(pathname, origin);
    if (seo?.canonical) {
      let canonical;
      try {
        canonical = new URL(String(seo.canonical), origin);
      } catch {
        return;
      }
      if (canonical.origin !== origin || canonical.search || canonical.hash) return;
      const canonicalPath = normalizePublicPath(canonical.pathname);
      if (!canonicalPath || isExcludedPath(canonicalPath)) return;
      location = new URL(canonicalPath, origin);
    }

    const loc = location.toString();
    if (entries.has(loc)) return;
    entries.set(loc, {
      loc,
      path: location.pathname,
      title: String(title || location.pathname).slice(0, 200),
      lastmod: lastModified(publishedAt),
    });
  };

  for (const page of result?.results || []) {
    if (Number(page.requires_auth || 0) !== 0) continue;
    if (PRIVATE_PAGE_TYPES.has(String(page.page_type || '').toLowerCase())) continue;
    add(page.route_path, page.title, parseJson(page.seo_json), page.published_at);
  }

  // AgentSam's legal and SDK setup pages are static public documents rather
  // than cms_pages rows. Keep them in the same sitemap without exposing app
  // routes or assuming that every tenant has these pages.
  if (site.slug === 'agentsam-sdk') {
    for (const page of AGENTSAM_STATIC_PAGES) {
      add(page.path, page.title);
    }
  }

  return [...entries.values()].sort((a, b) => {
    if (a.path === '/') return -1;
    if (b.path === '/') return 1;
    return a.path.localeCompare(b.path);
  });
}

function renderSitemapXml(entries) {
  const urls = entries.map(entry =>
    `  <url><loc>${escapeXml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function renderSitemapHtml(site, entries, origin) {
  const siteName = site.slug === 'agentsam-sdk'
    ? 'AgentSam Local Studio'
    : String(site.name || site.slug || 'Website');
  const grouped = new Map();
  for (const entry of entries) {
    const group = sitemapGroup(entry.path);
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(entry);
  }
  const order = ['Overview', 'Documentation', 'Learning', 'SDK resources', 'Legal', 'Other'];
  const sections = order.filter(group => grouped.has(group)).map(group => {
    const links = grouped.get(group).map(entry =>
      `<li><a href="${escapeHtml(entry.loc)}">${escapeHtml(entry.title)}</a><span>${escapeHtml(entry.path)}</span></li>`
    ).join('');
    return `<section aria-labelledby="group-${escapeHtml(group.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}"><h2 id="group-${escapeHtml(group.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${escapeHtml(group)}</h2><ul>${links}</ul></section>`;
  }).join('');

  const operatorLine = site.slug === 'agentsam-sdk'
    ? '<p class="operator">AgentSam Local Studio is operated by Inner Animal Media.</p>'
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sitemap | ${escapeHtml(siteName)}</title>
  <meta name="description" content="Public pages and resources for ${escapeHtml(siteName)}.">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(origin)}/sitemap">
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#050b15; color:#edf4fb; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; background:radial-gradient(circle at 82% 0%, rgba(62,142,207,.16), transparent 32rem), linear-gradient(180deg,#07101c,#050912 70%); }
    main { width:min(920px,100%); margin:0 auto; padding:clamp(48px,8vw,92px) 24px 88px; }
    nav { color:#9fb0c1; font-size:13px; margin-bottom:30px; }
    nav a, a { color:#9bd3ff; text-decoration:none; }
    nav a:hover, a:hover { text-decoration:underline; }
    .eyebrow { color:#83c8ff; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }
    h1 { font-size:clamp(34px,6vw,58px); letter-spacing:-.055em; line-height:1; margin:12px 0 16px; }
    .intro { color:#b5c3d1; font-size:17px; line-height:1.6; max-width:680px; }
    .operator { color:#91a6b8; font-size:13px; margin:12px 0 0; }
    .xml { display:inline-flex; margin:24px 0 36px; border:1px solid rgba(139,201,247,.3); border-radius:8px; padding:10px 14px; font-size:13px; font-weight:650; }
    .groups { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
    section { min-width:0; border:1px solid rgba(142,184,220,.16); border-radius:14px; padding:20px; background:rgba(13,25,40,.72); }
    h2 { margin:0 0 14px; font-size:15px; letter-spacing:-.01em; }
    ul { list-style:none; display:grid; gap:12px; padding:0; margin:0; }
    li { display:grid; gap:3px; min-width:0; }
    li a { font-size:14px; font-weight:650; overflow-wrap:anywhere; }
    li span { color:#8295a8; font-size:11px; overflow-wrap:anywhere; }
    .note { color:#8295a8; font-size:12px; line-height:1.6; margin:30px 0 0; }
    @media(max-width:640px) { .groups { grid-template-columns:1fr; } main { padding-top:42px; } }
  </style>
</head>
<body>
  <main>
    <nav><a href="/">${escapeHtml(siteName)}</a> / Sitemap</nav>
    <p class="eyebrow">Public site index</p>
    <h1>Sitemap</h1>
    <p class="intro">Browse the published public pages and resources for ${escapeHtml(siteName)}.</p>
    ${operatorLine}
    <a class="xml" href="${escapeHtml(new URL('/sitemap.xml', origin).toString())}">Machine-readable XML sitemap ↗</a>
    <div class="groups">${sections || '<p>No public pages have been published yet.</p>'}</div>
    <p class="note">Only published, indexable public pages are listed. Signed-in workspaces, administration, authentication, APIs, and other protected routes are excluded.</p>
  </main>
</body>
</html>`;
}

export async function servePublicSearchDiscovery(request, env, site, pathname) {
  if (!isPublicSearchDiscoveryPath(pathname)) return null;

  const origin = canonicalOrigin(request, site);
  if (pathname === '/sitemap/') {
    return Response.redirect(new URL('/sitemap', origin).toString(), 301);
  }

  if (pathname === '/robots.txt') {
    const body = [
      'User-agent: *',
      'Disallow: /admin/',
      'Disallow: /api/',
      'Disallow: /auth/',
      `Sitemap: ${origin}/sitemap.xml`,
      '',
    ].join('\n');
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  try {
    const entries = await resolvePublicSitemapEntries(env?.DB, site, request);
    if (pathname === '/sitemap.xml') {
      return new Response(renderSitemapXml(entries), {
        status: 200,
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'cache-control': 'public, max-age=300, s-maxage=300',
          'x-content-type-options': 'nosniff',
        },
      });
    }

    return new Response(renderSitemapHtml(site, entries, origin), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300, s-maxage=300',
        'x-robots-tag': 'index, follow',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Public sitemap generation failed:', String(error?.message || error));
    return new Response('Public sitemap temporarily unavailable', {
      status: 503,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }
}
