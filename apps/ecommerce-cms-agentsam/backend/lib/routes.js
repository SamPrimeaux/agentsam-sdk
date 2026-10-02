/**
 * Storefront URL aliases — compiled from route-manifest + static asset map.
 */

import {
  STORE_HTML_REDIRECTS,
  PAGES_CLEAN_REDIRECTS,
} from "./route-manifest.js";

export { STORE_HTML_REDIRECTS, PAGES_CLEAN_REDIRECTS };

const PAGE_ALIASES = new Map([
  ["/shop", "/shop.html"],
  ["/shop/", "/shop.html"],
  ["/about", "/about.html"],
  ["/about/", "/about.html"],
  ["/community", "/community.html"],
  ["/community/", "/community.html"],
  ["/collaborate", "/collaborate.html"],
  ["/collaborate/", "/collaborate.html"],
  ["/policies", "/policies.html"],
  ["/policies/", "/policies.html"],
  ["/terms", "/terms.html"],
  ["/terms/", "/terms.html"],
  ["/pages/shop", "/shop.html"],
  ["/pages/shop/", "/shop.html"],
  ["/pages/community", "/community.html"],
  ["/pages/community/", "/community.html"],
  ["/pages/collaborate", "/collaborate.html"],
  ["/pages/collaborate/", "/collaborate.html"],
  ["/pages/policies", "/policies.html"],
  ["/pages/policies/", "/policies.html"],
  ["/pages/terms", "/terms.html"],
  ["/pages/terms/", "/terms.html"],
  ["/pages/about", "/about.html"],
  ["/pages/about/", "/about.html"],
  ["/pages/cart", "/cart.html"],
  ["/pages/cart/", "/cart.html"],
  ["/cart", "/cart.html"],
  ["/cart/", "/cart.html"],
]);

/** Apex host for www redirect — from company at runtime when possible; apex map for DNS. */
export function canonicalHost(hostname, apexHost = null) {
  if (apexHost && hostname === `www.${apexHost}`) return apexHost;
  if (hostname.startsWith("www.")) return hostname.slice(4);
  return hostname;
}

export function redirectWww(request, apexHost = null) {
  const url = new URL(request.url);
  const nextHost = canonicalHost(url.hostname, apexHost);
  if (nextHost === url.hostname) return null;
  url.hostname = nextHost;
  return Response.redirect(url.toString(), 301);
}

export function resolveStorefrontPath(pathname) {
  return PAGE_ALIASES.get(pathname) || null;
}

export function serveStaticAlias(request, env, destPath) {
  const url = new URL(request.url);
  url.pathname = destPath;
  url.search = "";
  return env.ASSETS.fetch(new Request(url, request));
}
