const VIEW_ROUTES = {
  overview: "/admin/analytics/overview",
  finance: "/admin/analytics/finance",
  health: "/admin/analytics/health",
};

const ANALYTICS_PAGES = new Set(Object.values(VIEW_ROUTES));

function viewFromPath(path = location.pathname) {
  if (path.includes("/finance")) return "finance";
  if (path.includes("/health")) return "health";
  return "overview";
}

function isAnalyticsPage(path = location.pathname) {
  return ANALYTICS_PAGES.has(path);
}

function ensureAnalyticsStyles() {
  if (!document.getElementById("analytics-css")) {
    const link = document.createElement("link");
    link.id = "analytics-css";
    link.rel = "stylesheet";
    link.href = "/admin/analytics/analytics.css";
    document.head.appendChild(link);
  }
  if (!document.getElementById("analytics-shell-css")) {
    const link = document.createElement("link");
    link.id = "analytics-shell-css";
    link.rel = "stylesheet";
    link.href = "/admin/analytics/analytics-shell.css";
    document.head.appendChild(link);
  }
}

function updateAnalyticsNavActive(view) {
  const route = VIEW_ROUTES[view];
  if (!route) return;

  document.querySelectorAll("[data-analytics-view]").forEach((link) => {
    const active = link.dataset.analyticsView === view;
    link.classList.toggle("is-active", active);
    if (link.classList.contains("console-nav-child")) {
      const branch = link.querySelector(".branch");
      if (active && !branch) {
        link.insertAdjacentHTML("afterbegin", '<span class="branch">↳</span>');
      } else if (!active && branch) {
        branch.remove();
      }
    }
  });

  document.querySelectorAll('.console-nav-split a[href="/admin/analytics/overview"]').forEach((link) => {
    link.closest(".console-nav-split")?.classList.toggle("is-active", isAnalyticsPage());
  });
}

function navigateAnalytics(view, { pushState = true, replaceState = false } = {}) {
  const route = VIEW_ROUTES[view];
  if (!route) return;

  window.__COMMERCE_INITIAL_VIEW = view;

  if (pushState || replaceState) {
    const state = { analyticsView: view };
    if (replaceState) history.replaceState(state, "", route);
    else history.pushState(state, "", route);
  }

  const titles = {
    overview: "Overview — Ember Supply Admin",
    finance: "Finance — Ember Supply Admin",
    health: "Health — Ember Supply Admin",
  };
  document.title = titles[view] || titles.overview;

  const iframe = window.__commerceAnalyticsIframe;
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage({ type: "commerce-analytics-set-view", view }, "*");
    updateAnalyticsNavActive(view);
    return;
  }

  window.location.href = route;
}

function wireAnalyticsNav() {
  document.querySelectorAll("[data-analytics-view]").forEach((link) => {
    if (link.dataset.analyticsWired) return;
    link.dataset.analyticsWired = "1";
    link.addEventListener("click", (e) => {
      if (!isAnalyticsPage()) return;
      e.preventDefault();
      navigateAnalytics(link.dataset.analyticsView);
    });
  });
}

function attachIframe(mount, iframe) {
  mount.replaceChildren(iframe);
}

function createAnalyticsIframe(mount, view) {
  ensureAnalyticsStyles();

  const loading = document.createElement("div");
  loading.className = "analytics-loading";
  loading.id = "analytics-loading";
  loading.innerHTML = '<div class="analytics-loading-card">Loading analytics…</div>';
  mount.replaceChildren(loading);

  const iframe = document.createElement("iframe");
  iframe.className = "analytics-embed-frame";
  iframe.title = "Analytics dashboard";
  iframe.src = `/admin/analytics/embed.html?view=${encodeURIComponent(view)}`;
  iframe.setAttribute("loading", "eager");

  iframe.addEventListener("load", () => {
    loading.remove();
    window.__commerceAnalyticsReady = true;
    iframe.contentWindow?.postMessage({ type: "commerce-analytics-set-view", view }, "*");
  });

  iframe.addEventListener("error", () => {
    mount.innerHTML = `<div class="analytics-error">Analytics failed to load. <a href="/admin/analytics/embed.html?view=${view}">Open directly</a></div>`;
  });

  mount.appendChild(iframe);
  window.__commerceAnalyticsIframe = iframe;
  return iframe;
}

function bootAnalytics(view) {
  window.__COMMERCE_INITIAL_VIEW = view;

  const mount = document.getElementById("analytics-mount");
  if (!mount) return;

  ensureAnalyticsStyles();

  const existing = window.__commerceAnalyticsIframe;
  if (existing && window.__commerceAnalyticsReady) {
    attachIframe(mount, existing);
    existing.contentWindow?.postMessage({ type: "commerce-analytics-set-view", view }, "*");
    updateAnalyticsNavActive(view);
    history.replaceState({ analyticsView: view }, "", VIEW_ROUTES[view]);
    return;
  }

  if (existing && !window.__commerceAnalyticsReady) {
    attachIframe(mount, existing);
    return;
  }

  createAnalyticsIframe(mount, view);
  updateAnalyticsNavActive(view);
  history.replaceState({ analyticsView: view }, "", VIEW_ROUTES[view]);
}

if (!window.__commerceAnalyticsPopstate) {
  window.__commerceAnalyticsPopstate = true;
  window.addEventListener("popstate", () => {
    if (!isAnalyticsPage()) return;
    const view = history.state?.analyticsView || viewFromPath();
    window.__commerceAnalyticsIframe?.contentWindow?.postMessage(
      { type: "commerce-analytics-set-view", view },
      "*"
    );
    updateAnalyticsNavActive(view);
  });
}

window.navigateAnalytics = navigateAnalytics;
window.wireAnalyticsNav = wireAnalyticsNav;
window.bootAnalytics = bootAnalytics;
