/**
 * Edge HTML transformation for marketing pages (HTMLRewriter is built into Workers).
 * Injects store SEO + page title from D1/KV before the browser parses <head>.
 */

import { PAGE_REGISTRY } from "./registry.js";
import {
  CmsSlotHandler,
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
    const { title, description, socialImageUrl } = this.head;
    const imgTags = socialImageUrl
      ? `<meta property="og:image" content="${escapeAttr(socialImageUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeAttr(socialImageUrl)}">`
      : `<meta name="twitter:card" content="summary">`;

    el.append(
      `<meta name="cms-edge-seo" content="1">
<meta name="description" content="${escapeAttr(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeAttr(title)}">
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

  const preview = request ? new URL(request.url).searchParams.has("preview") : false;
  const head = await buildHeadContext(env, slug);

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

  if (!preview && slug) {
    const hydration = await loadEdgeHydrationContext(env, slug);
    if (hydration.hydrated) {
      edgeHydrated = true;
      rewriter = rewriter
        .on("html", new HtmlEdgeHydratedHandler())
        .on("head", new HeadEdgeHydratedHandler())
        .on("[data-cms]", new CmsSlotHandler(hydration.sectionsByKey));
    }
  }

  const transformed = rewriter.transform(response);
  const headers = new Headers(transformed.headers);
  if (edgeHydrated) {
    headers.set("X-CMS-Edge-Hydrate", "1");
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
