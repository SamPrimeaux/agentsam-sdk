const LOGO_URL =
  "https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ad23b2d9-e2e4-4ad6-eb81-9e4c983df000/thumbnail";

const ICONS = {
  home: '<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  orders: '<path d="M5 8h14l-1 12H6L5 8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.6"/>',
  products: '<path d="M4 13 11 6h7v7l-7 7-7-7Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="15" cy="9" r="1.4" fill="currentColor"/>',
  customers: '<circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.6"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  growth: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/><path d="m9 13 2 2 4-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  discounts: '<path d="M4 9V6a2 2 0 0 1 2-2h3l11 11a2 2 0 0 1 0 3l-4 4a2 2 0 0 1-3 0L2 11" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/>',
  content: '<path d="M7 4h7l4 4v12H7z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13 4v5h5M10 13h5M10 16h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  markets: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M4 12h16M12 4c2.5 2 2.5 14 0 16M12 4c-2.5 2-2.5 14 0 16" stroke="currentColor" stroke-width="1.4"/>',
  finance: '<path d="M4 9 12 4l8 5M5 9v9h14V9M9 18v-5M12 18v-5M15 18v-5M3 20h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  analytics: '<path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  store: '<path d="M4 9 5 5h14l1 4M4 9h16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM5.5 13V20h13v-7" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  pos: '<rect x="6" y="3" width="12" height="18" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M10 18h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  agentic: '<rect x="5" y="8" width="14" height="11" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M12 4v4M9 13h.01M15 13h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  email: '<path d="M4 6h16v12H4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  settings: '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.02.02a2 2 0 1 1-2.83 2.83l-.02-.02a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.03a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.87.34l-.02.02a2 2 0 1 1-2.83-2.83l.02-.02A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.03A1.7 1.7 0 0 0 4.6 8.4a1.7 1.7 0 0 0-.34-1.87l-.02-.02a2 2 0 1 1 2.83-2.83l.02.02A1.7 1.7 0 0 0 8.96 4.04 1.7 1.7 0 0 0 10 2.48V2a2 2 0 1 1 4 0v.03a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.02-.02a2 2 0 1 1 2.83 2.83l-.02.02a1.7 1.7 0 0 0-.34 1.87A1.7 1.7 0 0 0 20.96 10H21a2 2 0 1 1 0 4h-.03A1.7 1.7 0 0 0 19.4 15Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  arrowLeftToLine: '<path d="M3 19V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m13 6-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  textAlignStart: '<path d="M21 5H3M15 12H3M17 19H3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  x: '<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  chev: '<path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};

const NAV = {
  main: [
    { href: "/admin/home", label: "Home", icon: "home" },
    { href: "/admin/orders", label: "Orders", icon: "orders" },
    {
      id: "products",
      label: "Products",
      icon: "products",
      children: [
        { href: "/admin/products/create", label: "Create product" },
        { href: "/admin/products/help/artwork", label: "Artwork help" },
        { href: "/admin/products", label: "All products" },
        { href: "/admin/products", label: "Collections" },
        { href: "/admin/inventory", label: "Inventory" },
      ],
    },
    { href: "/admin/subscribers", label: "Customers", icon: "customers" },
    { href: "/admin/growth", label: "Growth", icon: "growth" },
    { href: "/admin/discounts", label: "Discounts", icon: "discounts" },
    { href: "/admin/content", label: "Content", icon: "content" },
    { href: "/admin/scaffold?view=markets", label: "Markets", icon: "markets" },
    {
      id: "analytics",
      label: "Analytics",
      icon: "analytics",
      href: "/admin/analytics/overview",
      children: [
        { href: "/admin/analytics/overview", label: "Overview", analyticsView: "overview" },
        { href: "/admin/analytics/finance", label: "Finance", analyticsView: "finance" },
        { href: "/admin/analytics/health", label: "Health", analyticsView: "health" },
      ],
    },
  ],
  channels: [
    {
      id: "online-store",
      href: "/admin/store",
      label: "Online Store",
      icon: "store",
      children: [
        { href: "/admin/pages", label: "Pages" },
        { href: "/admin/preferences", label: "Preferences" },
      ],
    },
    { href: "/admin/scaffold?view=pos", label: "Point of Sale", icon: "pos" },
    { href: "/admin/agentsam", label: "AgentSam", icon: "agentic" },
  ],
  apps: [
    {
      id: "email",
      label: "Email",
      icon: "email",
      href: "/admin/email",
      children: [
        { href: "/admin/email", label: "Inbox" },
        { href: "/admin/email?folder=sent", label: "Sent" },
      ],
    },
  ],
};

// Explicit user-toggle overrides for collapsible nav groups. Keyed by group id.
// When a key is present, it wins over the route-derived "should this be open"
// guess in groupOpen(). This is the single source of truth for open/closed
// state so re-renders (hydrateShellNav) never silently discard a manual
// expand/collapse the way the old per-render DOM-class toggling did.
const navToggleState = new Map();

function ensureConsoleAssets() {
  document.body.classList.add("console-theme");
  if (!document.getElementById("console-css")) {
    const link = document.createElement("link");
    link.id = "console-css";
    link.rel = "stylesheet";
    link.href = "/admin/css/console.css";
    document.head.appendChild(link);
  }
  if (!document.getElementById("agentsam-css")) {
    const link = document.createElement("link");
    link.id = "agentsam-css";
    link.rel = "stylesheet";
    link.href = "/admin/css/agentsam.css";
    document.head.appendChild(link);
  }
  if (!document.querySelector('link[href*="fonts.googleapis.com"]')) {
    const pre1 = document.createElement("link");
    pre1.rel = "preconnect";
    pre1.href = "https://fonts.googleapis.com";
    document.head.appendChild(pre1);
    const pre2 = document.createElement("link");
    pre2.rel = "preconnect";
    pre2.href = "https://fonts.gstatic.com";
    pre2.crossOrigin = "anonymous";
    document.head.appendChild(pre2);
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(font);
  }
}

async function adminFetch(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401) {
    window.location.href = "/admin/login";
    throw new Error("Unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function loadShellUser() {
  if (window.__shellUser?.email) return window.__shellUser;
  try {
    const data = await adminFetch("/api/admin/me");
    window.__shellUser = data;
    return data;
  } catch (err) {
    console.error("[shell/me]", err);
    return null;
  }
}

function centsToDollars(cents) {
  return "$" + (Number(cents || 0) / 100).toFixed(2);
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso.replace(" ", "T") + "Z").toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function adminPathBase(href) {
  const base = (href || "").split("?")[0];
  const m = base.match(/^\/admin\/([a-z0-9-]+)\.html$/);
  if (m) return `/admin/${m[1]}`;
  return base;
}

function mailNavFromHref(href) {
  try {
    const u = new URL(href || "/admin/email", "https://fuelnfreetime.com");
    return {
      folder: u.searchParams.get("folder") || "inbox",
      mailbox: u.searchParams.get("mailbox") || "all",
    };
  } catch {
    return { folder: "inbox", mailbox: "all" };
  }
}

function navActive(href, activeHref) {
  const baseHref = adminPathBase(href);
  const baseActive = adminPathBase(activeHref);
  if (baseHref === "/admin/email" && baseActive === "/admin/email") {
    const h = mailNavFromHref(href);
    const a = mailNavFromHref(activeHref);
    return h.folder === a.folder && h.mailbox === a.mailbox;
  }
  if (baseHref === baseActive) return true;
  if (href === activeHref) return true;
  const aliases = {
    "/admin/home": ["/admin/dashboard", "/admin/dashboard.html"],
    "/admin/store": ["/admin/pages", "/admin/page-edit", "/admin/theme-editor", "/admin/preferences"],
    "/admin/products": ["/admin/product-edit", "/admin/products/create"],
    "/admin/content": ["/admin/media", "/admin/media.html"],
    "/admin/pages": ["/admin/page-edit", "/admin/theme-editor"],
    "/admin/theme-editor": ["/admin/page-edit"],
    "/admin/analytics/overview": [
      "/admin/analytics/finance",
      "/admin/analytics/health",
    ],
  };
  for (const [key, list] of Object.entries(aliases)) {
    if (baseHref === key && (baseActive === key || list.some((p) => baseActive.startsWith(p)))) {
      return true;
    }
  }
  if (baseActive.startsWith("/admin/scaffold") && baseHref.startsWith("/admin/scaffold")) {
    return href === activeHref;
  }
  return false;
}

function groupOpen(id, activeHref, children, parentHref) {
  if (id && navToggleState.has(id)) return navToggleState.get(id);
  if (parentHref && navActive(parentHref, activeHref)) return true;
  if (!children) return false;
  return children.some((c) => navActive(c.href, activeHref));
}

function icon(name, size = 18, className = "console-icon") {
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

function renderNavItem(item, activeHref) {
  if (item.children) {
    const open = groupOpen(item.id, activeHref, item.children, item.href);
    const parentActive =
      (item.href && navActive(item.href, activeHref)) ||
      item.children.some((c) => navActive(c.href, activeHref));

    if (item.href) {
      return `
      <div class="console-nav-split${parentActive ? " is-active" : ""}">
        <a href="${item.href}" class="console-nav-item console-nav-item--split">${icon(item.icon || "store")}<span>${item.label}</span></a>
        <button type="button" class="console-nav-toggle${open ? " is-open" : ""}" data-toggle="${item.id}" aria-label="Toggle ${item.label}" aria-expanded="${open ? "true" : "false"}">
          ${icon("chev", 13, "console-icon chev")}
        </button>
      </div>
      <div class="console-nav-children${open ? " is-open" : ""}" data-group="${item.id}">
        ${item.children
          .map((child) => {
            const active = navActive(child.href, activeHref);
            const analyticsAttr = child.analyticsView
              ? ` data-analytics-view="${child.analyticsView}"`
              : "";
            return `<a href="${child.href}" class="console-nav-child${active ? " is-active" : ""}"${analyticsAttr}>${active ? '<span class="branch">↳</span>' : ""}${child.label}</a>`;
          })
          .join("")}
      </div>`;
    }

    return `
      <button type="button" class="console-nav-item${parentActive ? " is-active" : ""}" data-toggle="${item.id}" aria-expanded="${open ? "true" : "false"}">
        ${icon(item.icon || "store")}
        <span style="flex:1;text-align:left">${item.label}</span>
        ${icon("chev", 13, "console-icon chev")}
      </button>
      <div class="console-nav-children${open ? " is-open" : ""}" data-group="${item.id}">
        ${item.children
          .map((child) => {
            const active = navActive(child.href, activeHref);
            const analyticsAttr = child.analyticsView
              ? ` data-analytics-view="${child.analyticsView}"`
              : "";
            return `<a href="${child.href}" class="console-nav-child${active ? " is-active" : ""}"${analyticsAttr}>${active ? '<span class="branch">↳</span>' : ""}${child.label}</a>`;
          })
          .join("")}
      </div>`;
  }
  const active = navActive(item.href, activeHref);
  if (item.agentsam) {
    return `<a href="#" class="console-nav-item${active ? " is-active" : ""}" data-agentsam-open>${icon(item.icon)}${item.label}</a>`;
  }
  return `<a href="${item.href}" class="console-nav-item${active ? " is-active" : ""}">${icon(item.icon)}${item.label}</a>`;
}

function renderSideNav(activeHref, userNav, options = {}) {
  const { drawer = false } = options;
  const nav = userNav || NAV;
  const main = nav.main.map((item) => renderNavItem(item, activeHref)).join("");
  const channels = nav.channels.map((item) => renderNavItem(item, activeHref)).join("");
  const apps = nav.apps.map((item) => renderNavItem(item, activeHref)).join("");
  return `
    <div class="console-sidenav-scroll">
      <div class="console-nav-group">${main}</div>
      <div class="console-nav-label">Sales channels</div>
      <div class="console-nav-group">${channels}</div>
      <div class="console-nav-label">Apps</div>
      <div class="console-nav-group">${apps}</div>
    </div>
    <div class="console-sidenav-profile${drawer ? " console-sidenav-profile--drawer" : ""}" data-profile-popup-root>
      <div class="console-sidenav-profile-row">
        <button type="button" class="console-profile-card console-profile-store" data-profile-menu-toggle aria-expanded="false" aria-haspopup="true">
          <img class="console-profile-store-logo" src="${LOGO_URL}" alt="">
          <span class="console-profile-meta">
            <strong>Fuel &amp; Free Time</strong>
            <span data-admin-email>Loading…</span>
          </span>
          ${icon("chev", 15, "console-profile-chevron")}
        </button>
        ${drawer ? `<button type="button" class="console-nav-collapse" data-console-nav-toggle aria-label="Close sidebar" title="Close sidebar">
          ${icon("arrowLeftToLine", 19, "console-nav-collapse-icon")}
        </button>` : ""}
      </div>
      <div class="console-profile-menu" data-profile-menu role="menu" aria-label="Account settings" aria-hidden="true">
        <div class="console-profile-menu-head">
          <div class="console-profile-avatar" data-profile-avatar aria-hidden="true">…</div>
          <div class="console-profile-meta"><strong data-profile-name>Account</strong><span data-profile-role>Loading…</span></div>
        </div>
        <a href="/admin/preferences" class="console-menu-item" role="menuitem">Store preferences</a>
        <a href="/admin/account" class="console-menu-item" role="menuitem">Account &amp; password</a>
        <a href="/" class="console-menu-item" role="menuitem" target="_blank" rel="noopener">View storefront</a>
      </div>
      <button class="admin-logout-btn" type="button">Log out</button>
    </div>`;
}

function buildUserNav(user) {
  const nav = JSON.parse(JSON.stringify(NAV));
  const slug = user?.primary_mailbox;
  const boxes = user?.mailboxes || [];

  if (boxes.length <= 1 && slug) {
    nav.apps = [{ href: `/admin/email?mailbox=${slug}`, label: "Email", icon: "email" }];
  } else if (boxes.length > 1) {
    const primary = slug || boxes[0]?.slug;
    const children = [];
    for (const box of boxes) {
      children.push({
        href: `/admin/email?mailbox=${box.slug}`,
        label: box.label,
      });
    }
    children.push({
      href: `/admin/email?mailbox=${primary}&folder=sent`,
      label: "Sent",
    });
    nav.apps = [
      {
        id: "email",
        label: "Email",
        icon: "email",
        href: `/admin/email?mailbox=${primary}`,
        children,
      },
    ];
  }
  return nav;
}

function hydrateShellProfile(user) {
  if (!user) return;
  const name = user.display_name || user.email || "Account";
  const role = (user.role || "member").replace(/^./, (c) => c.toUpperCase());
  document.querySelectorAll("[data-profile-name]").forEach((el) => {
    el.textContent = name;
  });
  document.querySelectorAll("[data-profile-role]").forEach((el) => {
    el.textContent = role;
  });
  document.querySelectorAll("[data-profile-avatar]").forEach((el) => {
    if (user.avatar_url) {
      el.innerHTML = `<img src="${user.avatar_url}" alt="" referrerpolicy="no-referrer">`;
      el.classList.add("has-image");
    } else {
      el.textContent = user.initials || "??";
      el.classList.remove("has-image");
    }
  });
  document.querySelectorAll("[data-admin-email]").forEach((el) => {
    el.textContent = user.email;
  });
}

function hydrateShellNav(user, activeHref) {
  hydrateShellProfile(user);
  const navHtml = renderSideNav(activeHref, buildUserNav(user));
  const drawerNavHtml = renderSideNav(activeHref, buildUserNav(user), { drawer: true });
  document.querySelectorAll(".console-sidenav.admin-sidebar, .admin-nav--drawer").forEach((aside) => {
    // Keep the footer/profile DOM island stable. Replacing the whole aside here
    // used to make the profile and collapse control disappear during hydration.
    const next = document.createElement("div");
    next.innerHTML = aside.classList.contains("admin-nav--drawer") ? drawerNavHtml : navHtml;
    const nextScroll = next.querySelector(".console-sidenav-scroll");
    const currentScroll = aside.querySelector(".console-sidenav-scroll");
    if (nextScroll && currentScroll) currentScroll.replaceWith(nextScroll);
    else if (nextScroll) aside.prepend(nextScroll);
    if (!aside.querySelector(".console-sidenav-profile")) {
      const footer = next.querySelector(".console-sidenav-profile");
      if (footer) aside.appendChild(footer);
    }
  });
  syncPersistentNavState();
  // Toggle click handling is wired ONCE, via delegation, in
  // bindConsoleGlobalHandlers(). Re-rendering the nav here used to
  // re-attach a fresh set of per-button listeners on top of whatever was
  // already wired from the initial static render in renderShell(), which
  // is what caused the double-toggle race / stuck chevron. navToggleState
  // plus the delegated listener now survive this innerHTML swap untouched.
}

function ensureConsoleLayout() {
  if (!document.getElementById("console-app")) {
    const app = document.createElement("div");
    app.id = "console-app";
    document.body.appendChild(app);
  }
  if (!document.getElementById("console-overlay")) {
    const overlay = document.createElement("div");
    overlay.id = "console-overlay";
    document.body.appendChild(overlay);
  }
}

function stabilizeShellDrawers() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".admin-drawer, .admin-drawer-backdrop, .agentsam-drawer, .agentsam-backdrop").forEach((el) => {
      el.classList.add("drawer-mounted");
      el.style.removeProperty("visibility");
    });
    document.body.classList.remove("console-shell-loading");
  });
}

function renderShell(activeHref, mainHtml, options = {}) {
  const { fullBleed = false, onReady, includeMobileDrawer = false } = options;
  ensureConsoleAssets();
  ensureConsoleLayout();

  document.body.classList.remove("agentsam-open", "admin-nav-open", "console-body-bleed", "admin-body-bleed");
  document.body.classList.add("console-shell-loading");

  const mainClass = fullBleed
    ? "console-main admin-main console-main--bleed admin-main--bleed"
    : "console-main admin-main";

  const mobileDrawerMarkup = includeMobileDrawer ? `
        <div class="admin-drawer-backdrop" id="admin-drawer-backdrop" aria-hidden="true"></div>
        <aside class="admin-drawer" id="admin-drawer" aria-hidden="true">
          <div class="admin-drawer-head">
            <span class="admin-drawer-title">Navigation</span>
            <button type="button" class="admin-drawer-close" id="admin-drawer-close" aria-label="Close sidebar" title="Close sidebar">
              ${icon("arrowLeftToLine", 20, "admin-drawer-close-icon")}
            </button>
          </div>
          <nav class="console-sidenav admin-nav admin-nav--drawer" data-nav-package="mobile-glass-drawer" style="display:block;width:100%;border:0;background:transparent;padding:0">${renderSideNav(activeHref, null, { drawer: true })}</nav>
        </aside>` : "";
  const mobileDrawerTrigger = includeMobileDrawer ? `<button type="button" class="console-nav-ghost-toggle admin-menu-toggle" id="admin-menu-toggle" aria-label="Show sidebar" title="Show sidebar" aria-expanded="false" aria-controls="admin-drawer">
          ${icon("textAlignStart", 21, "console-nav-ghost-icon")}
        </button>` : "";
  document.getElementById("console-app").innerHTML = `
    <div class="console-shell admin-shell" data-nav-packages="persistent-frosted-rail${includeMobileDrawer ? " mobile-glass-drawer" : ""}">
      <header class="console-topbar">
        <div class="console-topbar-spacer" aria-hidden="true"></div>
        <div class="console-search-wrap">
          <div class="console-search" role="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9b9b9b" stroke-width="1.8"/><path d="m20 20-3.2-3.2" stroke="#9b9b9b" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span>Search</span>
            <kbd>⌘K</kbd>
          </div>
        </div>
        <div class="console-topbar-actions">
          <button type="button" class="console-icon-btn" id="agentsam-toggle" aria-label="Agent Sam" aria-expanded="false" title="Agent Sam">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
          </button>
          <button type="button" class="console-icon-btn" aria-label="Notifications">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.5"/></svg>

          </button>
        </div>
      </header>
      <div class="console-body">
        <aside class="console-sidenav admin-sidebar" data-nav-package="persistent-frosted-rail">${renderSideNav(activeHref)}</aside>
        ${mobileDrawerTrigger}
        <button type="button" class="console-nav-ghost-toggle console-nav-ghost-toggle--persistent" data-console-nav-toggle aria-label="Show sidebar" title="Show sidebar">
          ${icon("textAlignStart", 21, "console-nav-ghost-icon")}
        </button>
        ${mobileDrawerMarkup}
        <div class="console-workspace">
          <main class="${mainClass}">${mainHtml}</main>
          <aside id="agentsam-dock" class="agentsam-dock" aria-hidden="true"></aside>
        </div>
      </div>
    </div>
  `;

  if (fullBleed) document.body.classList.add("console-body-bleed", "admin-body-bleed");

  bindConsoleGlobalHandlers();
  import('/admin/profile-popup/index.js')
    .then(({ mountProfilePopups }) => mountProfilePopups(document))
    .catch(() => {});

  // NOTE: nav-toggle click handling is NOT wired here anymore. It used to be
  // wired both here (on the freshly-painted static markup) AND again inside
  // hydrateShellNav() once the async /api/admin/me call resolved and
  // replaced the sidebar's innerHTML. Whichever buttons survived ended up
  // with stacked/duplicate listeners, and any click landing in the gap
  // between this render and hydrateShellNav's innerHTML swap got its
  // .is-open state silently discarded a moment later. That race produced
  // the "stuck" chevron/focus box. The single delegated listener in
  // bindConsoleGlobalHandlers() now handles every [data-toggle] click for
  // the life of the page, across any number of innerHTML replacements.

  if (window.__shellUser) hydrateShellProfile(window.__shellUser);

  loadShellUser()
    .then((d) => {
      if (d) {
        hydrateShellNav(d, activeHref);
      } else {
        hydrateShellProfile({
          display_name: "Account",
          email: "",
          role: "member",
          initials: "?",
        });
        document.querySelectorAll("[data-profile-role]").forEach((el) => {
          el.textContent = "Sign in required";
        });
      }
    });

  initPersistentNav();
  if (includeMobileDrawer) initMobileNav();
  window.initEcommerceInspector?.();
  if (!window.initEcommerceInspector && !document.getElementById("ecommerce-inspector-script")) {
    const script = document.createElement("script");
    script.id = "ecommerce-inspector-script";
    script.src = "/admin/js/inspector.js";
    document.head.appendChild(script);
  }
  initAgentsamShell();
  wireAgentsamTriggers();
  stabilizeShellDrawers();

  document.querySelectorAll("[data-agentsam-open]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      window.openAgentsamDrawer?.();
    });
  });

  if (typeof onReady === "function") onReady();
  window.wireAnalyticsNav?.();
}

function bindConsoleGlobalHandlers() {
  if (window.__consoleGlobalHandlers) return;
  window.__consoleGlobalHandlers = true;

  document.addEventListener("click", (e) => {
    const logout = e.target.closest(".admin-logout-btn");
    if (logout) {
      e.preventDefault();
      fetch("/api/admin/logout", { method: "POST" }).catch(() => {}).finally(() => {
        window.location.href = "/admin/login";
      });
      return;
    }
    const navToggle = e.target.closest("[data-console-nav-toggle]");
    if (navToggle) {
      e.preventDefault();
      e.stopPropagation();
      if (navToggle.closest(".admin-nav--drawer")) return;
      setPersistentNav(document.body.classList.contains("console-nav-collapsed"));
    }
  });

  // Single delegated handler for every collapsible nav group, for the
  // lifetime of the page. Survives any number of aside.innerHTML swaps
  // (hydrateShellNav) because it lives on document, not on the buttons
  // themselves -- so there is exactly one listener per click, ever, and
  // navToggleState is the only thing that decides open/closed.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-toggle]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const id = btn.getAttribute("data-toggle");
    if (!id) return;
    const currentlyOpen = navToggleState.has(id)
      ? navToggleState.get(id)
      : !!document.querySelector(`[data-group="${id}"]`)?.classList.contains("is-open");
    const next = !currentlyOpen;
    navToggleState.set(id, next);
    document.querySelectorAll(`[data-group="${id}"]`).forEach((group) => {
      group.classList.add("is-animating");
      group.classList.toggle("is-open", next);
    });
    document.querySelectorAll(`[data-toggle="${id}"]`).forEach((toggleBtn) => {
      toggleBtn.setAttribute("aria-expanded", String(next));
      toggleBtn.classList.toggle("is-open", next);
    });
  });
}

function syncPersistentNavState() {
  const collapsed = document.body.classList.contains("console-nav-collapsed");
  document.querySelectorAll(".console-sidenav.admin-sidebar").forEach((aside) => aside.classList.toggle("is-collapsed", collapsed));
  document.querySelectorAll("[data-console-nav-toggle]").forEach((button) => {
    if (button.closest(".admin-nav--drawer")) return;
    const label = collapsed ? "Show sidebar" : (window.matchMedia?.("(max-width: 900px)")?.matches ? "Close sidebar" : "Collapse sidebar");
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.innerHTML = icon(collapsed ? "textAlignStart" : "x", 21, "console-nav-ghost-icon");
  });
}

function setPersistentNav(open) {
  document.body.classList.toggle("console-nav-collapsed", !open);
  try { localStorage.setItem("fnf-console-nav", open ? "open" : "collapsed"); } catch {}
  syncPersistentNavState();
}

function initPersistentNav() {
  let open = true;
  try { open = localStorage.getItem("fnf-console-nav") !== "collapsed"; } catch {}
  setPersistentNav(open);
}

function initAgentsamShell() {
  if (typeof window.initAgentsamDrawer === "function") {
    window.initAgentsamDrawer();
    return;
  }
  if (document.getElementById("agentsam-script")) return;
  const script = document.createElement("script");
  script.id = "agentsam-script";
  script.src = "/admin/js/agentsam.js";
  script.onload = () => {
    window.initAgentsamDrawer?.();
    wireAgentsamTriggers();
  };
  document.head.appendChild(script);
}

function wireAgentsamTriggers() {
  document.querySelectorAll("[data-agentsam-prompt]").forEach((btn) => {
    if (btn.dataset.agentsamWired) return;
    btn.dataset.agentsamWired = "1";
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-agentsam-prompt") || "";
      window.openAgentsamDrawer?.();
      if (prompt && window.sendAgentsamMessage) window.sendAgentsamMessage(prompt);
    });
  });
}

let mobileNavController;
function initMobileNav() {
  mobileNavController?.abort();
  mobileNavController = new AbortController();
  const signal = mobileNavController.signal;
  const toggle = document.getElementById("admin-menu-toggle");
  const drawer = document.getElementById("admin-drawer");
  const backdrop = document.getElementById("admin-drawer-backdrop");
  const closeBtn = document.getElementById("admin-drawer-close");
  if (!toggle || !drawer) return;

  const mq = window.matchMedia("(max-width: 900px)");

  function setOpen(open) {
    drawer.inert = !open;
    const main = document.querySelector(".console-workspace");
    if (main) main.inert = open;
    if (open) closeBtn?.focus();
    else if (drawer.contains(document.activeElement)) toggle.focus();
    if (!mq.matches) {
      document.body.classList.remove("admin-nav-open");
      toggle.setAttribute("aria-expanded", "false");
      drawer.setAttribute("aria-hidden", "true");
      backdrop?.setAttribute("aria-hidden", "true");
      return;
    }
    document.body.classList.toggle("admin-nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    drawer.setAttribute("aria-hidden", String(!open));
    backdrop?.setAttribute("aria-hidden", String(!open));
  }

  function close() {
    setOpen(false);
  }

  toggle.addEventListener("click", () => {
    setOpen(!document.body.classList.contains("admin-nav-open"));
  }, { signal });
  closeBtn?.addEventListener("click", close, { signal });
  backdrop?.addEventListener("click", close, { signal });
  drawer.querySelectorAll("a.console-nav-item, a.console-nav-child, a.console-profile-card").forEach((link) => {
    link.addEventListener("click", close);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key === "Tab" && document.body.classList.contains("admin-nav-open")) {
      const items = [...drawer.querySelectorAll("a[href], button:not([disabled])")].filter(el => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }, { signal });

  mq.addEventListener("change", () => close(), { signal });
  close();
}

window.hydrateShellProfile = hydrateShellProfile;
window.hydrateShellNav = hydrateShellNav;
window.loadShellUser = loadShellUser;
