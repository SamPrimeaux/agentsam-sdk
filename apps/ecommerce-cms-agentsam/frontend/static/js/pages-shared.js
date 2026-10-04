/** Shared CMS page editor config (pages list + page edit) */

window.PAGE_ROUTES = window.AgentSamThemeEditorHost?.pageRoutes || {
  home: "/",
  shop: "/shop",
  about: "/about",
  community: "/community",
  collaborate: "/collaborate",
  policies: "/policies",
  terms: "/terms",
  site: "/",
};

window.PAGE_SLUG_ORDER = ["home", "shop", "about", "community", "collaborate", "policies", "terms", "site"];

window.SECTION_FIELDS = {};
window.SECTION_SCHEMAS = {};
window.cmsRegistry = null;

window.loadCmsRegistry = async function loadCmsRegistry() {
  if (window.cmsRegistry) return window.cmsRegistry;
  const data = window.AgentSamThemeEditorHost
    ? await window.AgentSamThemeEditorHost.adapter.getRegistry()
    : await adminFetch("/api/admin/cms/registry");
  window.cmsRegistry = data;
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

