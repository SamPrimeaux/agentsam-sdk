/**
 * Edge HTML transformation for marketing pages (HTMLRewriter is built into Workers).
 * Injects store SEO + page title from D1/KV before the browser parses <head>.
 */

import { PAGE_REGISTRY } from "./registry.js";
import {
  CmsSlotHandler,
  CmsSectionScopeHandler,
  HeadEdgeHydratedHandler,
  HtmlEdgeHydratedHandler,
  loadEdgeHydrationContext,
} from "./edge-hydrate.js";

const PATH_TO_SLUG = new Map([
  ["/", "home"],
  ["/index.html", "home"],
  ["/shop", "shop"],
  ["/shop.html", "shop"],
  ["/about", "about"],
  ["/about.html", "about"],
  ["/community", "community"],
  ["/community.html", "community"],
  ["/collaborate", "collaborate"],
  ["/collaborate.html", "collaborate"],
  ["/policies", "policies"],
  ["/policies.html", "policies"],
  ["/terms", "terms"],
  ["/terms.html", "terms"],
]);

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * Canonical public URL for a storefront request: origin + clean path, no
 * query/hash, no .html suffix. Returns "" for anything that is not https.
 */
export function canonicalUrlFor(requestUrl) {
  try {
    const u = new URL(requestUrl);
    if (u.protocol !== "https:") return "";
    let path = u.pathname.replace(/\/index\.html$/i, "/").replace(/\.html$/i, "");
    if (!path) path = "/";
    return `${u.origin}${path}`;
  } catch {
    return "";
  }
}

export function slugForStorefrontPath(pathname) {
  return PATH_TO_SLUG.get(pathname) || null;
}

export function slugForAssetPath(assetPath) {
  if (assetPath === "/index.html") return "home";
  const base = String(assetPath || "")
    .replace(/^\//, "")
    .replace(/\.html$/i, "");
  return PAGE_REGISTRY[base] ? base : null;
}

export function isMarketingHtmlRequest(pathname, assetPath) {
  const slug = slugForStorefrontPath(pathname) || slugForAssetPath(assetPath);
  return Boolean(slug);
}

async function buildHeadContext(env, slug) {
  const { loadStorePreferences } = await import("../admin/store.js");
  const loadedPrefs = await loadStorePreferences(env);
  const prefs = loadedPrefs?.ok ? loadedPrefs.settings : {};

  let pageTitle = null;
  if (slug && slug !== "site") {
    try {
      const { getPublishedPage } = await import("./api.js");
      const page = await getPublishedPage(env, slug);
      pageTitle = page?.title || PAGE_REGISTRY[slug]?.title || null;
    } catch {
      /* prefs-only fallback */
    }
  }

  const siteTitle = prefs.homeTitle || "";
  const title =
    pageTitle && slug !== "home" ? `${pageTitle} — ${siteTitle}` : siteTitle;

  return {
    title,
    description: prefs.metaDescription || "",
    socialImageUrl: prefs.socialImageUrl || "",
    siteName: siteTitle,
    canonicalUrl: "",
  };
}

class TitleHandler {
  constructor(title) {
    this.title = title;
  }
  element(el) {
    if (this.title) el.setInnerContent(this.title);
  }
}

class MetaContentHandler {
  constructor(value) {
    this.value = value;
  }
  element(el) {
    if (this.value) el.setAttribute("content", this.value);
  }
}

class HeadSeoAppendHandler {
  constructor(head) {
    this.head = head;
  }
  element(el) {
    const { title, description, socialImageUrl, canonicalUrl, siteName } = this.head;
    const imgTags = socialImageUrl
      ? `<meta property="og:image" content="${escapeAttr(socialImageUrl)}">
<meta property="og:image:alt" content="${escapeAttr(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeAttr(socialImageUrl)}">`
      : `<meta name="twitter:card" content="summary">`;

    el.append(
      `<meta name="cms-edge-seo" content="1">
<meta name="description" content="${escapeAttr(description)}">
<meta property="og:type" content="website">
${siteName ? `<meta property="og:site_name" content="${escapeAttr(siteName)}">\n` : ""}${canonicalUrl ? `<link rel="canonical" href="${escapeAttr(canonicalUrl)}">\n<meta property="og:url" content="${escapeAttr(canonicalUrl)}">\n` : ""}<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta name="twitter:title" content="${escapeAttr(title)}">
<meta name="twitter:description" content="${escapeAttr(description)}">
${imgTags}`,
      { html: true }
    );
  }
}

export async function transformStorefrontHtml(response, env, slug, request) {
  const contentType = response.headers.get("content-type") || "";
  if (response.status !== 200 || !contentType.includes("text/html")) {
    return response;
  }

  const preview = request ? new URL(request.url).searchParams.get("preview") === "1" : false;
  if (preview) {
    // A private CMS draft cannot be inserted into a public/cached HTML response.
    const { getSessionUser } = await import("../lib/auth.js");
    const user = await getSessionUser(request, env);
    if (!user) {
      return new Response("Authentication required for draft preview", {
        status: 401,
        headers: { "cache-control": "private, no-store", "content-type": "text/plain; charset=utf-8" },
      });
    }
    const { canReadCmsDraft } = await import("./api.js");
    if (!(await canReadCmsDraft(env, slug, user.account_id))) {
      return new Response("Draft not available for this account", {
        status: 403,
        headers: { "cache-control": "private, no-store", "content-type": "text/plain; charset=utf-8" },
      });
    }
  }
  const head = await buildHeadContext(env, slug);
  head.canonicalUrl = preview ? "" : canonicalUrlFor(request?.url);
  // Open Graph and Twitter require an absolute image URL to reliably fetch
  // the chosen R2-backed image from social crawlers.
  if (head.socialImageUrl) {
    try {
      const resolved = new URL(head.socialImageUrl, request?.url || "https://fuelnfreetime.com");
      head.socialImageUrl = resolved.protocol === "https:" ? resolved.href : "";
    } catch { head.socialImageUrl = ""; }
  }

  let rewriter = new HTMLRewriter()
    .on("title", new TitleHandler(head.title))
    .on('meta[name="description"]', new MetaContentHandler(head.description))
    .on('meta[property="og:title"]', new MetaContentHandler(head.title))
    .on('meta[property="og:description"]', new MetaContentHandler(head.description))
    .on('meta[property="og:image"]', new MetaContentHandler(head.socialImageUrl))
    .on('meta[name="twitter:title"]', new MetaContentHandler(head.title))
    .on('meta[name="twitter:description"]', new MetaContentHandler(head.description))
    .on('meta[name="twitter:image"]', new MetaContentHandler(head.socialImageUrl))
    .on("head", new HeadSeoAppendHandler(head));

  let edgeHydrated = false;

  if (slug) {
    // Preserve source HTML/CSS and hydrate its CMS slots from the correct
    // versioned authority: private draft for preview, publication for live.
    const hydration = await loadEdgeHydrationContext(env, slug, { preview });
    if (hydration.hydrated) {
      edgeHydrated = true;
      const scope = { stack: [] };
      rewriter = rewriter
        .on("html", new HtmlEdgeHydratedHandler())
        .on("head", new HeadEdgeHydratedHandler())
        .on("[data-cms-section]", new CmsSectionScopeHandler(scope))
        .on("[data-cms]", new CmsSlotHandler(hydration.sectionsByKey, scope));
    }
  }

  const transformed = rewriter.transform(response);
  const headers = new Headers(transformed.headers);
  if (edgeHydrated) {
    headers.set("X-CMS-Edge-Hydrate", "1");
  }
  if (preview) {
    headers.set("Cache-Control", "private, no-store");
    headers.set("Vary", "Cookie");
    headers.set("X-CMS-Draft-Preview", "1");
  }
  return new Response(transformed.body, {
    status: transformed.status,
    statusText: transformed.statusText,
    headers,
  });
}

export async function serveStorefrontPage(request, env, assetPath, slug) {
  const url = new URL(request.url);
  url.pathname = assetPath;
  url.search = "";
  const res = await env.ASSETS.fetch(new Request(url, request));
  return transformStorefrontHtml(res, env, slug, request);
}
