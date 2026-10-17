/**
 * Server-side [data-cms] slot hydration via HTMLRewriter.
 * Mirrors public/js/cms-hydrate.js for published content at the edge.
 */

import { getPreviewPage, getPublishedPage } from "./api.js";

function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function sectionsByKeyFromPages(pages) {
  const map = {};
  for (const page of pages) {
    if (!page?.sections?.length) continue;
    for (const section of page.sections) {
      if (section?.key && section.content) {
        map[section.key] = section.content;
      }
    }
  }
  return map;
}

export async function loadEdgeHydrationContext(env, pageSlug, { preview = false, loadPage } = {}) {
  const slugs = pageSlug === "site" ? ["site"] : ["site", pageSlug];
  const resolvePage = loadPage || (preview ? getPreviewPage : getPublishedPage);
  const pages = await Promise.all(slugs.map((slug) => resolvePage(env, slug)));
  const sectionsByKey = sectionsByKeyFromPages(pages.filter(Boolean));
  return {
    sectionsByKey,
    hydrated: Object.keys(sectionsByKey).length > 0,
  };
}

// Same protocol guard as client-side CMS hydration. The HTMLRewriter is
// a publishing surface: a draft-provided link or media field is untrusted.
function safeCmsUrl(value, media = false) {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || /[\u0000-\u001f\u007f]/.test(url)) return null;
  try {
    const scheme = new URL(url, "https://storefront.invalid").protocol;
    if (scheme === "https:" || scheme === "http:") return url;
    if (!media && (scheme === "mailto:" || scheme === "tel:")) return url;
  } catch { /* invalid protocol or URL */ }
  return null;
}

export function applyCmsSlotValue(el, path, sectionsByKey) {
  if (!path) return false;
  const dot = path.indexOf(".");
  if (dot < 0) return false;

  const sectionKey = path.slice(0, dot);
  const field = path.slice(dot + 1);
  const content = sectionsByKey[sectionKey];
  if (!content) return false;

  const value = getPath(content, field);
  if (value == null || value === "") return false;

  const attr = el.getAttribute("data-cms-attr") || "textContent";
  if (attr === "textContent") {
    el.setInnerContent(String(value));
  } else if (attr === "innerHTML") {
    el.setInnerContent(String(value), { html: true });
  } else if (attr === "style.backgroundImage") {
    const url = safeCmsUrl(value, true);
    if (!url) return false;
    // encodeURIComponent deliberately leaves apostrophes and parentheses unchanged;
    // CSS url('...') requires explicitly escaping those delimiters.
    const safe = url.replace(/['"()\\]/g, (part) =>
      "%" + part.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
    const existing = el.getAttribute("style") || "";
    const withoutBg = existing.replace(/background-image\s*:\s*[^;]+;?/gi, "").trim();
    const next = `${withoutBg}${withoutBg ? "; " : ""}background-image: url('${safe}')`.trim();
    el.setAttribute("style", next);
  } else if (attr === "href" || attr === "src") {
    const safe = safeCmsUrl(value, attr === "src");
    if (!safe) return false;
    el.setAttribute(attr, safe);
  } else {
    el.setAttribute(attr, String(value));
  }
  return true;
}

/** Adapt original HTML with local data-cms="field" markers to the same
 * section.field binding contract. No markup or style conversion is required.
 * The streaming HTMLRewriter tracks section entry/exit, including nesting.
 */
export class CmsSectionScopeHandler {
  constructor(scope) { this.scope = scope; }
  element(el) {
    const key = el.getAttribute("data-cms-section");
    if (!key) return;
    this.scope.stack.push(key);
    el.onEndTag(() => {
      this.scope.stack.pop();
    });
  }
}

export class CmsSlotHandler {
  constructor(sectionsByKey, scope = { stack: [] }) {
    this.sectionsByKey = sectionsByKey;
    this.scope = scope;
  }
  element(el) {
    const marker = el.getAttribute("data-cms");
    if (!marker) return;
    const current = this.scope.stack.at(-1);
    const resolved = marker.includes(".") || !current ? marker : current + "." + marker;
    applyCmsSlotValue(el, resolved, this.sectionsByKey);
  }
}

export class HtmlEdgeHydratedHandler {
  element(el) {
    const existing = el.getAttribute("class") || "";
    const classes = new Set(existing.split(/\s+/).filter(Boolean));
    classes.add("cms-edge-hydrated");
    classes.add("cms-hydrated");
    el.setAttribute("class", [...classes].join(" "));
  }
}

export class HeadEdgeHydratedHandler {
  element(el) {
    el.append('<meta name="cms-edge-hydrated" content="1">', { html: true });
  }
}
