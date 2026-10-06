(function () {
  const CART_KEY = "fnf_cart";
  const WISHLIST_KEY = "fnf_wishlist";
  let products = [];
  let filter = "all";
  let sort = "featured";

  const money = (cents) => (Number(cents) > 0 ? "$" + (Number(cents) / 100).toFixed(2) : "Coming soon");
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const slugify = (value) => String(value || "essentials").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  function wishlist() {
    try { return new Set(JSON.parse(localStorage.getItem(WISHLIST_KEY) || "[]")); }
    catch { return new Set(); }
  }

  function card(p) {
    const collection = slugify(p.collection);
    const inventory = Number(p.total_inventory || 0);
    const sizes = String(p.sizes || "").split(",").filter(Boolean);
    const article = document.createElement("article");
    article.className = "fft-card";
    article.dataset.hProduct = p.slug;
    article.dataset.collection = collection;
    article.dataset.price = String(Number(p.price_cents || 0));
    article.dataset.title = p.title || "";
    article.innerHTML = `
      <div class="fft-media">
        <button class="fft-wish ${wishlist().has(String(p.id)) ? "on" : ""}" type="button" data-wish="${esc(p.id)}" aria-label="Save ${esc(p.title)}">♥</button>
        <a href="/products/${encodeURIComponent(p.slug)}" aria-label="View ${esc(p.title)}"><img class="fft-img" src="${esc(p.primary_image || p.image_url || "")}" alt="${esc(p.title)}" loading="lazy"></a>
        <div class="fft-badges">${inventory > 0 ? '<span class="fft-badge">Available</span>' : '<span class="fft-badge">Preview</span>'}${p.collection ? `<span class="fft-badge alt">${esc(p.collection)}</span>` : ""}</div>
      </div>
      <div class="fft-info"><div class="fft-title">${esc(p.title)}</div><div class="fft-meta"><span>${money(p.price_cents)}</span><span>${sizes.length ? `Sizes ${esc(sizes.join(" · "))}` : "Details inside"}</span></div>${inventory > 0 && inventory <= 5 ? `<p class="fft-fuelnote">Only ${inventory} left in this drop</p>` : ""}</div>
      <div class="fft-actions-row"><a class="fft-btn view" href="/products/${encodeURIComponent(p.slug)}">View details</a><button class="fft-btn buy" type="button" data-quickview="${esc(p.slug)}">Quick view</button></div>`;
    return article;
  }

  function visibleProducts() {
    const next = filter === "all" ? [...products] : products.filter((p) => slugify(p.collection) === filter);
    if (sort === "price-asc") next.sort((a, b) => Number(a.price_cents) - Number(b.price_cents));
    if (sort === "price-desc") next.sort((a, b) => Number(b.price_cents) - Number(a.price_cents));
    if (sort === "title") next.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    return next;
  }

  function renderCatalog() {
    const grid = document.getElementById("fft-grid");
    const status = document.getElementById("catalog-status");
    if (!grid) return;
    const visible = visibleProducts();
    grid.replaceChildren(...visible.map(card));
    if (status) status.textContent = `${visible.length} ${visible.length === 1 ? "piece" : "pieces"} in this view`;
    if (!visible.length) grid.innerHTML = '<div class="fft-empty-state"><h3>Nothing in this lane yet.</h3><p>Try another collection or check back after the next catalog sync.</p></div>';
  }

  function toggleWishlist(id, button) {
    const items = wishlist();
    items.has(id) ? items.delete(id) : items.add(id);
    localStorage.setItem(WISHLIST_KEY, JSON.stringify([...items]));
    button.classList.toggle("on", items.has(id));
  }

  function closeQuickView() {
    const modal = document.getElementById("fft-qv");
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  async function openQuickView(slug) {
    const modal = document.getElementById("fft-qv");
    if (!modal) return;
    const summary = products.find((p) => p.slug === slug);
    document.getElementById("fft-qv-title").textContent = summary?.title || "Loading…";
    document.getElementById("fft-qv-img").src = summary?.primary_image || summary?.image_url || "";
    document.getElementById("fft-qv-meta").textContent = money(summary?.price_cents);
    document.getElementById("fft-qv-description").textContent = summary?.description || "Select your size and see live availability on the product page.";
    document.getElementById("fft-qv-collection").textContent = summary?.collection || "Current drop";
    document.getElementById("fft-qv-link").href = `/products/${encodeURIComponent(slug)}`;
    document.getElementById("fft-qv-link").dataset.hProduct = slug;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    document.getElementById("fft-qv-close")?.focus();

    try {
      const response = await fetch(`/api/store/products/${encodeURIComponent(slug)}`);
      const data = await response.json();
      if (!response.ok || !data.product) return;
      document.getElementById("fft-qv-description").textContent = data.product.description || "Select your size and see live availability on the product page.";
    } catch { /* summary content is an intentional offline fallback */ }
  }

  function bindControls() {
    document.getElementById("catalog-chips")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((node) => node.classList.toggle("is-active", node === button));
      renderCatalog();
    });
    document.getElementById("catalog-sort")?.addEventListener("change", (event) => { sort = event.target.value; renderCatalog(); });
    document.getElementById("fft-grid")?.addEventListener("click", (event) => {
      const wish = event.target.closest("[data-wish]");
      if (wish) { toggleWishlist(String(wish.dataset.wish), wish); return; }
      const quick = event.target.closest("[data-quickview]");
      if (quick) openQuickView(quick.dataset.quickview);
    });
    document.getElementById("fft-qv-close")?.addEventListener("click", closeQuickView);
    document.getElementById("fft-qv")?.addEventListener("click", (event) => { if (event.target.id === "fft-qv") closeQuickView(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeQuickView(); });
  }

  async function loadProducts() {
    const grid = document.getElementById("fft-grid");
    if (!grid) return;
    try {
      const response = await fetch("/api/store/products");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Catalog unavailable");
      products = data.products || [];
      renderCatalog();
      document.dispatchEvent(new CustomEvent("fnf:catalog-ready", { detail: { count: products.length } }));
    } catch (error) {
      grid.innerHTML = `<div class="fft-empty-state"><h3>The shop is tuning up.</h3><p>${esc(error.message)}</p></div>`;
      const status = document.getElementById("catalog-status");
      if (status) status.textContent = "Catalog temporarily unavailable";
    }
  }

  window.FNF_STORE = {
    CART_KEY,
    getCart() { try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; } },
    setCart(items) { localStorage.setItem(CART_KEY, JSON.stringify(items)); document.dispatchEvent(new CustomEvent("fnf:cart-updated")); },
    addItem(item) { const items = this.getCart(); const found = items.find((entry) => entry.variant_id === item.variant_id); found ? found.qty += item.qty : items.push(item); this.setCart(items); },
    cartCount() { return this.getCart().reduce((total, item) => total + item.qty, 0); },
  };

  function init() { bindControls(); loadProducts(); }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
