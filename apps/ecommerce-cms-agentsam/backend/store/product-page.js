import { collectionScope } from "../cms/collection-store.mjs";

/** Resolve a public product only inside the storefront selected by its host. */
export async function resolvePublicProductRoute(env, slug, requestUrl, resolveSite = collectionScope) {
  const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
  const site = await resolveSite(env, { hostname: url.hostname });
  if (!site?.id) return { site: null, product: null, redirectSlug: null };

  const product = await env.DB.prepare(
    "SELECT slug, title, description, seo_title, seo_description, image_url FROM products WHERE slug = ? AND site_id = ? AND status = 'active' LIMIT 1"
  ).bind(slug, site.id).first();
  if (product) return { site, product, redirectSlug: null };

  const redirect = await env.DB.prepare(
    "SELECT p.slug FROM product_slug_redirects r JOIN products p ON p.id = r.product_id WHERE r.old_slug = ? AND p.site_id = ? AND p.status = 'active' LIMIT 1"
  ).bind(slug, site.id).first();
  return { site, product: null, redirectSlug: redirect?.slug || null };
}
