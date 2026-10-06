(function () {
  const root = document.getElementById("pdp-root");
  if (!root) return;

  function getProductSlug() {
    const fromQuery = new URLSearchParams(location.search).get("slug");
    if (fromQuery) return fromQuery.trim();
    const match = location.pathname.match(/^\/products\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  const slug = getProductSlug();

  let product = null;
  let variants = [];
  let selectedVariant = null;

  function money(cents) {
    return "$" + (Number(cents) / 100).toFixed(2);
  }

  function formatPrice(cents) {
    if (!cents || cents <= 0) return { label: "Price coming soon", tbd: true };
    return { label: money(cents), tbd: false };
  }

  function setMeta(p) {
    if (!p) return;
    document.title = `${p.title} – Fuel & Free Time`;
    const desc = (p.description || `${p.title} — Fuel & Free Time apparel.`).slice(0, 160);
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "description";
      document.head.appendChild(tag);
    }
    tag.content = desc;
    const img = p.primary_image || p.image_url;
    if (img) {
      for (const prop of ["og:image", "twitter:image"]) {
        let og = document.querySelector(`meta[property="${prop}"]`);
        if (!og) {
          og = document.createElement("meta");
          og.setAttribute("property", prop);
          document.head.appendChild(og);
        }
        og.content = img.startsWith("http") ? img : location.origin + img;
      }
    }
  }

  function renderLoading() {
    root.innerHTML = `
      <div class="pdp-loading">
        <div class="pdp-skel line sm"></div>
        <div class="pdp-loading-grid">
          <div class="pdp-skel hero"></div>
          <div>
            <div class="pdp-skel line sm"></div>
            <div class="pdp-skel line lg"></div>
            <div class="pdp-skel line"></div>
            <div class="pdp-skel line"></div>
          </div>
        </div>
      </div>`;
  }

  function renderError(message) {
    root.innerHTML = `
      <div class="pdp-error-wrap">
        <h1>Product not found</h1>
        <p>${message || "This item may have moved or is not available yet."}</p>
        <a class="pdp-btn primary" href="/shop">Back to shop</a>
      </div>`;
  }

  function purchaseReady() {
    return variants.some((v) => v.inventory_qty > 0);
  }

  function displayPriceCents() {
    if (selectedVariant?.price_cents > 0) return selectedVariant.price_cents;
    const variantPrice = variants.find((v) => v.price_cents > 0)?.price_cents;
    if (variantPrice) return variantPrice;
    return product?.price_cents || 0;
  }

  function render() {
    const images = product.images?.length
      ? product.images
      : [{ url: product.primary_image || product.image_url, is_primary: 1 }];
    const mainImg = images[0]?.url || "";
    const thumbs = images
      .map(
        (img, i) =>
          `<button type="button" class="pdp-thumb ${i === 0 ? "active" : ""}" data-url="${img.url}" aria-label="View image ${i + 1}"><img src="${img.url}" alt=""></button>`
      )
      .join("");

    const canBuy = purchaseReady();
    const price = formatPrice(displayPriceCents());

    let sizeSection = "";
    if (variants.length) {
      const sizeButtons = variants
        .map((v) => {
          const disabled = v.inventory_qty <= 0;
          return `<button type="button" class="pdp-size ${disabled ? "disabled" : ""}" data-id="${v.id}" data-size="${v.size}" ${disabled ? "disabled" : ""}>${v.size || v.sku}</button>`;
        })
        .join("");
      sizeSection = `
        <div class="pdp-field">
          <label>Size</label>
          <div class="pdp-sizes" id="pdp-sizes">${sizeButtons}</div>
        </div>`;
    } else {
      sizeSection = `
        <div class="pdp-unavailable">
          Sizes and inventory are being set up for this item. Check back soon or browse the rest of the shop.
        </div>`;
    }

    root.innerHTML = `
      <nav class="pdp-crumb" aria-label="Breadcrumb"><a href="/shop">Shop</a> / <span>${product.title}</span></nav>
      <div class="pdp-layout">
        <div class="pdp-gallery">
          <div class="pdp-main"><img id="pdp-main-img" src="${mainImg}" alt="${product.title}"></div>
          ${images.length > 1 ? `<div class="pdp-thumbs">${thumbs}</div>` : ""}
        </div>
        <div class="pdp-buy">
          <p class="pdp-drop-label">Small-batch release</p>
          <p class="pdp-kicker">${product.collection || "Essentials"}</p>
          <h1>${product.title}</h1>
          <p class="pdp-price ${price.tbd ? "is-tbd" : ""}">${price.label}</p>
          ${product.description ? `<p class="pdp-desc">${product.description}</p>` : ""}
          ${sizeSection}
          <div class="pdp-actions">
            <button type="button" class="pdp-btn primary" id="pdp-add" ${canBuy ? "" : "disabled"}>${canBuy ? "Add to Cart" : "Unavailable"}</button>
            ${cartIconButton()}
          </div>
          <p class="pdp-note" id="pdp-stock"></p>
          ${canBuy ? `<p class="pdp-checkout-note">Secure checkout powered by Stripe.</p>` : ""}
          <div class="pdp-assurances" aria-label="Purchase benefits">
            <div><strong>Live availability</strong><span>Inventory is checked again at checkout.</span></div>
            <div><strong>Secure payment</strong><span>Payment details stay with Stripe.</span></div>
            <div><strong>Built for the long haul</strong><span>Premium blanks and durable decoration.</span></div>
          </div>
        </div>
      </div>
      <section class="pdp-story">
        <p class="pdp-kicker">The piece, in context</p>
        <h2>Made for the hours after the work is done.</h2>
        <p>Every Fuel & Free Time piece starts with the same idea: what you wear off the clock should feel as considered as the work that bought you that freedom.</p>
      </section>
      <section class="pdp-related" id="pdp-related" hidden></section>`;

    bind();
    updateCartBadge();
    loadRelated();
  }

  function bind() {
    document.querySelectorAll(".pdp-thumb").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("pdp-main-img").src = btn.dataset.url;
        document.querySelectorAll(".pdp-thumb").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    document.querySelectorAll(".pdp-size:not(.disabled)").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".pdp-size").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedVariant = variants.find((v) => String(v.id) === btn.dataset.id);
        document.getElementById("pdp-add").disabled = !selectedVariant;
        const stock = document.getElementById("pdp-stock");
        const priceEl = document.querySelector(".pdp-price");
        if (selectedVariant && priceEl) {
          const p = formatPrice(selectedVariant.price_cents || product.price_cents);
          priceEl.textContent = p.label;
          priceEl.classList.toggle("is-tbd", p.tbd);
        }
        if (selectedVariant && stock) {
          stock.textContent =
            selectedVariant.inventory_qty <= 5
              ? `Only ${selectedVariant.inventory_qty} left in ${selectedVariant.size}`
              : `${selectedVariant.inventory_qty} in stock`;
        }
      });
    });

    const available = variants.filter((v) => v.inventory_qty > 0);
    if (available.length === 1) {
      const btn = document.querySelector(`.pdp-size[data-id="${available[0].id}"]`);
      btn?.click();
    }

    document.getElementById("pdp-add")?.addEventListener("click", () => {
      if (!selectedVariant || !window.FNF_STORE) return;
      window.FNF_STORE.addItem({
        variant_id: selectedVariant.id,
        product_id: product.id,
        slug: product.slug,
        title: product.title,
        size: selectedVariant.size,
        price_cents: selectedVariant.price_cents || product.price_cents,
        image: product.primary_image || product.image_url,
        qty: 1,
      });
      updateCartBadge();
      const btn = document.getElementById("pdp-add");
      btn.textContent = "Added ✓";
      setTimeout(() => {
        btn.textContent = "Add to Cart";
      }, 1200);
    });
  }

  async function loadRelated() {
    const section = document.getElementById("pdp-related");
    if (!section || !product) return;
    try {
      const res = await fetch("/api/store/products");
      const data = await res.json();
      const others = (data.products || []).filter((p) => p.slug !== product.slug).slice(0, 4);
      if (!others.length) return;
      section.hidden = false;
      section.innerHTML = `
        <h2>More from the shop</h2>
        <div class="pdp-related-grid">
          ${others
            .map(
              (p) => `
            <a class="pdp-related-card" href="/products/${p.slug}">
              <img src="${p.primary_image || p.image_url}" alt="${p.title}" loading="lazy">
              <div><strong>${p.title}</strong><span>${money(p.price_cents)}</span></div>
            </a>`
            )
            .join("")}
        </div>`;
    } catch {
      /* optional */
    }
  }

  function updateCartBadge() {
    const n = window.FNF_STORE?.cartCount() || 0;
    document.querySelectorAll("[data-cart-count]").forEach((badge) => {
      badge.textContent = String(n);
      badge.hidden = n === 0;
    });
    window.FNF_SHELL?.updateCartBadge?.();
  }

  function cartIconButton() {
    const svg = window.FNF_SHELL?.CART_SVG || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>`;
    const n = window.FNF_STORE?.cartCount() || 0;
    return `<a class="pdp-btn icon" href="/cart" aria-label="View cart">${svg}<span class="fnf-cart-count" data-cart-count ${n ? "" : "hidden"}>${n}</span></a>`;
  }

  document.addEventListener("fnf:cart-updated", updateCartBadge);

  if (!slug) {
    renderError("No product was specified.");
    return;
  }

  renderLoading();

  fetch("/api/store/products/" + encodeURIComponent(slug))
    .then(async (r) => {
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || "Not found");
      return data;
    })
    .then((data) => {
      product = data.product;
      variants = data.variants || [];
      root.dataset.hProduct = product.slug;
      setMeta(product);
      render();
    })
    .catch((err) => {
      renderError(err.message === "Product not found" ? "We couldn't find that product in our catalog." : err.message);
    });
})();
