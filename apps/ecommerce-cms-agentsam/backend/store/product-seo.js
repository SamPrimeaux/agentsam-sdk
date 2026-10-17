/**
 * Product-specific SEO metadata, server-rendered before crawlers receive HTML.
 * Product Editor controls overrides; product title/description are safe fallbacks.
 */
const attr = (value) => String(value || "")
  .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function decorateProductPage(response, product, requestUrl) {
  const title = String(product.seo_title || product.title || "Product").trim();
  const description = String(product.seo_description || product.description || "").trim();
  const canonical = new URL("/products/" + encodeURIComponent(product.slug), requestUrl).toString();
  let image = "";
  if (product.image_url) {
    try {
      const candidate = new URL(product.image_url, requestUrl);
      if (["http:", "https:"].includes(candidate.protocol)) image = candidate.toString();
    } catch { /* No photo: avoid imaginary OG image. */ }
  }
  const meta = [
    '<meta property="og:type" content="product">',
    '<meta property="og:title" content="' + attr(title) + '">',
    '<meta property="og:description" content="' + attr(description) + '">',
    '<meta property="og:url" content="' + attr(canonical) + '">',
    '<link rel="canonical" href="' + attr(canonical) + '">',
    image ? '<meta property="og:image" content="' + attr(image) + '">' : "",
  ].join("");

  return new HTMLRewriter()
    .on("title", { element(element) { element.setInnerContent(title); } })
    .on('meta[name="description"]', {
      element(element) { element.setAttribute("content", description); }
    })
    .on("head", { element(element) { element.append(meta, { html: true }); } })
    .transform(response);
}
