import { loadStorePreferences } from "./store.js";
import { normalizeSiteDomain } from "./store.js";

export async function getStoreSearchDiscovery(env, accountId = null, siteId = null) {
  if (!env?.DB) {
    return Response.json({ error: "database_unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
  const prefs = await loadStorePreferences(env, { accountId, siteId, allowCache: false });
  if (!prefs.ok) {
    return Response.json({ error: prefs.error || "store_site_not_found" }, { status: 409, headers: { "cache-control": "private, no-store" } });
  }
  const site = prefs.site;
  const domain = normalizeSiteDomain(site?.primary_domain);
  if (!domain) {
    return Response.json({ error: "storefront_https_domain_required" }, { status: 409, headers: { "cache-control": "private, no-store" } });
  }
  const origin = `https://${domain}`;
  try {
    const [activeProducts, publishedPages] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE site_id = ? AND status = 'active'").bind(site.id).first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM cms_pages WHERE site_id = ? AND status = 'published' AND slug <> 'site' AND lower(COALESCE(robots,'')) NOT LIKE '%noindex%' AND lower(COALESCE(json_extract(seo_json,'$.robots'),'')) NOT LIKE '%noindex%'").bind(site.id).first(),
    ]);
    const activeProductCount = Number(activeProducts?.n || 0);
    const publishedPageCount = Number(publishedPages?.n || 0);
    const passwordProtected = prefs.settings.passwordProtection === true;
    const noindex = String(prefs.seo?.robots || "").toLowerCase().includes("noindex");
    const sitemapCount = passwordProtected || noindex ? 0 : publishedPageCount + activeProductCount;
    return Response.json({
      ok: true,
      site: {
        id: site.id,
        name: site.name || null,
        origin,
        domain,
        robots_url: `${origin}/robots.txt`,
        sitemap_url: `${origin}/sitemap.xml`,
      },
      public_discovery: {
        indexable_routes: publishedPageCount,
        active_products: activeProductCount,
        sitemap_url_count: sitemapCount,
        sitemap_truncated: activeProductCount > 48000,
        password_protected: passwordProtected,
        noindex,
      },
      crawler_authority: "AgentSam CMS",
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[search-discovery] site summary failed", error?.message || error);
    return Response.json({ error: "search_discovery_unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
}
