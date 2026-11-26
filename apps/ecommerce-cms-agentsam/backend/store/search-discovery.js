/**
 * Public search-engine discovery files for the CMS site resolved from the
 * requested hostname. Each website publishes only its own pages and products.
 */
import { loadStorePreferences, normalizeSiteDomain } from "../admin/store.js";

export function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textResponse(request, text, contentType, status = 200, extraHeaders = {}) {
  return new Response(request.method === "HEAD" ? null : text, {
    status,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

function validLastmod(value) {
  if (!value) return null;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

/** Handles only /robots.txt and /sitemap.xml. */
export async function handlePublicSearchDiscovery(request, env, url) {
  if (url.pathname !== "/robots.txt" && url.pathname !== "/sitemap.xml") return null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }

  const sitePrefs = await loadStorePreferences(env, { hostname: url.hostname, allowCache: false });
  const site = sitePrefs?.ok === true ? sitePrefs.site : null;
  const domain = normalizeSiteDomain(site?.primary_domain);
  const origin = site && domain ? url.origin : "";
  const passwordProtected = sitePrefs?.ok === true && sitePrefs.settings?.passwordProtection === true;
  const siteNoindex = sitePrefs?.ok === true && String(sitePrefs.seo?.robots || "").toLowerCase().includes("noindex");
  if (!origin || !site) {
    return textResponse(request, "This hostname is not connected to a CMS storefront.\n", "text/plain; charset=utf-8", 404);
  }

  if (url.pathname === "/robots.txt") {
    if (passwordProtected) {
      return textResponse(request, "User-agent: *\nDisallow: /\n", "text/plain; charset=utf-8", 200, {
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex, nofollow",
      });
    }
    const body = [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /api",
      "Disallow: /account",
      "Disallow: /cart",
      "Disallow: /checkout",
      "Disallow: /go",
      "Disallow: /order-confirmation",
      "Disallow: /review/",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n");
    return textResponse(request, body, "text/plain; charset=utf-8");
  }

  if (passwordProtected || siteNoindex) {
    return textResponse(
      request,
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n`,
      "application/xml; charset=utf-8",
      200,
      { "cache-control": "private, no-store", "x-robots-tag": passwordProtected ? "noindex, nofollow" : "noindex, follow" },
    );
  }

  if (!env?.DB) return textResponse(request, "Sitemap is unavailable.\n", "text/plain; charset=utf-8", 503);
  try {
    const [products, pages] = await Promise.all([
      env.DB.prepare("SELECT slug, updated_at FROM products WHERE site_id = ? AND status = 'active' ORDER BY slug LIMIT 48000").bind(site.id).all(),
      env.DB.prepare("SELECT route_path FROM cms_pages WHERE site_id = ? AND status = 'published' AND slug <> 'site' AND lower(COALESCE(robots,'')) NOT LIKE '%noindex%' AND lower(COALESCE(json_extract(seo_json,'$.robots'),'')) NOT LIKE '%noindex%' ORDER BY sort_order,slug").bind(site.id).all(),
    ]);
    const urls = new Map();
    for (const page of pages.results || []) {
      const routePath = String(page.route_path || "").trim();
      if (!routePath.startsWith("/") || routePath.startsWith("//") || /[?#\\\u0000-\u001f]/.test(routePath)) continue;
      urls.set(`${origin}${routePath}`, null);
    }
    for (const product of products.results || []) {
      const slug = String(product.slug || "");
      if (!/^[a-z0-9][a-z0-9-]{0,179}$/i.test(slug)) continue;
      urls.set(`${origin}/products/${encodeURIComponent(slug)}`, validLastmod(product.updated_at));
    }
    const items = [...urls.entries()].map(([loc, lastmod]) =>
      `  <url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`,
    ).join("\n");
    return textResponse(
      request,
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`,
      "application/xml; charset=utf-8",
    );
  } catch (error) {
    console.error("[search-discovery] sitemap query failed", error?.message || error);
    return textResponse(request, "Sitemap is temporarily unavailable.\n", "text/plain; charset=utf-8", 503);
  }
}
