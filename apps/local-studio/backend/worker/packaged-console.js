/**
 * Host-only asset mount for the existing Ecommerce Console.
 * No customer Worker or customer account resources are involved.
 */
import { resolveLocalStudioEcommerceAdminRoute } from "../../shared/ecommerce-admin-routes.mjs";
import { FIRST_PAINT_BOOTSTRAP_SCRIPT } from "../../shared/shell-appearance.mjs";

const prefix = "/ecommerce-cms-agentsam/admin/";
const filePattern = /^\/admin\/(?:css|js|partials|brand|assets|dock|profile-popup|media-kit|workbench|theme-previews|_spa|analytics)\/[\w./-]+$/;

export function resolveConsoleFile(pathname, { allowEmbeddedHome = false } = {}) {
  if (pathname === "/admin/host-config.js") return null;
  if (pathname === "/admin/theme-editor/embed-catalog.json") return "theme-editor/embed-catalog.json";
  const route = resolveLocalStudioEcommerceAdminRoute(pathname);
  if (route) {
    // Canonical paths are owned by Local Studio. Only document surfaces are
    // served as top-level packaged documents; Home is the one explicit embed.
    if (route.surface === 'host' && !(allowEmbeddedHome && route.id === 'admin.home')) return null;
    if (route.surface !== 'document' && !(allowEmbeddedHome && route.id === 'admin.home')) return null;
    return route.asset || null;
  }
  if (filePattern.test(pathname) && !pathname.includes("..")) return pathname.slice("/admin/".length);
  return null;
}

/** Canonical Products opens Ecommerce's working catalog; create remains a distinct Product Studio route. */
export function shouldServeProductCatalogView(url) {
  if (!(url instanceof URL) || url.pathname !== '/admin/products') return false;
  return ['store', 'collections', 'platform'].includes(url.searchParams.get('view') || 'store');
}

export async function servePackagedConsole(request, assets, { allowStudioHome = false, storeBootstrap = null } = {}) {
  const uri = new URL(request.url);
  const allowEmbeddedHome = uri.pathname === '/admin/home' && (allowStudioHome || uri.searchParams.get('__agentsamEmbedded') === '1');
  const file = resolveConsoleFile(uri.pathname, { allowEmbeddedHome });
  if (!file) return null;
  // Cloudflare's default HTML handling redirects explicit .html asset
  // URLs to clean URLs. Fetch the canonical clean path directly so the
  // browser remains on the canonical /admin/* path, not the package asset prefix.
  uri.pathname = prefix + (file === "_spa/index.html"
    ? "_spa/" : file.endsWith(".html") ? file.slice(0, -5) : file);
  uri.search = "";
  const result = await assets.fetch(new Request(uri, request));
  if (!result.ok || !file.endsWith(".html")) return result;
  const headers = new Headers(result.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "private, no-store");
  headers.delete("content-length");
  const storeData=storeBootstrap ? '<script type="application/json" id="agentsam-store-bootstrap">'+
    JSON.stringify(storeBootstrap).replace(/</g,'\\u003c')+'</script>' : '';
  const bootstrap = `<script>${FIRST_PAINT_BOOTSTRAP_SCRIPT}</script>`+storeData;
  const html = (await result.text())
    .replace(/<head([^>]*)>/i, `<head$1>${bootstrap}`)
    .replace(/<script src="\/admin\/js\/shell\.js"><\/script>(?:<script src="\/admin\/host-config\.js"><\/script>)?/,
      '<script src="/admin/js/shell.js"></script><script src="/admin/host-config.js"></script>' +
      (file === "theme-editor.html" && new URL(request.url).searchParams.get("source") === "html"
        ? '<link rel="stylesheet" href="/studio-cms-source-host.css"><script src="/studio-cms-source-host.js"></script>' : ''))
    .replaceAll("Fuel & Free Time Admin", "AgentSam Admin")
    .replaceAll("Fuel & Free Time", "AgentSam")
    .replaceAll("fuelnfreetime.com", "agentsam.inneranimalmedia.com");
  return new Response(html, { status: result.status, headers });
}
