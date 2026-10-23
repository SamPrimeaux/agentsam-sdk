/**
 * Local Studio's navigation data for the original Ecommerce Console renderer.
 * The approved product shell.js and console.css remain entirely unmodified.
 */
(function () {
  if (typeof NAV === "undefined" || typeof renderSideNav !== "function") return;

  // Platform destinations remain top-level. Installed commerce capabilities
  // reuse the original Console hierarchy rather than becoming a flat site list.
  const main = [
    { href: "/admin/home", label: "Home", icon: "home" },
    { id: "products", label: "Products", icon: "products", href: "/admin/products", children: [
      { href: "/admin/products/create", label: "Create product" },
      { href: "/admin/products/help/artwork", label: "Artwork help" },
      { href: "/admin/products", label: "All products" },
      { href: "/admin/products", label: "Collections" },
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
    { href: "/projects", label: "Projects", icon: "content" },
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
    { href: "/agentsam", label: "AgentSam", icon: "agentic" },
    { href: "/cad", label: "CAD Creator", icon: "products" },
    { href: "/samsketch", label: "SamSketch", icon: "products" },
    { href: "/media", label: "Media", icon: "content" },
    { href: "/browse", label: "Browser", icon: "content" },
    { id: "email", href: "/admin/email", label: "Email", icon: "email", children: [
      { href: "/admin/email", label: "Inbox" },
      { href: "/admin/email?folder=sent", label: "Sent" }
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
      .replaceAll("Fuel &amp; Free Time", "AgentSam")
      .replaceAll("https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ad23b2d9-e2e4-4ad6-eb81-9e4c983df000/thumbnail", "/admin/brand/agentsam-mark.svg");
  };
  try {
    if (!localStorage.getItem(CONSOLE_APPEARANCE_KEY))
      localStorage.setItem(CONSOLE_APPEARANCE_KEY, "dark");
  } catch { /* Private browsing keeps the original renderer's default. */ }
  if (window.__AGENTSAM_DESKTOP__ && !window.__agentsamConsoleLinks) {
    window.__agentsamConsoleLinks = true;
    document.addEventListener("click", function (event) {
      const link = event.target?.closest?.("a[href]");
      if (event.defaultPrevented || !link || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const path = link.getAttribute("href");
      if (!path || !path.startsWith("/") || path.startsWith("//")) return;
      event.preventDefault();
      // Desktop uses a hash-routed Local Studio SPA. Product admin pages are
      // installed-app destinations, not independent platform React routes.
      const destination = path === "/admin/home" ? "/"
        : path === "/admin/agentsam" ? "/agentsam"
        : path.startsWith("/admin/")
          ? "/apps/ecommerce-cms-agentsam?page=" + encodeURIComponent(path)
          : path;
      window.location.hash = "#" + destination;
    }, true);
  }
})();
