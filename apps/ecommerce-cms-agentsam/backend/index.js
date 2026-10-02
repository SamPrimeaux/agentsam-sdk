/**
 * Fuel & Free Time — Worker entry point
 *
 * Bindings (see wrangler.toml):
 *   DB             D1 database "fuelnfreetime"
 *   WEBSITE_ASSETS R2 bucket "fuelnfreetime"
 *   AGENTSAM_WAI   Workers AI
 *   CMS_CACHE      KV namespace "fuelnfreetime-cache"
 *   ASSETS         Static files served from /public (marketing pages + /admin dashboard)
 */

import { handleAdminApi } from "./admin/api.js";
import { serveCatalogImage } from "./completeful/images.js";
import { runAgentsamCompaction } from "./agentsam/compaction.js";
import { drainAssetJobs, processAssetJobById } from "./assets/product-optimize.js";
import { handleStoreApi } from "./store/api.js";
import { handleAttributionApi } from "./attribution/api.js";
import { handlePublicCmsApi } from "./cms/api.js";
import { handleCmsWarmInternal } from "./cms/deploy.js";
import {
  serveStorefrontPage,
  slugForAssetPath,
  slugForStorefrontPath,
} from "./cms/html-rewriter.js";
import { getSessionUser } from "./lib/auth.js";
import { getCompany, handleCompanyApi } from "./lib/company.js";
import {
  adminCleanUrl,
  adminHtmlFile,
  adminLoginPath,
  isAdminPublicPath,
  redirectToAdminLogin,
} from "./lib/admin-routes.js";
import { redirectWww, resolveStorefrontPath, serveStaticAlias, STORE_HTML_REDIRECTS, PAGES_CLEAN_REDIRECTS } from "./lib/routes.js";
import { ADMIN_REDIRECTS } from "./lib/route-manifest.js";

import {
  handleResendOutboundWebhook,
  handleResendInboundWebhook,
  handleResendWebhookLegacy,
} from "./webhooks/resend.js";
import { handleCompletefulWebhook } from "./webhooks/completeful.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleNewsletter(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const sourcePage = (body.source_page || "").slice(0, 200);

  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid email" }, { status: 400 });
  }

  try {
    await env.DB.prepare(
      `INSERT INTO newsletter_subscribers (email, source_page, created_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(email) DO NOTHING`
    )
      .bind(email, sourcePage)
      .run();
  } catch (err) {
    return Response.json({ error: "Could not save signup" }, { status: 500 });
  }

  return Response.json({ ok: true });
}

// Serve an object straight out of the media R2 bucket. Public — these are
// product/marketing images meant to be viewed on the storefront.
function parseAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function applyMediaCors(request, headers, env) {
  const origin = request.headers.get("Origin");
  const allowed = parseAllowedOrigins(env);
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  } else if (!origin) {
    headers.set("Access-Control-Allow-Origin", "*");
  }
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Expose-Headers", "ETag, Content-Length, Content-Type, Accept-Ranges, Content-Range");
  headers.set("Access-Control-Max-Age", "86400");
}

function mediaCacheControl(key) {
  const ext = (key.split(".").pop() || "").toLowerCase();
  const longLived = new Set([
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "mp4",
    "mov",
    "webm",
    "glb",
    "usdz",
    "gltf",
  ]);
  if (longLived.has(ext)) {
    return "public, max-age=31536000, immutable, stale-while-revalidate=86400";
  }
  return "public, max-age=86400, stale-while-revalidate=3600";
}

async function handleMediaServe(request, env, key) {
  if (request.method === "OPTIONS") {
    const headers = new Headers();
    applyMediaCors(request, headers, env);
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rangeHeader = request.headers.get("Range");
  const getOpts = rangeHeader ? { range: request.headers } : undefined;
  const object = await env.WEBSITE_ASSETS.get(key, getOpts);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", mediaCacheControl(key));
  headers.set("cdn-cache-control", mediaCacheControl(key));
  applyMediaCors(request, headers, env);

  if (!headers.get("content-type")) {
    const ext = (key.split(".").pop() || "").toLowerCase();
    const types = {
      glb: "model/gltf-binary",
      usdz: "model/vnd.usdz+zip",
      gltf: "model/gltf+json",
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
    };
    if (types[ext]) headers.set("content-type", types[ext]);
  }

  const isPartial = rangeHeader && headers.has("content-range");
  const status = isPartial ? 206 : 200;
  const body = request.method === "HEAD" ? null : object.body;
  return new Response(body, { status, headers });
}

// Any response tied to admin session state must never be cached at the
// edge — otherwise one user's authenticated page can get served to the
// next unauthenticated visitor straight from cache.
function noStore(response) {
  const r = new Response(response.body, response);
  r.headers.set("cache-control", "private, no-store");
  return r;
}

const ADMIN_LOGIN = adminLoginPath();

const ADMIN_SPA_INDEX = "/admin/_spa/index.html";
const ADMIN_ANALYTICS_PREFIX = "/admin/analytics";

async function serveAdminPage(request, env, assetPath) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  return noStore(await env.ASSETS.fetch(new Request(assetUrl, request)));
}

async function gateAdminPage(request, env, pathname) {
  if (isAdminPublicPath(pathname)) return null;
  const user = await getSessionUser(request, env);
  if (!user) return noStore(redirectToAdminLogin(request));
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const wwwRedirect = redirectWww(request);
    if (wwwRedirect) return wwwRedirect;

    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/catalog-image") return serveCatalogImage(request, env, ctx);

    if (path === "/api/health") {
      const company = await getCompany(env);
      let domain = null;
      try {
        domain = company?.websiteUrl
          ? new URL(company.websiteUrl.includes("://") ? company.websiteUrl : `https://${company.websiteUrl}`)
              .hostname
          : null;
      } catch {
        domain = null;
      }
      return Response.json({
        ok: true,
        app: company?.name || null,
        domain,
        host: url.hostname,
        company_id: company?.id || null,
        bindings: {
          db: !!env.DB,
          r2: !!env.WEBSITE_ASSETS,
          ai: !!env.AGENTSAM_WAI,
          kv: !!env.CMS_CACHE,
          cms: !!env.DB && !!env.WEBSITE_ASSETS,
          assets: !!env.ASSETS,
          assetJobs: !!env.ASSET_JOBS,
        },
      });
    }

    if (path === "/api/company") {
      if (request.method === "PATCH") {
        const user = await getSessionUser(request, env);
        if (!user) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
      }
      return handleCompanyApi(request, env);
    }

    if (path === "/api/newsletter" && request.method === "POST") {
      return handleNewsletter(request, env);
    }

    if (path === "/api/attribution/visit" && request.method === "POST") {
      return handleAttributionApi(request, env, url);
    }

    if (path === "/go" && request.method === "GET") {
      return handleAttributionApi(request, env, url);
    }

    if (path === "/api/webhooks/resend/outbound" && request.method === "POST") {
      return handleResendOutboundWebhook(request, env);
    }

    if (path === "/api/webhooks/resend/inbound" && request.method === "POST") {
      return handleResendInboundWebhook(request, env);
    }

    if (path === "/api/agentsam/webhooks/resend" && request.method === "POST") {
      return handleResendWebhookLegacy(request, env);
    }

    if (path === "/api/webhooks/completeful" && request.method === "POST") {
      return handleCompletefulWebhook(request, env);
    }

    if (path === "/api/internal/cms/warm" && request.method === "POST") {
      return handleCmsWarmInternal(request, env);
    }

    // Asset jobs: Queue consumer + hourly stale recovery only.
    // Compaction: scheduled() only.
    // Manual ops: authenticated /api/admin/* (no secret-header endpoints).

    if (path.startsWith("/api/store/")) {
      return handleStoreApi(request, env, url);
    }

    if (path.startsWith("/api/cms/")) {
      return handlePublicCmsApi(request, env, url);
    }

    if (path.startsWith("/api/admin/")) {
      return noStore(await handleAdminApi(request, env, url, ctx));
    }

    if (path.startsWith("/media/")) {
      return handleMediaServe(request, env, path.slice("/media/".length));
    }

    // Legacy growth scaffold URL → /admin/growth
    if (path === "/admin/scaffold" && url.searchParams.get("view") === "growth") {
      return noStore(Response.redirect(new URL("/admin/growth", request.url), 301));
    }

    // Legacy discounts scaffold URL → /admin/discounts
    if (path === "/admin/scaffold" && url.searchParams.get("view") === "discounts") {
      return noStore(Response.redirect(new URL("/admin/discounts", request.url), 301));
    }

    // Clean admin URLs — /admin/login, /admin/home, …
    const adminAsset = adminHtmlFile(path);
    if (adminAsset) {
      const denied = await gateAdminPage(request, env, path);
      if (denied) return denied;
      return serveAdminPage(request, env, adminAsset);
    }

    // Legacy /admin-app/* → clean analytics URLs
    if (path === "/admin-app" || path.startsWith("/admin-app/")) {
      const dest = ADMIN_REDIRECTS.get(path) || "/admin/analytics/overview";
      return noStore(Response.redirect(new URL(dest, request.url), 301));
    }

    // SPA static assets (Vite build)
    if (path === "/admin/_spa" || path.startsWith("/admin/_spa/")) {
      const user = await getSessionUser(request, env);
      if (!user) {
        return noStore(redirectToAdminLogin(request));
      }
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status !== 404) {
        return noStore(assetRes);
      }
    }

    // Analytics SPA — /admin/analytics/overview|finance|health (no .html)
    const analyticsViewMatch = path.match(/^\/admin\/analytics\/(overview|finance|health)\/?$/);
    const accountViewMatch = path === "/admin/account" || path === "/admin/account/";
    const productStudioMatch = /^\/admin\/products\/create(?:\/[^/]+)?\/?$/.test(path);
    const productArtworkHelpMatch = /^\/admin\/products\/help\/artwork\/?$/.test(path);
    if (path === ADMIN_ANALYTICS_PREFIX || path === `${ADMIN_ANALYTICS_PREFIX}/`) {
      const user = await getSessionUser(request, env);
      if (!user) {
        return noStore(redirectToAdminLogin(request));
      }
      return noStore(
        Response.redirect(new URL(`${ADMIN_ANALYTICS_PREFIX}/overview`, request.url), 302)
      );
    }
    if (analyticsViewMatch || accountViewMatch || productStudioMatch || productArtworkHelpMatch) {
      const user = await getSessionUser(request, env);
      if (!user) {
        return noStore(redirectToAdminLogin(request));
      }
      const indexUrl = new URL(request.url);
      indexUrl.pathname = ADMIN_SPA_INDEX;
      indexUrl.search = "";
      return noStore(await env.ASSETS.fetch(new Request(indexUrl, request)));
    }

    // /admin and /admin/ resolve based on session state
    if (path === "/admin" || path === "/admin/") {
      const user = await getSessionUser(request, env);
      const dest = user ? "/admin/home" : ADMIN_LOGIN;
      return noStore(Response.redirect(new URL(dest, request.url), 302));
    }

    // Legacy /admin/*.html → canonical clean URLs (301)
    if (path.startsWith("/admin/") && path.endsWith(".html")) {
      const redirect = ADMIN_REDIRECTS.get(path);
      if (redirect) {
        return noStore(Response.redirect(new URL(redirect, request.url), 301));
      }

      const clean = adminCleanUrl(path);
      if (clean) {
        const dest = new URL(request.url);
        dest.pathname = clean;
        return noStore(Response.redirect(dest, 301));
      }

      if (!isAdminPublicPath(path)) {
        const user = await getSessionUser(request, env);
        if (!user) {
          return noStore(redirectToAdminLogin(request));
        }
      }
      return noStore(await env.ASSETS.fetch(request));
    }

    // Every remaining dashboard asset (including package modules and partials)
    // shares the dashboard session boundary. Login is served above.
    if (path.startsWith('/admin/')) {
      const denied = await gateAdminPage(request, env, path);
      if (denied) return denied;
      return noStore(await env.ASSETS.fetch(request));
    }

    // Stripe order-confirmation landing — serve before alias/CMS resolution.
    if (path === "/order-confirmation" || path === "/order-confirmation/") {
      const dest = new URL(request.url);
      dest.pathname = "/order-confirmation.html";
      return env.ASSETS.fetch(new Request(dest, request));
    }

    // Legacy *.html storefront URLs → clean paths
    const cleanStore = STORE_HTML_REDIRECTS.get(path);
    if (cleanStore) {
      const dest = new URL(request.url);
      dest.pathname = cleanStore;
      return Response.redirect(dest.toString(), 301);
    }

    // Shopify /pages/* → clean paths
    const cleanPages = PAGES_CLEAN_REDIRECTS.get(path);
    if (cleanPages) {
      const dest = new URL(request.url);
      dest.pathname = cleanPages;
      return Response.redirect(dest.toString(), 301);
    }

    // Shopify-style paths and legacy URLs on custom domain
    const alias = resolveStorefrontPath(path);
    if (alias) {
      const slug = slugForStorefrontPath(path) || slugForAssetPath(alias);
      if (slug) return serveStorefrontPage(request, env, alias, slug);
      return serveStaticAlias(request, env, alias);
    }

    const productMatch = path.match(/^\/products\/([^/]+)\/?$/);
    if (productMatch) {
      const productUrl = new URL(request.url);
      productUrl.pathname = "/product.html";
      productUrl.searchParams.set("slug", productMatch[1]);
      return env.ASSETS.fetch(new Request(productUrl, request));
    }

    if (path === "/shop/collections" || path === "/shop/collections/") {
      const collectionsUrl = new URL(request.url);
      collectionsUrl.pathname = "/collections.html";
      return env.ASSETS.fetch(new Request(collectionsUrl, request));
    }

    const collectionMatch = path.match(/^\/shop\/collections\/([^/]+)\/?$/);
    if (collectionMatch) {
      const collectionUrl = new URL(request.url);
      collectionUrl.pathname = "/collection.html";
      collectionUrl.searchParams.set("slug", collectionMatch[1]);
      return env.ASSETS.fetch(new Request(collectionUrl, request));
    }

    const legacyCollectionMatch = path.match(/^\/collections\/([^/]+)\/?$/);
    if (legacyCollectionMatch) {
      const canonical = new URL(request.url);
      canonical.pathname = `/shop/collections/${legacyCollectionMatch[1]}`;
      canonical.search = "";
      return Response.redirect(canonical.toString(), 301);
    }

    // html_handling = "none" means Cloudflare won't auto-map "/" to
    // index.html, so do it ourselves before falling through to ASSETS.
    if (path === "/") {
      return serveStorefrontPage(request, env, "/home.html", "home");
    }

    const marketingSlug = slugForStorefrontPath(path);
    if (marketingSlug && path.endsWith(".html")) {
      return serveStorefrontPage(request, env, path, marketingSlug);
    }

    // Everything else falls through to the static site in /public
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    // Hourly stale-job recovery — Queue is the primary asset processor.
    if (event.cron === "0 * * * *" || String(event.cron || "").startsWith("0 *")) {
      ctx.waitUntil(
        drainAssetJobs(env, {
          limit: 10,
          runtime: "worker",
          staleOnly: true,
          staleAfterSec: 3600,
        }).catch((err) => {
          console.error("asset stale recovery failed", err?.message || err);
        }),
      );
      return;
    }
    ctx.waitUntil(
      runAgentsamCompaction(env, {
        trigger_source: "cron",
        cron: event.cron,
      }).catch((err) => {
        console.error("agentsam scheduled compaction failed", err?.message || err);
      }),
    );
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      const jobId = message.body?.job_id;
      if (!jobId) {
        message.ack();
        continue;
      }
      try {
        await processAssetJobById(env, jobId, { runtime: "worker" });
        message.ack();
      } catch (err) {
        console.error("[asset-queue] job failed", jobId, err?.message || err);
        message.retry();
      }
    }
  },
};
