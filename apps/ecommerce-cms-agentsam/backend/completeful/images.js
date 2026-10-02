// Only public provider catalog images may cross this boundary. Never proxy
// arbitrary URLs, credentials, redirects, uploads, or customer artwork.
const WIDTHS = new Set([320, 640, 1200]);
export function catalogImageSource(value, env = {}) {
  try {
    const url = new URL(value);
    const origins = (env.CATALOG_IMAGE_ORIGINS || "https://jvkydnvdajcfnqysmuwt.supabase.co").split(",");
    if (url.protocol !== "https:" || url.username || url.password || url.search ||
        !origins.includes(url.origin) ||
        !url.pathname.startsWith("/storage/v1/object/public/product-images/")) return null;
    return url.href;
  } catch { return null; }
}
export async function serveCatalogImage(request, env, ctx) {
  const url = new URL(request.url);
  const source = catalogImageSource(url.searchParams.get("src"), env);
  const width = Number(url.searchParams.get("w") || 640);
  if (!source || !WIDTHS.has(width)) return new Response("Invalid catalog image", { status: 400 });
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const key = new Request(new URL("/catalog-image?w=" + width + "&src=" + encodeURIComponent(source), url.origin));
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  let upstream;
  let optimized = false;
  try {
    upstream = await fetch(source, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "image/avif,image/webp,image/png,image/*" },
      cf: { cacheEverything: true, cacheTtl: 86400 },
    });
    if (!upstream.ok || !upstream.headers.get("content-type")?.startsWith("image/")) throw new Error("Image unavailable");
  } catch {
    try {
      // Keep the provider image available if an edge cache option is rejected.
      upstream = await fetch(source, { signal: AbortSignal.timeout(15000) });
    } catch { return new Response("Image temporarily unavailable", { status: 502 }); }
  }
  if (!upstream.ok || !upstream.headers.get("content-type")?.startsWith("image/"))
    return new Response("Image unavailable", { status: 502 });
  const response = new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type"),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      "X-Catalog-Image": optimized ? "optimized" : "original-fallback",
    },
  });
  // Cache API is used here for the sanitized, public derivative response;
  // admin HTML and authenticated API responses must never enter this cache.
  ctx.waitUntil(cache.put(key, response.clone()).catch(() => {}));
  return response;
}
