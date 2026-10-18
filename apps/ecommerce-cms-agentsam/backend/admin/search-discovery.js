import { getCompany } from "../lib/company.js";
import { INDEXABLE_STORE_ROUTES } from "../lib/route-manifest.js";
import { configuredSiteOrigin } from "../store/search-discovery.js";

export async function getStoreSearchDiscovery(env) {
  if (!env?.DB) {
    return Response.json({ error: "database_unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
  const company = await getCompany(env);
  const origin = configuredSiteOrigin(company);
  if (!origin) {
    return Response.json({ error: "storefront_https_domain_required" }, { status: 409, headers: { "cache-control": "private, no-store" } });
  }
  try {
    const activeProducts = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM products WHERE status = 'active'",
    ).first();
    const activeProductCount = Number(activeProducts?.n || 0);
    const sitemapProductLimit = 48000;
    return Response.json({
      ok: true,
      site: {
        name: company?.name || null,
        origin,
        domain: new URL(origin).hostname,
        robots_url: `${origin}/robots.txt`,
        sitemap_url: `${origin}/sitemap.xml`,
      },
      public_discovery: {
        indexable_routes: INDEXABLE_STORE_ROUTES.length,
        active_products: activeProductCount,
        sitemap_url_count: INDEXABLE_STORE_ROUTES.length + Math.min(activeProductCount, sitemapProductLimit),
        sitemap_truncated: activeProductCount > sitemapProductLimit,
      },
      crawler_binding_present: Boolean(env.AGENTSAM_SITE_SCRAPE),
      crawler_capability: "site.scrape",
      crawler_authority: "AgentSam SDK",
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[search-discovery] admin summary failed", error?.message || error);
    return Response.json({ error: "search_discovery_unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
}
