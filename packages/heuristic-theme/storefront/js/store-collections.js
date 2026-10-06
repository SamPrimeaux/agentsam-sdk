(function () {
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const money = (cents) => Number(cents) > 0 ? "$" + (Number(cents) / 100).toFixed(2) : "Coming soon";

  function collectionSlug() {
    const query = new URLSearchParams(location.search).get("slug");
    if (query) return query;
    return location.pathname.match(/^\/shop\/collections\/([^/]+)/)?.[1] || "";
  }

  async function loadIndex(grid) {
    try {
      const response = await fetch("/api/store/collections");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Collections unavailable");
      grid.innerHTML = (data.collections || []).map((collection) => `
        <a class="collections-tile" data-h-collection="${esc(collection.slug)}" href="/shop/collections/${encodeURIComponent(collection.slug)}">
          <img src="${esc(collection.image_url || "")}" alt="${esc(collection.title)}" loading="lazy">
          <div class="collections-tile__copy"><p class="h-eyebrow">${esc(collection.eyebrow || "Collection")}</p><h2>${esc(collection.title)}</h2><p>${esc(collection.description)} · ${Number(collection.product_count || 0)} pieces</p></div>
        </a>`).join("");
    } catch (error) { grid.innerHTML = `<div class="collection-error"><div><h2>Collections are tuning up.</h2><p>${esc(error.message)}</p></div></div>`; }
  }

  async function loadDetail(root) {
    const slug = collectionSlug();
    if (!slug) return;
    try {
      const response = await fetch(`/api/store/collections/${encodeURIComponent(slug)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Collection not found");
      const collection = data.collection;
      document.title = `${collection.title} — Fuel & Free Time`;
      document.querySelector('meta[name="description"]').content = collection.seo_description || collection.description;
      root.innerHTML = `
        <section class="collection-hero" data-h-section="hero.collection" data-h-section-id="collection-hero" data-h-motion="blur-recede" data-h-motion-intensity="0.3" data-h-header="ghost-light" style="--collection-accent:${esc(collection.accent_color || "#ff4d00")}"><div class="collection-hero__media"><img src="${esc(collection.image_url || "")}" alt=""></div><div class="h-container"><div class="collection-hero__copy"><p class="h-eyebrow">${esc(collection.eyebrow || "Fuel & Free Time")}</p><h1 class="h-display">${esc(collection.title)}</h1><p>${esc(collection.description)}</p><a class="h-button" data-h-collection="${esc(collection.slug)}" href="#collection-products">Shop this collection <span aria-hidden="true">↓</span></a></div></div></section>
        <section class="collection-products h-container" id="collection-products" data-h-section="products.grid" data-h-section-id="collection-products" data-h-motion="none" data-h-header="glass-dark"><header class="collection-products__head"><div><p class="h-eyebrow">The edit</p><h2>${esc(collection.title)} gear</h2></div><p>${Number(data.products?.length || 0)} ${data.products?.length === 1 ? "piece" : "pieces"}</p></header><div class="collection-products__grid">${(data.products || []).map((product) => `<a class="collection-product" data-h-product="${esc(product.slug)}" href="/products/${encodeURIComponent(product.slug)}"><div class="collection-product__media"><img src="${esc(product.primary_image || product.image_url || "")}" alt="${esc(product.title)}" loading="lazy"></div><div class="collection-product__meta"><strong>${esc(product.title)}</strong><span>${money(product.price_cents)}</span></div></a>`).join("") || '<div class="collection-empty"><h3>The collection is staged.</h3><p>Products will appear here as they are assigned from the catalog.</p><a class="h-button" href="/shop">Shop all gear</a></div>'}</div></section>`;
      document.dispatchEvent(new CustomEvent("heuristic:refresh"));
    } catch (error) { root.innerHTML = `<div class="collection-error"><div><p class="h-eyebrow">Collection unavailable</p><h1>${esc(error.message)}</h1><a class="h-button" href="/shop/collections">Browse collections</a></div></div>`; }
  }

  const grid = document.getElementById("collections-grid");
  const root = document.getElementById("collection-root");
  if (grid) loadIndex(grid);
  if (root) loadDetail(root);
})();
