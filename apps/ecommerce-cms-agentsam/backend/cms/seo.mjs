// One SEO resolver for the whole CMS: editor preview, page renderer and sitemap all call this.
// Layers (first non-empty wins): page.seo_json -> site.settings_json.seo -> derived.
// Page keys:  title, description, og_image, canonical (override only), noindex.
// Site keys:  site_name, title_template, home_title, default_description, default_og_image,
//             robots, twitter_handle, locale.

const LIMITS = Object.freeze({ title: [15, 60], description: [70, 160] });
const ALIASES = Object.freeze({ canonical_url: "canonical", og_image_asset_id: "og_image", meta_title: "title", seo_title: "title", meta_description: "description" });

const str = (v) => (typeof v === "string" ? v.trim() : "");
const obj = (v) => {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) { try { const p = JSON.parse(v); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; } catch { return {}; } }
  return {};
};

export function normalizeSeo(input) {
  const raw = obj(input);
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[ALIASES[k] || k] = v;
  const clean = {};
  for (const key of ["title", "description", "og_image", "canonical"]) { const v = str(out[key]); if (v) clean[key] = v; }
  const robots = str(out.robots).toLowerCase();
  if (out.noindex === true || robots.includes("noindex")) clean.noindex = true;
  return clean;
}

export function normalizeSiteSeo(settings) {
  const s = obj(obj(settings).seo);
  const clean = {};
  for (const key of ["site_name", "title_template", "home_title", "default_description", "default_og_image", "robots", "twitter_handle", "locale"]) {
    const v = str(s[key]); if (v) clean[key] = v;
  }
  return clean;
}

export function derivedCanonical(site, page, origin) {
  const base = str(origin) || (str(site?.primary_domain) ? `https://${str(site.primary_domain).replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : "");
  const path = str(page?.route_path) || "/";
  const clean = path === "/" ? "/" : `/${path.replace(/^\/+|\/+$/g, "")}`;
  return base ? `${base}${clean}` : "";
}

const absolutize = (url, origin) => (!url ? "" : /^https?:\/\//i.test(url) ? url : origin && url.startsWith("/") ? `${origin}${url}` : url);

export function resolveSeo({ page = {}, site = {}, origin = "" } = {}) {
  const p = normalizeSeo(page.seo_json ?? page.seo);
  const d = normalizeSiteSeo(site.settings_json ?? site.settings);
  const siteName = d.site_name || str(site.name);
  const isHome = (str(page.route_path) || "/") === "/";
  const base = str(origin) || (str(site.primary_domain) ? `https://${str(site.primary_domain).replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : "");

  let title = p.title;
  if (!title) {
    if (isHome) title = d.home_title || siteName || str(page.title);
    else {
      const t = str(page.title);
      title = d.title_template && t ? d.title_template.replace("{title}", t).replace("{site_name}", siteName) : t;
    }
  }
  const description = p.description || d.default_description || "";
  const canonical = p.canonical || derivedCanonical(site, page, base);
  const hidden = p.noindex === true || str(page.status) !== "published" || page.requires_auth === 1 || page.requires_auth === true;
  const robots = hidden ? "noindex,follow" : (d.robots || "index,follow,max-image-preview:large");
  const image = absolutize(p.og_image || d.default_og_image, base);

  const jsonld = [];
  if (isHome && base) {
    jsonld.push({ "@context": "https://schema.org", "@type": "WebSite", name: siteName, url: base });
    jsonld.push({ "@context": "https://schema.org", "@type": "Organization", name: siteName, url: base, ...(image ? { logo: image } : {}) });
  } else if (base && canonical) {
    jsonld.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: siteName || "Home", item: base + "/" },
      { "@type": "ListItem", position: 2, name: str(page.title) || title, item: canonical },
    ] });
  }

  return {
    title, description, canonical, robots, indexable: !hidden,
    og: { type: "website", title, description, url: canonical, image, site_name: siteName, locale: d.locale || "" },
    twitter: { card: image ? "summary_large_image" : "summary", site: d.twitter_handle || "" },
    jsonld,
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderHeadTags(r) {
  const tags = [];
  const meta = (attr, name, content) => { if (content) tags.push(`<meta ${attr}="${name}" content="${esc(content)}">`); };
  if (r.title) tags.push(`<title>${esc(r.title)}</title>`);
  meta("name", "description", r.description);
  meta("name", "robots", r.robots);
  if (r.canonical) tags.push(`<link rel="canonical" href="${esc(r.canonical)}">`);
  meta("property", "og:type", r.og.type); meta("property", "og:title", r.og.title);
  meta("property", "og:description", r.og.description); meta("property", "og:url", r.og.url);
  meta("property", "og:image", r.og.image); meta("property", "og:site_name", r.og.site_name);
  meta("property", "og:locale", r.og.locale);
  meta("name", "twitter:card", r.twitter.card); meta("name", "twitter:site", r.twitter.site);
  for (const block of r.jsonld) tags.push(`<script type="application/ld+json">${JSON.stringify(block).replace(/</g, "\\u003c")}</script>`);
  return tags.join("\n");
}

// Editor guardrails: warnings, never blockers.
export function lintSeo(resolved, { siblingTitles = [] } = {}) {
  const w = [];
  const [tMin, tMax] = LIMITS.title, [dMin, dMax] = LIMITS.description;
  if (!resolved.title) w.push({ field: "title", code: "missing" });
  else if (resolved.title.length < tMin) w.push({ field: "title", code: "too_short" });
  else if (resolved.title.length > tMax) w.push({ field: "title", code: "too_long" });
  if (!resolved.description) w.push({ field: "description", code: "missing" });
  else if (resolved.description.length < dMin) w.push({ field: "description", code: "too_short" });
  else if (resolved.description.length > dMax) w.push({ field: "description", code: "too_long" });
  if (!resolved.og.image) w.push({ field: "og_image", code: "missing" });
  if (resolved.indexable && !resolved.canonical) w.push({ field: "canonical", code: "no_primary_domain" });
  if (resolved.title && siblingTitles.filter((t) => t === resolved.title).length > 0) w.push({ field: "title", code: "duplicate" });
  return w;
}
