/**
 * Public search-engine discovery files. FNF contributes its configured site
 * origin and real public catalog/routes; this module is not a crawl engine.
 */
import { getCompany } from "../lib/company.js";
import { INDEXABLE_STORE_ROUTES } from "../lib/route-manifest.js";

export function configuredSiteOrigin(company) {
  const raw = String(company?.websiteUrl || "").trim();
  if (!raw) return null;
  let site;
  try {
    site = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = site.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipLiteral = host.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  const localName = host === "localhost" || /\.(?:localhost|local|internal|test|invalid|example)$/.test(host);
  const validHost = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host);
  if (site.protocol !== "https:" || site.username || site.password || site.port || ipLiteral || localName || !validHost) return null;
  return `https://${host}`;
}

export function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textResponse(request, text, contentType, status = 200) {
  return new Response(request.method === "HEAD" ? null : text, {
    status,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff",
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

  const company = await getCompany(env);
  const origin = configuredSiteOrigin(company);
  if (!origin) {
    return textResponse(request, "Storefront HTTPS domain is not configured.\n", "text/plain; charset=utf-8", 503);
  }

  if (url.pathname === "/robots.txt") {
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

  if (!env?.DB) return textResponse(request, "Sitemap is unavailable.\n", "text/plain; charset=utf-8", 503);
  try {
    const products = await env.DB.prepare(
      "SELECT slug, updated_at FROM products WHERE status = 'active' ORDER BY slug LIMIT 48000",
    ).all();
    const urls = new Map();
    for (const route of INDEXABLE_STORE_ROUTES) {
      urls.set(`${origin}${route.path}`, null);
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
