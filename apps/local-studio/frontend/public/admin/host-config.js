/**
 * Local Studio's navigation data for the original Ecommerce Console renderer.
 * The approved product shell.js and console.css remain entirely unmodified.
 */
(function () {
  if (typeof NAV === "undefined" || typeof renderSideNav !== "function") return;

  const main = [
    { href: "/admin/home", label: "Home", icon: "home" },
    { href: "/agentsam", label: "AgentSam Work", icon: "agentic" },
    { href: "/projects", label: "Projects", icon: "content" },
    { href: "/artifacts", label: "Library", icon: "content" },
    { href: "/tickets", label: "Tickets", icon: "orders" }
  ];
  const channels = [{
    id: "online-store", href: "/sites", label: "Sites / Online Store", icon: "store",
    children: [
      { href: "/admin/pages", label: "Pages" },
      { href: "/admin/theme-editor?slug=home", label: "Theme Editor" },
      { href: "/admin/preferences", label: "Preferences" }
    ]
  }];
  const apps = [
    { href: "/cad", label: "CAD Creator", icon: "products" },
    { href: "/samsketch", label: "SamSketch", icon: "products" },
    { href: "/media", label: "Media", icon: "content" },
    { href: "/browse", label: "Browser", icon: "content" },
    { href: "/cli", label: "Terminal", icon: "agentic" },
    { href: "/settings/general", label: "Settings", icon: "settings" }
  ];
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
      window.location.hash = "#" + path;
    }, true);
  }
})();
