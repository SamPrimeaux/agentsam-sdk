export const EXIT_FALLBACK = "/admin/store";
export const ADMIN_EXIT_ROUTES = [
  "/admin/home",
  "/admin/store",
  "/admin/pages",
  "/admin/page-edit",
  "/admin/content",
  "/admin/orders",
  "/admin/products",
  "/admin/product-edit",
  "/admin/inventory",
  "/admin/preferences",
  "/admin/agentsam",
  "/admin/account",
  "/admin/analytics/overview",
  "/admin/analytics/finance",
  "/admin/analytics/health",
  "/admin/discounts",
  "/admin/growth",
  "/admin/subscribers",
  "/admin/email",
  "/admin/scaffold",
];

function decodePath(value) {
  let current = String(value || "");
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch (error) {
      break;
    }
  }
  return current;
}

function normalizeAdminPath(value) {
  const decoded = decodePath(value).replace(/\\/g, "/");
  if (!decoded || /[\u0000-\u001f\s]/.test(decoded)) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return "";
  if (decoded.includes("://") || decoded.startsWith("//")) return "";
  const path = decoded.split("?")[0].split("#")[0];
  if (!path.startsWith("/")) return "";
  const parts = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return "";
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return "/" + parts.join("/");
}

export function isAllowlistedAdminPath(pathname, routes = ADMIN_EXIT_ROUTES) {
  const path = normalizeAdminPath(pathname);
  if (!path.startsWith("/admin/") || path.startsWith("/admin/theme-editor") || path.startsWith("/admin/theme-workspace")) return false;
  return routes.some(function(route) {
    return path === route || path.startsWith(route + "/");
  });
}

export function resolveExitTarget(candidate, stored) {
  const direct = normalizeAdminPath(candidate);
  const remembered = normalizeAdminPath(stored);
  const path = isAllowlistedAdminPath(direct) ? direct : remembered;
  return isAllowlistedAdminPath(path) ? path : EXIT_FALLBACK;
}
