/**
 * Local Studio's navigation data for the original Ecommerce Console renderer.
 * The approved product shell.js and console.css remain entirely unmodified.
 */
(function () {
  if (typeof NAV === "undefined" || typeof renderSideNav !== "function") return;

  // Platform destinations remain top-level. Installed commerce capabilities
  // reuse the original Console hierarchy rather than becoming a flat site list.
  const desktopHost = window.parent !== window ? window.parent?.agentsamConsoleHost : null;
  const desktop = Boolean(window.__AGENTSAM_DESKTOP__ || desktopHost);
  if (desktopHost) {
    window.__AGENTSAM_DESKTOP__ = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const request = new Request(input, init);
      const url = new URL(request.url, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/admin/')) return originalFetch(input, init);
      return desktopHost.request(request);
    };
  }
  // The top-level native workbench hydrates from its existing shared identity
  // store; do not race it with a cookie fetch against the static Tauri origin.
  if (desktop && !desktopHost && typeof loadShellUser === 'function') {
    loadShellUser = async function () { return window.__shellUser || null; };
  }
  const main = [
    { href: "/admin/home", label: "Home", icon: "home" },
    { id: "products", label: "Products", icon: "products", href: "/admin/products", children: [
      { href: "/admin/products/create", label: "Product Studio" },
      { href: "/admin/products/help/artwork", label: "Artwork help" },
      { href: "/admin/products", label: "All products" },
      { href: "/admin/products?view=collections", label: "Collections" },
      { href: "/admin/products?view=platform", label: "Platform products" },
      { href: "/admin/inventory", label: "Inventory" },
      { href: "/admin/orders", label: "Orders" },
      { href: "/admin/discounts", label: "Discounts" }
    ] },
    { href: "/admin/growth", label: "Growth", icon: "growth" },
    { href: "/admin/content", label: "Content", icon: "content" },
    { id: "analytics", label: "Analytics", icon: "analytics", href: "/admin/analytics/overview", children: [
      { href: "/admin/analytics/overview", label: "Overview" },
      { href: "/admin/analytics/finance", label: "Finance" },
      { href: "/admin/analytics/health", label: "Health" }
    ] },
    { href: "/admin/projects", label: "Projects", icon: "content" },
    { href: "/artifacts", label: "Library", icon: "content" },
    { href: "/tickets", label: "Tickets", icon: "orders" }
  ];
  const channels = [
    { id: "online-store", href: "/sites", label: "Sites / Online Store", icon: "store", children: [
      { href: "/admin/pages", label: "Pages" },
      { href: "/admin/theme-editor?slug=home", label: "Theme Editor" },
      { href: "/admin/preferences", label: "Preferences" }
    ] },
    // /admin/subscribers is a newsletter list, NOT the commerce customer CRM.
    // Keep its honest name until an actual customer directory route is installed.
    { id: "audience", label: "Audience", icon: "customers", children: [
      { href: "/admin/subscribers", label: "Subscribers" }
    ] }
  ];
  const apps = [
    { href: "/admin/agentsam", label: "AgentSam", icon: "agentic" },
    { href: "/admin/cad", label: "CAD Creator", icon: "products" },
    { href: "/admin/moviemode", label: "MovieMode", icon: "content" },
    { id: "work-mail", href: "/mail", label: "Email", icon: "email", children: [
      { href: "/mail", label: "Mail & connections" },
      { href: "/admin/email", label: "Store mailboxes" },
      { href: "/settings/integrations", label: "Integrations" }
    ] },
    { href: "/settings/general", label: "Settings", icon: "settings" }
  ];
  // Growth is an installed product view. Its platform appearance is an
  // additive token override, not an edit to the customer's themed CSS.
  if (window.location?.pathname === "/admin/growth" &&
      !document.querySelector('link[data-agentsam-growth-host]')) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/console-growth-host.css";
    stylesheet.dataset.agentsamGrowthHost = "true";
    document.head.appendChild(stylesheet);
  }
  NAV.main.splice(0, NAV.main.length, ...main);
  NAV.channels.splice(0, NAV.channels.length, ...channels);
  NAV.apps.splice(0, NAV.apps.length, ...apps);
  const originalSideNav = renderSideNav;
  renderSideNav = function (active, userNav, options) {
    return originalSideNav(active, userNav, options)
      .replace('<strong>Fuel &amp; Free Time</strong>', '<strong data-profile-name>Account</strong>')
      .replace('href="/admin/account"', 'href="/settings/general"')
      .replace('href="/admin/preferences" class="console-menu-item"', 'href="/settings/integrations" class="console-menu-item"')
      .replace('Store preferences</a>', 'Integrations</a>')
      .replace('Account &amp; password</a>', 'Account settings</a>')
      .replace('<button class="admin-logout-btn" type="button">Log out</button>', '<a href="/settings/general" class="admin-logout-btn">Account settings</a>')
      .replaceAll("https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ad23b2d9-e2e4-4ad6-eb81-9e4c983df000/thumbnail", "/brand/agentsam-gorilla/v1/pet/animated/ledge-idle.gif");
  };
  try {
    if (!localStorage.getItem(CONSOLE_APPEARANCE_KEY))
      localStorage.setItem(CONSOLE_APPEARANCE_KEY, "dark");
  } catch { /* Private browsing keeps the original renderer's default. */ }
  const originalProfile = typeof hydrateShellProfile === 'function' ? hydrateShellProfile : null;
  if (originalProfile) hydrateShellProfile = function (user) {
    originalProfile(user && { ...user, avatar_url: user.avatar_url || '/brand/agentsam-gorilla/v1/pet/ledge/ledge-idle.svg' });
    document.querySelectorAll('.console-profile-store-logo').forEach(image => {
      image.src = user?.avatar_url && safeAvatarUrl(user.avatar_url) || '/brand/agentsam-gorilla/v1/pet/ledge/ledge-idle.svg';
    });
  };
  if (desktopHost) {
    document.addEventListener('click', event => {
      if (!event.target?.closest?.('#agentsam-toggle')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      desktopHost.activateAssistant();
    }, true);
  }
  if (desktop && !window.__agentsamConsoleLinks) {
    window.__agentsamConsoleLinks = true;
    document.addEventListener("click", function (event) {
      const link = event.target?.closest?.("a[href]");
      if (event.defaultPrevented || !link || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (link.getAttribute('target') === '_blank' || link.hasAttribute?.('download')) return;
      const path = link.getAttribute("href");
      if (!path || !path.startsWith("/") || path.startsWith("//")) return;
      event.preventDefault();
      // Desktop keeps the ecommerce console inside Local Studio's own route
      // host; never send these paths to a separately installed site Worker.
      const destination = path.startsWith("/admin/") && ["/admin/agentsam", "/admin/projects", "/admin/cad", "/admin/moviemode"].some((mount) => path === mount || path.startsWith(mount + "/")) ? path
        : path.startsWith("/admin/")
          ? "/apps/ecommerce-cms-agentsam?page=" + encodeURIComponent(path)
          : path;
      if (desktopHost) desktopHost.navigate(destination);
      else window.location.hash = "#" + destination;
    }, true);
  }
})();
