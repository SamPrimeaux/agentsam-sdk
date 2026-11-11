/**
 * Product Studio retains its real Ecommerce routes while running inside
 * AgentSam's installed-app iframe. Keep the registered parent URL in sync
 * so refresh, IAM sign-in return and deep links reopen the selected product
 * (and, once saved, the exact design draft) instead of the catalog.
 *
 * This is URL synchronization only: no secondary router or resource store.
 */
const INSTALLED_APP = "/apps/ecommerce-cms-agentsam";
const PRODUCT_ROUTE = /^\/admin\/products\/create(?:\/[A-Za-z0-9_-]+)?$/;
const EDIT_ROUTE = /^\/admin\/product-edit$/;

function onlySearchKeys(params: URLSearchParams, allowedKeys: readonly string[]): boolean {
  let valid = true;
  // URLSearchParams.forEach is supported by DOM without needing the DOM.Iterable
  // TypeScript lib; validate the entire deep-link query before forwarding.
  params.forEach((_value, key) => { if (!allowedKeys.includes(key)) valid = false; });
  return valid;
}

function validCommerceRoute(candidate: string): string | null {
  try {
    const url = new URL(candidate, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (PRODUCT_ROUTE.test(url.pathname)) {
      if (!onlySearchKeys(url.searchParams, ["site_id", "resume", "collection_id"])) return null;
      if (url.searchParams.has("resume") && !/^psd_[A-Za-z0-9_-]+$/.test(url.searchParams.get("resume") || "")) return null;
      if (url.searchParams.has("collection_id") && !/^[A-Za-z0-9_-]{1,128}$/.test(url.searchParams.get("collection_id") || "")) return null;
    } else if (EDIT_ROUTE.test(url.pathname)) {
      if (!/^\d+$/.test(url.searchParams.get("id") || "")) return null;
      if (!onlySearchKeys(url.searchParams, ["id", "site_id"])) return null;
    } else return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

function installedHost(): Window | null {
  if (window.parent === window) return null;
  try {
    const location = window.parent.location;
    if (location.origin !== window.location.origin || location.pathname !== INSTALLED_APP) return null;
    return window.parent;
  } catch {
    return null;
  }
}

/** Mirror SPA route changes to the host URL without remounting the canvas. */
export function syncHostedStudioRoute(candidate: string): void {
  const route = validCommerceRoute(candidate);
  const parent = installedHost();
  if (!route || !parent) return;
  const outer = new URL(parent.location.href);
  if (outer.searchParams.get("page") === route) return;
  outer.searchParams.set("page", route);
  parent.history.replaceState(parent.history.state, "", outer.pathname + outer.search + outer.hash);
}

/** Let the host router handle a stage transition, rather than stranding the iframe. */
export function navigateHostedStudioRoute(candidate: string): boolean {
  const route = validCommerceRoute(candidate);
  const parent = installedHost();
  if (!route || !parent) return false;
  parent.dispatchEvent(new CustomEvent("agentsam:navigate", { detail: { to: route } }));
  return true;
}

/** Persist the exact saved draft deep link without unmounting the active canvas. */
export function rememberStudioDraft(draftId: string): void {
  if (!/^psd_[A-Za-z0-9_-]+$/.test(draftId)) return;
  const current = new URL(window.location.href);
  if (!/^\/admin\/products\/create\/[A-Za-z0-9_-]+$/.test(current.pathname)) return;
  current.searchParams.set("resume", draftId);
  window.history.replaceState(window.history.state, "", current.pathname + current.search + current.hash);
  syncHostedStudioRoute(current.pathname + current.search);
}
