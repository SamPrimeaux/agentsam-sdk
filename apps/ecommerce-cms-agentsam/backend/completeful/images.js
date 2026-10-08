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
function preferredCatalogFormat(accept = "") {
  const value = String(accept).toLowerCase();
  if (value.includes("image/avif")) return "avif";
  if (value.includes("image/webp")) return "webp";
  return null;
}

export async function serveCatalogImage(request, env, ctx) {
  const url = new URL(request.url);
  const source = catalogImageSource(url.searchParams.get("src"), env);
  const width = Number(url.searchParams.get("w") || 640);
  if (!source || !WIDTHS.has(width)) return new Response("Invalid catalog image", { status: 400 });
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const format = preferredCatalogFormat(request.headers.get("accept"));
  const keyUrl = new URL("/catalog-image", url.origin);
  keyUrl.searchParams.set("w", String(width));
  keyUrl.searchParams.set("fmt", format || "source");
  keyUrl.searchParams.set("src", source);
  const key = new Request(keyUrl);

  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;

  let upstream;
  let optimized = false;
  try {
    const image = {
      width,
      fit: "scale-down",
      quality: width <= 320 ? 78 : width <= 640 ? 82 : 86,
      ...(format ? { format } : {}),
    };
    upstream = await fetch(source, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: request.headers.get("accept") || "image/avif,image/webp,image/png,image/*" },
      cf: {
        image,
        cacheEverything: true,
        cacheTtl: 86400,
      },
    });
    if (!upstream.ok || !upstream.headers.get("content-type")?.startsWith("image/")) {
      throw new Error("Image unavailable");
    }
    optimized = true;
  } catch {
    try {
      // Fail open to the sanitized provider original when Image Resizing is
      // unavailable for this zone/origin. The response advertises the fallback
      // so production checks can tell whether real derivatives are active.
      upstream = await fetch(source, { signal: AbortSignal.timeout(15000) });
    } catch {
      return new Response("Image temporarily unavailable", { status: 502 });
    }
  }
  if (!upstream.ok || !upstream.headers.get("content-type")?.startsWith("image/")) {
    return new Response("Image unavailable", { status: 502 });
  }

  const response = new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type"),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Vary": "Accept",
      "X-Content-Type-Options": "nosniff",
      "X-Catalog-Image": optimized ? "optimized" : "original-fallback",
      "X-Catalog-Width": String(width),
    },
  });
  // Cache API is used here for the sanitized, public derivative response;
  // admin HTML and authenticated API responses must never enter this cache.
  ctx.waitUntil(cache.put(key, response.clone()).catch(() => {}));
  return response;
}
