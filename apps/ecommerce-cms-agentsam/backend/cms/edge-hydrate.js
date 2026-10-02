/**
 * Server-side [data-cms] slot hydration via HTMLRewriter.
 * Mirrors public/js/cms-hydrate.js for published content at the edge.
 */

import { getPublishedPage } from "./api.js";

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

export async function loadEdgeHydrationContext(env, pageSlug) {
  const slugs = pageSlug === "site" ? ["site"] : ["site", pageSlug];
  const pages = await Promise.all(slugs.map((slug) => getPublishedPage(env, slug)));
  const sectionsByKey = sectionsByKeyFromPages(pages.filter(Boolean));
  return {
    sectionsByKey,
    hydrated: Object.keys(sectionsByKey).length > 0,
  };
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
    const safe = String(value).replace(/'/g, "\\'");
    const existing = el.getAttribute("style") || "";
    const withoutBg = existing.replace(/background-image\s*:\s*[^;]+;?/gi, "").trim();
    const next = `${withoutBg}${withoutBg ? "; " : ""}background-image: url('${safe}')`.trim();
    el.setAttribute("style", next);
  } else {
    el.setAttribute(attr, String(value));
  }
  return true;
}

export class CmsSlotHandler {
  constructor(sectionsByKey) {
    this.sectionsByKey = sectionsByKey;
  }
  element(el) {
    applyCmsSlotValue(el, el.getAttribute("data-cms"), this.sectionsByKey);
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
