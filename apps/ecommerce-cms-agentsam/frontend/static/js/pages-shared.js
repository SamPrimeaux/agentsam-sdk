/** Shared CMS page editor config (pages list + page edit) */

// Product pages work standalone and inside the installed Local Studio host.
// The host may intercept navigation; without one, normal document routing wins.
window.cmsAdminNavigate = function cmsAdminNavigate(destination) {
  if (window.__agentsamAdminNavigate?.(destination)) return;
  window.location.assign(destination);
};

// Page routes retain their stable D1 page id and selected site. The slug stays
// in the URL as the editable public handle, never as a cross-site identifier.
const cmsInitialParams = new URLSearchParams(window.location.search);
window.cmsActiveSiteId = cmsInitialParams.get("site_id") || null;
window.cmsActivePageId = cmsInitialParams.get("page_id") || null;
window.cmsActivePageSlug = cmsInitialParams.get("slug") || null;
window.cmsAdminFetch = function cmsAdminFetch(path, options) {
  const url = new URL(path, window.location.origin);
  if (!url.pathname.startsWith("/api/admin/cms/")) return window.adminFetch(path, options);
  if (window.cmsActiveSiteId && !url.searchParams.has("site_id")) {
    url.searchParams.set("site_id", window.cmsActiveSiteId);
  }
  const pageMatch = url.pathname.match(/^\/api\/admin\/cms\/pages\/([^/]+)/);
  const routeSlug = pageMatch ? decodeURIComponent(pageMatch[1]) : null;
  if (routeSlug && routeSlug !== "site" && window.cmsActivePageId &&
      window.cmsActivePageSlug === routeSlug && !url.searchParams.has("page_id")) {
    url.searchParams.set("page_id", window.cmsActivePageId);
  }
  return window.adminFetch(url.pathname + url.search, options);
};

window.PAGE_ROUTES = window.AgentSamThemeEditorHost ? (window.AgentSamThemeEditorHost.pageRoutes || {}) : {
  home: "/",
  shop: "/shop",
  about: "/about",
  community: "/community",
  collaborate: "/collaborate",
  policies: "/policies",
  terms: "/terms",
  site: "/",
};

window.PAGE_SLUG_ORDER = window.AgentSamThemeEditorHost ? [] : ["home", "shop", "about", "community", "collaborate", "policies", "terms", "site"];

// Single source for the page-type dropdowns (Add page dialog + page editor).
// Mirrors PAGE_TYPES in backend/cms/site-owned-page-adapter.mjs minus the
// system-owned types (auth, portal, dashboard, sitemap), which are not
// user-creatable. The backend remains the validator.
window.CMS_PAGE_TYPES = [
  { value: "standard",   label: "Standard page",       help: "A general content page." },
  { value: "about",      label: "About",               help: "Story, team, mission." },
  { value: "services",   label: "Services",            help: "What you offer." },
  { value: "work",       label: "Work / portfolio",    help: "Gallery of projects." },
  { value: "case_study", label: "Case study",          help: "One project in depth." },
  { value: "product",    label: "Product display",     help: "Single product or feature profile." },
  { value: "collection", label: "Collection",          help: "A grouped set of products." },
  { value: "blog",       label: "Blog (index)",        help: "List of posts." },
  { value: "post",       label: "Blog post (article)", help: "A single article." },
  { value: "landing",    label: "Landing page",        help: "Campaign or promo page." },
  { value: "pricing",    label: "Pricing",             help: "Plans and tiers." },
  { value: "faq",        label: "FAQ",                 help: "Questions and answers." },
  { value: "contact",    label: "Contact",             help: "Form and details." },
  { value: "privacy",    label: "Privacy policy",      help: "Legal." },
  { value: "terms",      label: "Terms",               help: "Legal." },
  { value: "custom",     label: "Custom",              help: "Free-form page." },
];

window.cmsPageTypeOptions = function cmsPageTypeOptions(selected) {
  const list = window.CMS_PAGE_TYPES.slice();
  // Keep unknown/system types visible so an existing page never shows blank.
  if (selected && !list.some((t) => t.value === selected)) {
    list.push({ value: selected, label: String(selected).replace(/_/g, " "), help: "" });
  }
  return list
    .map((t) => `<option value="${cmsEscapeAttr(t.value)}"${t.value === selected ? " selected" : ""}>${cmsEscapeHtml(t.label)}</option>`)
    .join("");
};

window.cmsPageTypeHelp = function cmsPageTypeHelp(value) {
  return (window.CMS_PAGE_TYPES.find((t) => t.value === value) || {}).help || "";
};

window.SECTION_FIELDS = {};
window.SECTION_SCHEMAS = {};
window.cmsRegistry = null;

window.loadCmsRegistry = async function loadCmsRegistry() {
  if (window.cmsRegistry && !window.AgentSamThemeEditorHost) return window.cmsRegistry;
  const data = window.AgentSamThemeEditorHost
    ? await window.AgentSamThemeEditorHost.adapter.getRegistry()
    : await adminFetch("/api/admin/cms/registry");
  window.cmsRegistry = data;
  // D1 definition read-model; PAGE_REGISTRY is not a source for new components.
  // The old templates remain readable until their persisted renderer-backed
  // placements are migrated, without creating a second editor or a page list.
  window.cmsAuthoring = window.AgentSamCmsAuthoring
    ? window.AgentSamCmsAuthoring.createAuthoringEngine(data.definitions || [])
    : null;
  window.SECTION_FIELDS = {};
  window.SECTION_SCHEMAS = {};
  for (const [slug, page] of Object.entries(data.pages || {})) {
    window.SECTION_FIELDS[slug] = {};
    window.SECTION_SCHEMAS[slug] = {};
    for (const [sectionKey, sec] of Object.entries(page.sections || {})) {
      window.SECTION_FIELDS[slug][sectionKey] = sec.fields || [];
      window.SECTION_SCHEMAS[slug][sectionKey] = sec;
    }
  }
  return data;
};

window.pagePathLabel = function pagePathLabel(slug) {
  if (slug === "home") return "/";
  if (slug === "site") return "(global)";
  return `/${slug}`;
};

window.pagePublicUrl = function pagePublicUrl(slug) {
  if (slug === "site") return "/";
  const route = window.PAGE_ROUTES[slug] || "/";
  return route.startsWith("/") ? route : `/${route}`;
};

window.cmsGetPath = function cmsGetPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
};

window.cmsSetPath = function cmsSetPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
};

window.cmsFieldId = function cmsFieldId(sectionKey, fieldKey) {
  return `f-${sectionKey}-${fieldKey.replace(/\./g, "-")}`;
};

window.cmsEscapeHtml = function cmsEscapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

window.cmsEscapeAttr = function cmsEscapeAttr(s) {
  return cmsEscapeHtml(s).replace(/"/g, "&quot;");
};

window.fmtPageDate = function fmtPageDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};

window.visibilityBadge = function visibilityBadge(status) {
  if (status === "published") {
    return { label: "Visible", cls: "pages-badge pages-badge--visible" };
  }
  return { label: "Hidden", cls: "pages-badge pages-badge--hidden" };
};
