(function () {
  const CART_KEY = "fnf_cart";
  const DISCOUNT_KEY = "fnf_discount";

  const CART_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>`;

  function money(cents) {
    return "$" + (Number(cents) / 100).toFixed(2);
  }

  function getCart() {
    return window.FNF_STORE?.getCart() || JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  }

  function getDiscount() {
    try {
      return JSON.parse(localStorage.getItem(DISCOUNT_KEY) || "null");
    } catch {
      return null;
    }
  }

  function setDiscount(data) {
    if (!data) localStorage.removeItem(DISCOUNT_KEY);
    else localStorage.setItem(DISCOUNT_KEY, JSON.stringify(data));
    renderTotals(getCart());
  }

  function setCart(items) {
    if (window.FNF_STORE) window.FNF_STORE.setCart(items);
    else localStorage.setItem(CART_KEY, JSON.stringify(items));
    render();
    updateBadge();
    window.FNF_SHELL?.updateCartBadge?.();
  }

  function updateBadge() {
    const cart = getCart();
    const n = cart.reduce((sum, i) => sum + i.qty, 0);
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(n);
      el.hidden = n === 0;
    });
    const countEl = document.getElementById("cart-item-count");
    if (countEl) {
      countEl.textContent = n === 1 ? "1 item" : `${n} items`;
    }
  }

  function renderCheckoutLines(cart) {
    const lines = document.getElementById("checkout-lines");
    if (!lines) return;
    lines.innerHTML = cart
      .map(
        (item) =>
          `<div class="checkout-line"><span>${item.qty}× ${item.title}${item.size ? " · " + item.size : ""}</span><strong>${money((item.price_cents || 0) * item.qty)}</strong></div>`
      )
      .join("");
  }

  function renderTotals(cart) {
    const subtotal = cart.reduce((sum, item) => sum + (item.price_cents || 0) * item.qty, 0);
    const shippingGoal = 7500;
    const discount = getDiscount();
    const discountCents = discount?.discount_cents || 0;
    const total = Math.max(0, subtotal - discountCents);

    const subtotalRow = document.getElementById("checkout-subtotal-row");
    const discountRow = document.getElementById("checkout-discount-row");
    const subtotalEl = document.getElementById("cart-subtotal");
    const discountEl = document.getElementById("cart-discount");
    const totalEl = document.getElementById("cart-total");

    if (subtotalRow) subtotalRow.hidden = !discount || discountCents <= 0;
    if (discountRow) discountRow.hidden = !discount || discountCents <= 0;
    if (subtotalEl) subtotalEl.textContent = money(subtotal);
    if (discountEl) discountEl.textContent = "−" + money(discountCents);
    if (totalEl) totalEl.textContent = money(total);

    const progress = document.getElementById("cart-progress");
    const progressBar = document.getElementById("cart-progress-bar");
    const progressLabel = document.getElementById("cart-progress-label");
    const progressValue = document.getElementById("cart-progress-value");
    if (progress) progress.hidden = cart.length === 0;
    if (progressBar) progressBar.style.width = `${Math.min(100, (subtotal / shippingGoal) * 100)}%`;
    if (progressLabel) progressLabel.textContent = subtotal >= shippingGoal ? "Shipping milestone unlocked." : "Build your order toward complimentary shipping.";
    if (progressValue) progressValue.textContent = subtotal >= shippingGoal ? "Ready" : `${money(shippingGoal - subtotal)} to go`;

    const codeInput = document.getElementById("checkout-discount");
    const msg = document.getElementById("checkout-discount-msg");
    if (codeInput && discount?.code && !codeInput.value) codeInput.value = discount.code;
    if (msg && discount?.message) {
      msg.textContent = discount.message;
      msg.className = "checkout-promo-msg ok";
    }
  }

  function render() {
    const root = document.getElementById("cart-root");
    const form = document.getElementById("checkout-form");
    if (!root) return;

    const cart = getCart();
    updateBadge();

    if (!cart.length) {
      root.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-icon">${CART_SVG}</div>
          <h2>Your cart is empty</h2>
          <p>Add something from the shop — your picks stay saved on this device until checkout.</p>
          <a class="store-btn" href="/shop">Browse the shop</a>
        </div>`;
      if (form) form.hidden = true;
      return;
    }

    if (form) form.hidden = false;
    let total = 0;
    root.innerHTML = cart
      .map((item, idx) => {
        const line = (item.price_cents || 0) * item.qty;
        total += line;
        const productHref = item.slug ? `/products/${item.slug}` : "/shop";
        return `
        <article class="cart-line" data-idx="${idx}" data-h-product="${item.slug || item.product_id || ""}">
          <a href="${productHref}"><img src="${item.image || ""}" alt=""></a>
          <div class="cart-line-body">
            <h2><a href="${productHref}">${item.title}</a></h2>
            <p class="cart-line-meta">${item.size ? "Size " + item.size : "One size"} · ${money(item.price_cents)} each</p>
            <div class="cart-qty">
              <button type="button" data-dec aria-label="Decrease quantity">−</button>
              <span>${item.qty}</span>
              <button type="button" data-inc aria-label="Increase quantity">+</button>
            </div>
          </div>
          <div class="cart-line-side">
            <div class="cart-line-total">${money(line)}</div>
            <button type="button" class="cart-remove" data-remove>Remove</button>
          </div>
        </article>`;
      })
      .join("");

    renderCheckoutLines(cart);
    renderTotals(cart);

    root.querySelectorAll("[data-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.closest(".cart-line").dataset.idx);
        const next = [...getCart()];
        if (next[idx].qty > 1) next[idx].qty -= 1;
        else next.splice(idx, 1);
        setCart(next);
      });
    });
    root.querySelectorAll("[data-inc]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.closest(".cart-line").dataset.idx);
        const next = [...getCart()];
        if (next[idx].qty < 10) next[idx].qty += 1;
        setCart(next);
      });
    });
    root.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.closest(".cart-line").dataset.idx);
        const next = [...getCart()];
        next.splice(idx, 1);
        setCart(next);
      });
    });
  }

  async function applyDiscount() {
    const cart = getCart();
    const code = document.getElementById("checkout-discount")?.value?.trim();
    const msg = document.getElementById("checkout-discount-msg");
    if (!code || !cart.length) return;

    msg.textContent = "Checking code…";
    msg.className = "checkout-promo-msg";

    try {
      const res = await fetch("/api/store/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          code,
          email: document.getElementById("checkout-email")?.value?.trim() || "",
          items: cart.map((i) => ({ variant_id: i.variant_id, qty: i.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid discount code");

      setDiscount({
        code: data.code,
        title: data.title,
        discount_cents: data.discount_cents || 0,
        free_shipping: !!data.free_shipping,
        message: data.message || "Discount applied",
      });
      msg.textContent = data.message || "Discount applied";
      msg.className = "checkout-promo-msg ok";
    } catch (err) {
      setDiscount(null);
      msg.textContent = err.message || "Invalid discount code";
      msg.className = "checkout-promo-msg err";
    }
  }

  async function checkout(e) {
    e.preventDefault();
    const email = document.getElementById("checkout-email")?.value?.trim();
    const status = document.getElementById("checkout-status");
    const btn = document.getElementById("checkout-submit");
    const cart = getCart();
    if (!email || !cart.length) return;

    btn.disabled = true;
    status.textContent = "Placing order…";
    status.className = "checkout-status";

    try {
      const attribution = window.fnfAttribution?.getAttribution?.() || {};
      const res = await fetch("/api/store/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email,
          items: cart.map((i) => ({ variant_id: i.variant_id, qty: i.qty })),
          attribution,
          discount_code: getDiscount()?.code || document.getElementById("checkout-discount")?.value?.trim() || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      // Redirect to Stripe-hosted checkout. Do NOT clear cart/discount here —
      // the confirmation page clears them on "paid", so a cancelled checkout
      // keeps the cart intact.
      status.textContent = "Redirecting to secure checkout…";
      status.className = "checkout-status";
      window.location.href = data.url;
    } catch (err) {
      status.textContent = err.message || "Checkout failed";
      status.className = "checkout-status err";
      btn.disabled = false;
    }
  }

  document.getElementById("checkout-form")?.addEventListener("submit", checkout);
  document.getElementById("checkout-apply-discount")?.addEventListener("click", applyDiscount);
  document.addEventListener("fnf:cart-updated", () => {
    render();
    updateBadge();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      render();
      updateBadge();
    });
  } else {
    render();
    updateBadge();
  }

  if (new URLSearchParams(location.search).get("cancelled") === "1") {
    var s = document.getElementById("checkout-status");
    if (s) { s.textContent = "Checkout cancelled — your cart is saved."; s.className = "checkout-status"; }
  }
})();
