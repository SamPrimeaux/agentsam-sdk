/**
 * Host-only asset mount for the existing Ecommerce Console.
 * No customer Worker or customer account resources are involved.
 */
import { adminRouteForPath } from "../../../ecommerce-cms-agentsam/backend/lib/route-manifest.js";
import { isStudioAdminPath } from "../../shared/studio-admin-routes.mjs";

const prefix = "/ecommerce-cms-agentsam/admin/";
const filePattern = /^\/admin\/(?:css|js|partials|brand|assets|dock|profile-popup|media-kit|workbench|theme-previews|_spa|analytics)\/[\w./-]+$/;

export function resolveConsoleFile(pathname) {
  // Studio-owned authenticated app paths must reach Nitro, not legacy Ecommerce HTML.
  if (isStudioAdminPath(pathname)) return null;
  if (pathname === "/sites") return "store.html";
  if (pathname === "/admin/host-config.js") return null;
  const match = adminRouteForPath(pathname);
  if (match?.handler === "admin-html") return (match.asset || "/admin/" + match.page + ".html").replace(/^\/admin\//, "");
  if (match?.handler === "admin-spa") return "_spa/index.html";
  if (filePattern.test(pathname) && !pathname.includes("..")) return pathname.slice("/admin/".length);
  return null;
}

export async function servePackagedConsole(request, assets) {
  const file = resolveConsoleFile(new URL(request.url).pathname);
  if (!file) return null;
  const uri = new URL(request.url);
  // Cloudflare's default HTML handling redirects explicit .html asset
  // URLs to clean URLs. Fetch the canonical clean path directly so the
  // browser remains on /admin/* or /sites, not the package asset prefix.
  uri.pathname = prefix + (file === "_spa/index.html"
    ? "_spa/" : file.endsWith(".html") ? file.slice(0, -5) : file);
  uri.search = "";
  const result = await assets.fetch(new Request(uri, request));
  if (!result.ok || !file.endsWith(".html")) return result;
  const headers = new Headers(result.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "private, no-store");
  headers.delete("content-length");
  const html = (await result.text())
    .replace(/<script src="\/admin\/js\/shell\.js"><\/script>/,
      '<script src="/admin/js/shell.js"></script><script src="/admin/host-config.js"></script>')
    .replaceAll("Fuel & Free Time Admin", "AgentSam Admin")
    .replaceAll("Fuel & Free Time", "AgentSam")
    .replaceAll("fuelnfreetime.com", "agentsam.inneranimalmedia.com");
  return new Response(html, { status: result.status, headers });
}
