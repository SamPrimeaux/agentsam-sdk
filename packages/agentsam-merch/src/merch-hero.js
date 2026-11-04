/**
 * Merch hero v1 — renderer + shared data contract for storefront and Studio.
 * No tenant branding, storage access, or app state. Works on any CMS section
 * with the same shape, not only collection pages.
 */
export const MERCH_HERO_VERSION = 1;
export const MERCH_HERO_LAYOUTS = ["split", "center", "right"];
export const MERCH_HERO_BACKGROUNDS = ["gradient", "solid", "image"];
export const MERCH_HERO_HEIGHTS = ["compact", "standard", "immersive"];
export const MERCH_HERO_FOCALS = ["center", "left", "right", "top", "bottom"];

const asText = (v, n = 160) => String(v ?? "").trim().slice(0, n);
const enumValue = (v, allowed, fallback) => allowed.includes(v) ? v : fallback;
const colorValue = (v, fallback) => /^#[a-f0-9]{6}$/i.test(String(v ?? "")) ? String(v) : fallback;
const numberValue = (v, fallback, min, max) => {
  const num = Number(v);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, Math.round(num))) : fallback;
};
export function safeMerchUrl(value, allowAnchors = false) {
  const v = asText(value, 2048);
  if (!v || v.startsWith("//") || /[\u0000-\u001f\\]/.test(v)) return "";
  if (allowAnchors && /^#[a-zA-Z][\w-]*$/.test(v)) return v;
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? v : "";
  } catch { return ""; }
}
export function normalizeMerchHero(input = {}, defaults = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
  const value = input;
  const fallback = {
    eyebrow: asText(defaults.eyebrow || "", 100),
    headline: asText(defaults.title || "Collection", 160),
    subheadline: asText(defaults.description, 500),
    artworkUrl: "",
    backgroundImageUrl: safeMerchUrl(defaults.image_url),
    accentColor: colorValue(defaults.accent_color, "#64748b"),
    textColor: "#f5f1e8",
    backgroundColor: "#090b0c",
    gradientTo: "#21140d",
    backgroundMode: defaults.image_url ? "image" : "gradient",
    layout: "split", height: "standard", focus: "center",
    overlay: 38, artworkScale: 94,
    primaryCta: { label: "Shop this collection", href: "#collection-products" },
    secondaryCta: { label: "", href: "" },
  };
  const primary = typeof value.primaryCta === "object" && value.primaryCta ? value.primaryCta : {};
  const secondary = typeof value.secondaryCta === "object" && value.secondaryCta ? value.secondaryCta : {};
  return {
    version: MERCH_HERO_VERSION,
    layout: enumValue(value.layout, MERCH_HERO_LAYOUTS, fallback.layout),
    height: enumValue(value.height, MERCH_HERO_HEIGHTS, fallback.height),
    backgroundMode: enumValue(value.backgroundMode, MERCH_HERO_BACKGROUNDS, fallback.backgroundMode),
    focus: enumValue(value.focus, MERCH_HERO_FOCALS, fallback.focus),
    overlay: numberValue(value.overlay, fallback.overlay, 0, 90),
    artworkScale: numberValue(value.artworkScale, fallback.artworkScale, 30, 120),
    eyebrow: asText(value.eyebrow ?? fallback.eyebrow, 100),
    headline: asText(value.headline ?? fallback.headline, 160),
    subheadline: asText(value.subheadline ?? fallback.subheadline, 500),
    artworkUrl: safeMerchUrl(value.artworkUrl),
    backgroundImageUrl: safeMerchUrl(value.backgroundImageUrl ?? fallback.backgroundImageUrl),
    accentColor: colorValue(value.accentColor, fallback.accentColor),
    textColor: colorValue(value.textColor, fallback.textColor),
    backgroundColor: colorValue(value.backgroundColor, fallback.backgroundColor),
    gradientTo: colorValue(value.gradientTo, fallback.gradientTo),
    primaryCta: {
      label: asText(primary.label ?? fallback.primaryCta.label, 90),
      href: safeMerchUrl(primary.href ?? fallback.primaryCta.href, true),
    },
    secondaryCta: {
      label: asText(secondary.label ?? fallback.secondaryCta.label, 90),
      href: safeMerchUrl(secondary.href ?? fallback.secondaryCta.href, true),
    },
  };
}
export function parseMerchHero(json, defaults = {}) {
  if (!json) return normalizeMerchHero({}, defaults);
  try {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    return normalizeMerchHero(parsed, defaults);
  } catch { return normalizeMerchHero({}, defaults); }
}
export function serializeMerchHero(input, defaults = {}) {
  return JSON.stringify(normalizeMerchHero(input, defaults));
}
const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[ch]);
function ctaMarkup(cta, modifier) {
  return cta.label && cta.href
    ? '<a class="merch-hero__cta merch-hero__cta--' + modifier + '" href="' + escapeHtml(cta.href) + '">' +
        escapeHtml(cta.label) + '<span aria-hidden="true"> →</span></a>'
    : "";
}
export function renderMerchHero(input, defaults = {}) {
  const c = normalizeMerchHero(input, defaults);
  const image = c.backgroundMode === "image" && c.backgroundImageUrl
    ? '<img class="merch-hero__background-image" src="' + escapeHtml(c.backgroundImageUrl) + '" alt="" loading="eager" fetchpriority="high">'
    : "";
  const art = c.artworkUrl
    ? '<div class="merch-hero__artwork"><img src="' + escapeHtml(c.artworkUrl) + '" alt="" loading="eager"></div>'
    : "";
  const style = [
    "--merch-bg:" + c.backgroundColor,
    "--merch-gradient:" + c.gradientTo,
    "--merch-text:" + c.textColor,
    "--merch-accent:" + c.accentColor,
    "--merch-overlay:" + (c.overlay / 100),
    "--merch-art-scale:" + c.artworkScale + "%",
  ].join(";");
  return '<section class="merch-hero merch-hero--' + c.layout + ' merch-hero--' + c.height +
    ' merch-hero--' + c.backgroundMode + ' merch-hero--focus-' + c.focus +
    '" style="' + escapeHtml(style) + '" data-hero-version="1">' +
    '<div class="merch-hero__backdrop">' + image + '</div>' +
    '<div class="merch-hero__inner"><div class="merch-hero__copy">' +
    (c.eyebrow ? '<p class="merch-hero__eyebrow">' + escapeHtml(c.eyebrow) + '</p>' : "") +
    '<h1 class="merch-hero__title">' + escapeHtml(c.headline) + '</h1>' +
    (c.subheadline ? '<p class="merch-hero__description">' + escapeHtml(c.subheadline) + '</p>' : "") +
    '<div class="merch-hero__actions">' + ctaMarkup(c.primaryCta, "primary") +
    ctaMarkup(c.secondaryCta, "secondary") + '</div></div>' + art +
    '</div></section>';
}
