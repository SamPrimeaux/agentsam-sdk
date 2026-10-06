(function () {
  const CART_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>`;

  let navConfig;
  let headerPresetContract = {
    version: 1,
    defaultPreset: "adaptive-bar",
    presets: {
      "adaptive-bar": { label: "Adaptive bar", contrast: "ambient" },
      "frost-pill": { label: "Frost pill", contrast: "dark-ink" },
    },
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizePath(pathname) {
    const p = (pathname || "/").replace(/\/+$/, "") || "/";
    return p.toLowerCase();
  }

  function matchItem(pathname) {
    const path = normalizePath(pathname);
    let best = null;
    let bestLen = -1;

    for (const item of navConfig.items) {
      if (item.visible === false) continue;
      const prefixes = item.matchPrefixes?.length ? item.matchPrefixes : [item.href];
      for (const raw of prefixes) {
        const prefix = normalizePath(String(raw).replace(/\.html$/, "") || "/");
        const hrefNorm = normalizePath(String(item.href).replace(/\.html$/, "") || "/");

        if (prefix === "/" && path === "/") {
          if (1 > bestLen) {
            best = item;
            bestLen = 1;
          }
          continue;
        }
        if (prefix === "/" && path !== "/") continue;

        for (const cand of [prefix, hrefNorm]) {
          if (cand === "/") continue;
          if (path === cand || path.startsWith(cand + "/") || path.startsWith(cand)) {
            if (cand.length > bestLen) {
              best = item;
              bestLen = cand.length;
            }
          }
        }
      }
    }
    return best;
  }

  async function loadHeaderPresetContract() {
    try {
      const res = await fetch("/theme/contracts/header-presets.json", {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Header preset contract request failed (${res.status})`);
      const data = await res.json();
      if (!data?.defaultPreset || !data?.presets || typeof data.presets !== "object") {
        throw new Error("Header preset contract is invalid");
      }
      headerPresetContract = data;
    } catch (error) {
      console.warn("[FNF shell] using built-in header preset contract:", error?.message || error);
    }
  }

  function resolveHeaderPreset() {
    const requested = document.documentElement.dataset.headerPreset || headerPresetContract.defaultPreset;
    if (headerPresetContract.presets?.[requested]) return requested;
    return headerPresetContract.defaultPreset || "adaptive-bar";
  }

  function toneFromHeaderMode(mode) {
    const normalized = String(mode || "").trim().toLowerCase();
    if (!normalized) return null;
    if (["glass-dark", "dark-ink", "surface-light", "light"].includes(normalized)) return "light";
    if (["ghost-light", "glass-light", "light-ink", "surface-dark", "dark"].includes(normalized)) return "dark";
    return null;
  }

  function colorLuminance(color) {
    const match = String(color || "").match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length < 3 || parts.slice(0, 3).some((value) => !Number.isFinite(value))) return null;
    if (parts.length > 3 && Number.isFinite(parts[3]) && parts[3] <= 0.08) return null;
    const channels = parts.slice(0, 3).map((value) => {
      const c = Math.max(0, Math.min(255, value)) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  function sampleBackdropTone(header) {
    const explicit = toneFromHeaderMode(document.documentElement.dataset.hHeaderMode);
    if (explicit) return explicit;

    const rect = header.getBoundingClientRect();
    const x = Math.max(1, Math.min(innerWidth - 2, Math.round(innerWidth / 2)));
    const y = Math.max(1, Math.min(innerHeight - 2, Math.round(rect.bottom + 8)));
    let node = document.elementFromPoint(x, y);

    while (node && node !== document.documentElement) {
      if (node !== header && !node.closest?.(".fnf-header")) {
        const luminance = colorLuminance(getComputedStyle(node).backgroundColor);
        if (luminance != null) return luminance >= 0.48 ? "light" : "dark";
      }
      node = node.parentElement;
    }

    const bodyLuminance = colorLuminance(getComputedStyle(document.body).backgroundColor);
    return bodyLuminance != null && bodyLuminance >= 0.48 ? "light" : "dark";
  }

  function applyHeaderTone(header) {
    if (!header) return;
    const preset = header.dataset.headerPreset || resolveHeaderPreset();
    const tone = preset === "frost-pill" ? "light" : sampleBackdropTone(header);
    header.dataset.headerTone = tone;
  }

  function applyTheme() {
    const root = document.documentElement;
    const preset = resolveHeaderPreset();
    if (!root.dataset.headerPreset) root.dataset.headerPreset = preset;
    root.style.setProperty("--fnf-accent", navConfig.brandAccent);
    root.style.setProperty("--fnf-accent-light", navConfig.brandAccentLight);
    root.style.setProperty("--fnf-logo-height", `${navConfig.logoHeight}px`);
  }

  function cartIconHtml() {
    return `<a href="/cart" class="fnf-cart-btn" id="fnfCartBtn" aria-label="Cart">${CART_SVG}<span class="fnf-cart-count" data-cart-count hidden>0</span></a>`;
  }

  function headerBlock(includeSpacer) {
    const visibleItems = navConfig.items.filter((i) => i.visible !== false);
    const headerPreset = resolveHeaderPreset();
    const navItems = visibleItems
      .map((n) => `<li><a href="${escapeHtml(n.href)}" data-nav-id="${escapeHtml(n.id)}">${escapeHtml(n.label)}</a></li>`)
      .join("");
    const mobileItems = visibleItems
      .map((n) => `<li><a href="${escapeHtml(n.href)}" data-nav-id="${escapeHtml(n.id)}">${escapeHtml(n.label)}</a></li>`)
      .join("");
    const announcementHref = String(navConfig.announcement?.href || "").trim();
    const announcementEnabled = navConfig.announcement?.enabled === true && navConfig.announcement?.text;
    if (announcementEnabled && !(
      announcementHref.startsWith("/") ||
      announcementHref.startsWith("#") ||
      /^https:\/\//i.test(announcementHref)
    )) {
      throw new Error("Store announcement link is invalid");
    }
    const announcement = announcementEnabled
      ? `<a class="fnf-announcement" href="${escapeHtml(announcementHref)}">${escapeHtml(navConfig.announcement.text)}</a>`
      : "";

    return `
      <header class="fnf-header fnf-header--${escapeHtml(headerPreset)}" id="fnfHeader" data-cms-scope="site" data-cms-section="header" data-header-preset="${escapeHtml(headerPreset)}" data-header-tone="${headerPreset === "frost-pill" ? "light" : "dark"}">
        ${announcement}
        <div class="fnf-row">
          <a class="fnf-logo" href="/" aria-label="Fuel & Free Time">
            <img data-cms="logoUrl" data-cms-attr="src" src="${escapeHtml(navConfig.logoUrl)}" alt="Fuel & Free Time" width="256" height="${navConfig.logoHeight}">
          </a>
          <nav class="fnf-primary" aria-label="Primary">
            <ul class="fnf-nav">${navItems}</ul>
          </nav>
          <div class="fnf-actions">
            ${cartIconHtml()}
            <button class="fnf-burger" id="fnfBurger" type="button" aria-label="Open menu" aria-controls="fnfMobile" aria-expanded="false">
              <span></span><span></span>
            </button>
          </div>
        </div>
      </header>
      <div class="fnf-mobile" id="fnfMobile" aria-hidden="true">
        <div class="fnf-mobile-backdrop" id="fnfMobileBackdrop"></div>
        <nav class="fnf-mobile-panel" aria-label="Mobile">
          <ul>${mobileItems}<li><a href="/cart" data-nav-id="cart">Cart</a></li></ul>
        </nav>
      </div>
      ${includeSpacer ? '<div class="fnf-spacer" aria-hidden="true"></div>' : ""}`;
  }

  function setActiveNav() {
    const path = location.pathname;
    const matched = matchItem(path);
    document.querySelectorAll(".fnf-nav a, .fnf-mobile-panel a").forEach((a) => {
      a.classList.toggle("is-active", matched && a.dataset.navId === matched.id);
    });
    if (path.includes("cart")) {
      document.getElementById("fnfCartBtn")?.classList.add("is-active");
      document.querySelector('.fnf-mobile-panel a[data-nav-id="cart"]')?.classList.add("is-active");
    }
  }

  function bindHeader() {
    const header = document.getElementById("fnfHeader");
    const burger = document.getElementById("fnfBurger");
    const mobile = document.getElementById("fnfMobile");
    const backdrop = document.getElementById("fnfMobileBackdrop");
    if (!header || !burger || !mobile) return;

    let lastY = window.scrollY;
    let hidden = false;
    let ticking = false;

    const emitGlass = (opacity) => {
      document.documentElement.style.setProperty("--fnf-glass-opacity", String(opacity));
      document.dispatchEvent(new CustomEvent("fnf:header-glass", { detail: { opacity } }));
    };

    const updateHeader = () => {
      const y = window.scrollY;
      applyHeaderTone(header);
      const delta = y - lastY;
      const velocity = Math.abs(delta);

      if (delta < 0 && y > 20) {
        const opacity = Math.min(0.18 + velocity * 0.014, 0.72);
        emitGlass(opacity);
        header.classList.add("is-glass");
      } else if (y <= 20) {
        emitGlass(0);
        header.classList.remove("is-glass");
      } else if (delta > 0) {
        emitGlass(Math.max(0, parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fnf-glass-opacity")) - 0.08));
      }

      if (y < 64) {
        if (hidden) {
          header.classList.remove("is-hidden");
          hidden = false;
        }
      } else if (delta > 6 && y > 96) {
        if (!hidden) {
          header.classList.add("is-hidden");
          hidden = true;
        }
      } else if (delta < -6) {
        if (hidden) {
          header.classList.remove("is-hidden");
          hidden = false;
        }
      }

      lastY = y;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateHeader);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    const toneObserver = new MutationObserver(() => applyHeaderTone(header));
    toneObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-h-header-mode", "data-header-preset"],
    });
    updateHeader();

    const closeMenu = () => {
      burger.classList.remove("is-open");
      mobile.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
      mobile.setAttribute("aria-hidden", "true");
      document.body.classList.remove("fnf-nav-open");
      burger.setAttribute("aria-label", "Open menu");
    };

    const openMenu = () => {
      burger.classList.add("is-open");
      mobile.classList.add("is-open");
      burger.setAttribute("aria-expanded", "true");
      mobile.setAttribute("aria-hidden", "false");
      document.body.classList.add("fnf-nav-open");
      burger.setAttribute("aria-label", "Close menu");
      header.classList.remove("is-hidden");
      hidden = false;
    };

    burger.addEventListener("click", () => {
      if (burger.classList.contains("is-open")) closeMenu();
      else openMenu();
    });

    backdrop?.addEventListener("click", closeMenu);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
    mobile.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenu));
  }

  function updateCartBadge() {
    const n = window.FNF_STORE?.cartCount?.() ?? 0;
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(n);
      el.hidden = n === 0;
    });
  }

  function renderInto(mountEl, includeSpacer) {
    mountEl.innerHTML = includeSpacer
      ? `<div class="fnf-shell" id="fnfApp">${headerBlock(true)}</div>`
      : headerBlock(false);
    applyTheme();
    document.documentElement.style.setProperty(
      "--fnf-announcement-h",
      navConfig.announcement?.enabled && navConfig.announcement?.text ? "34px" : "0px"
    );
    setActiveNav();
    bindHeader();
    applyHeaderTone(document.getElementById("fnfHeader"));
    updateCartBadge();
  }

  function cmsSection(page, key) {
    return page?.sections?.find?.((section) => section.key === key)?.content || null;
  }

  function applyCmsHeader(content) {
    if (!content || typeof content !== "object" || !navConfig) return;
    if (content.logoUrl) navConfig.logoUrl = content.logoUrl;
    if (Number.isFinite(Number(content.logoHeight))) navConfig.logoHeight = Number(content.logoHeight);
    if (content.preset && headerPresetContract.presets?.[content.preset]) {
      document.documentElement.dataset.headerPreset = content.preset;
    }
    navConfig.announcement = {
      enabled: content.announcementEnabled === true,
      text: String(content.announcementText || ""),
      href: String(content.announcementHref || ""),
    };
    const blockMeta = content.__editor?.blocks;
    if (Array.isArray(blockMeta) && blockMeta.length) {
      const items = blockMeta
        .filter((block) => block.enabled !== false)
        .map((block, index) => {
          const value = content[block.id] || {};
          const href = String(value.href || "").trim();
          const label = String(value.label || "").trim();
          if (!href || !label) return null;
          return {
            id: block.id || ("nav_" + index),
            label,
            href,
            visible: value.visible !== false,
            matchPrefixes: [href],
          };
        })
        .filter(Boolean);
      if (items.length) navConfig.items = items;
    }
  }

  async function loadCmsHeader() {
    const preview = new URLSearchParams(location.search).has("preview");
    const res = await fetch("/api/cms/pages/site" + (preview ? "?preview=1" : ""), {
      credentials: preview ? "include" : "same-origin",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return;
    const data = await res.json();
    applyCmsHeader(cmsSection(data?.page, "header"));
  }

  async function loadNavConfig() {
    const res = await fetch("/api/store/nav", { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Store shell config request failed (${res.status})`);
    const data = await res.json();
    if (!data?.ok || !data?.nav || !Array.isArray(data.nav.items)) {
      throw new Error("Store shell config is missing or invalid");
    }
    navConfig = data.nav;
    await loadCmsHeader().catch(() => {});
  }

  async function mount() {
    const storeMount = document.getElementById("fnf-store-mount");
    const headerMount = document.getElementById("fnf-header-mount");

    if (!storeMount && !headerMount) return;

    try {
      await Promise.all([loadNavConfig(), loadHeaderPresetContract()]);
    } catch (error) {
      console.error(error);
      const failedMount = storeMount || headerMount;
      failedMount.innerHTML = '<div class="fnf-shell-error" role="alert">Store navigation is unavailable.</div>';
      return;
    }

    if (storeMount) renderInto(storeMount, !document.documentElement.hasAttribute("data-header-overlay"));
    if (headerMount) renderInto(headerMount, false);
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.type !== "fnf-cms-preview" || !Array.isArray(data.siteSections)) return;
    const header = data.siteSections.find((section) => section.key === "header");
    if (!header) return;
    applyCmsHeader(header.content || {});
    const storeMount = document.getElementById("fnf-store-mount");
    const headerMount = document.getElementById("fnf-header-mount");
    if (storeMount) renderInto(storeMount, !document.documentElement.hasAttribute("data-header-overlay"));
    if (headerMount) renderInto(headerMount, false);
  });

  window.FNF_SHELL = {
    updateCartBadge,
    cartIconHtml,
    CART_SVG,
    reload: mount,
    getNavConfig: () => navConfig,
    getHeaderPresets: () => headerPresetContract,
    getHeaderPreset: () => resolveHeaderPreset(),
    setHeaderPreset(preset) {
      if (!headerPresetContract.presets?.[preset]) {
        throw new Error(`Unknown header preset: ${preset}`);
      }
      document.documentElement.dataset.headerPreset = preset;
      return mount();
    },
  };

  document.addEventListener("fnf:cart-updated", updateCartBadge);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
