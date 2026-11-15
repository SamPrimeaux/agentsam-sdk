import {
  MERCH_ASSORTMENT_RECIPES, assortmentSearchTerms,
} from "@inneranimalmedia/agentsam-merch/collection-planning";
import type { MerchCollectionRules } from "@inneranimalmedia/agentsam-merch/collection-planning";
export type { MerchCollectionRules };
export type CollectionStatus = "draft" | "active" | "archived";
export type CollectionTab = "overview" | "products" | "presentation" | "rules" | "seo";
export type HeroLayout = "split" | "right" | "center";
export type HeroBackground = "gradient" | "solid" | "image";
export type HeroHeight = "compact" | "standard" | "immersive";
export type HeroFocus = "center" | "left" | "right" | "top" | "bottom";

export interface MerchHero {
  version: number;
  layout: HeroLayout;
  height: HeroHeight;
  backgroundMode: HeroBackground;
  focus: HeroFocus;
  overlay: number;
  artworkScale: number;
  eyebrow: string;
  headline: string;
  subheadline: string;
  artworkUrl: string;
  backgroundImageUrl: string;
  accentColor: string;
  textColor: string;
  backgroundColor: string;
  gradientTo: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
}
export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  image_url: string | null;
  accent_color: string;
  status: CollectionStatus;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  hero_settings_json: string;
  product_plan_json: string;
  product_count?: number;
  created_at?: string;
  updated_at?: string;
}
export interface CollectionForm {
  title: string;
  slug: string;
  description: string;
  eyebrow: string;
  image_url: string;
  accent_color: string;
  status: CollectionStatus;
  sort_order: number;
  seo_title: string;
  seo_description: string;
  hero: MerchHero;
  plan: string[];
  rules: MerchCollectionRules;
}
export interface Product {
  id: number;
  title: string;
  slug: string;
  status: string;
  image_url?: string | null;
  primary_image?: string | null;
  variant_count?: number;
  price_cents?: number;
  total_inventory?: number;
  fulfillment_kind?: "supplier" | "stock";
  studio_draft_id?: string | null;
  studio_catalog_product_id?: string | null;
  planned_variant_count?: number | null;
  collection?: string;
}
export interface MediaAsset { id: number | string; url: string; filename: string; content_type?: string }
export interface SupplierBlank {
  id?: string;
  catalog_product_id?: string;
  completeful_product_id?: string;
  provider_product_id?: string;
  name?: string;
  title?: string;
  product_type?: string;
  realistic_image_url?: string;
  cover_image_url?: string;
  main_icon_url?: string;
  variant_count?: number;
  print_location_count?: number;
  mockup_count?: number;
  available?: number | boolean;
}
export type PresentationPreset = {
  id: string; name: string; caption: string;
  backgroundColor: string; gradientTo: string; textColor: string; layout: HeroLayout;
  accent: string; mode: HeroBackground;
};
export const PRESETS: PresentationPreset[] = [
  { id: "editorial", name: "Dark editorial", caption: "Bold campaign / high contrast", backgroundColor: "#101416", gradientTo: "#272b2c", textColor: "#f7f4ec", layout: "split", accent: "#00d9ea", mode: "gradient" },
  { id: "warm", name: "Warm lifestyle", caption: "Natural / premium / relaxed", backgroundColor: "#e9e0d0", gradientTo: "#c9b7a1", textColor: "#28221c", layout: "right", accent: "#ec327d", mode: "gradient" },
  { id: "minimal", name: "Clean product", caption: "Product-first / restrained", backgroundColor: "#f4f5f2", gradientTo: "#dedfdc", textColor: "#141719", layout: "center", accent: "#5a7df7", mode: "solid" },
];

export type StarterKit = { id: string; label: string; caption: string; slots: string[]; searches: string[] };
export const STARTER_KITS: StarterKit[] = MERCH_ASSORTMENT_RECIPES.map(recipe => ({
  id: recipe.id, label: recipe.label, caption: recipe.caption,
  slots: [...recipe.slots], searches: assortmentSearchTerms(recipe.id),
}));
export const BLANK_HERO = (): MerchHero => ({
  version: 1, layout: "split", height: "standard", backgroundMode: "gradient", focus: "center",
  overlay: 28, artworkScale: 94, eyebrow: "", headline: "", subheadline: "", artworkUrl: "",
  backgroundImageUrl: "", accentColor: "#5a7df7", textColor: "#f7f4ec",
  backgroundColor: "#101416", gradientTo: "#272b2c",
  primaryCta: { label: "Shop collection", href: "#collection-products" },
  secondaryCta: { label: "", href: "" },
});
export function initialCollection(): CollectionForm {
  return { title: "", slug: "", description: "", eyebrow: "", image_url: "", accent_color: "#5a7df7",
    status: "draft", sort_order: 0, seo_title: "", seo_description: "", hero: BLANK_HERO(), plan: [],
    rules: {mode:"manual",match:"all",conditions:[],excludedIds:[]} };
}
export const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180);
export function collectionSiteId(): string | null {
  const params = new URLSearchParams(window.location.search);
  const direct = params.get("site_id");
  if (direct) return direct;
  const embedded = params.get("__route");
  const query = embedded?.indexOf("?");
  return embedded && query !== undefined && query >= 0
    ? new URLSearchParams(embedded.slice(query + 1)).get("site_id") : null;
}
export function collectionHref(path: string): string {
  const siteId = collectionSiteId();
  return siteId ? `${path}${path.includes("?") ? "&" : "?"}site_id=${encodeURIComponent(siteId)}` : path;
}
export function parseCollection(c: Collection, rules?: MerchCollectionRules): CollectionForm {
  const initial = initialCollection();
  let hero: Partial<MerchHero> = {};
  let plan: string[] = [];
  try { hero = JSON.parse(c.hero_settings_json || "{}") as Partial<MerchHero>; } catch { /* invalid historical JSON becomes defaults */ }
  try { const list = JSON.parse(c.product_plan_json || "[]") as { catalog_product_id: string }[]; plan = Array.isArray(list) ? list.map(p => String(p.catalog_product_id || "")).filter(Boolean) : []; } catch { /* defaults */ }
  return { title: c.title, slug: c.slug, description: c.description || "", eyebrow: c.eyebrow || "",
    image_url: c.image_url || "", accent_color: c.accent_color || "#5a7df7", status: c.status,
    sort_order: c.sort_order || 0, seo_title: c.seo_title || "", seo_description: c.seo_description || "",
    plan, rules: rules ? {...rules,conditions:[...rules.conditions],excludedIds:[...rules.excludedIds]} : initial.rules,
    hero: { ...initial.hero, ...hero,
      eyebrow: hero.eyebrow || c.eyebrow || "", headline: hero.headline || c.title,
      subheadline: hero.subheadline ?? c.description, backgroundImageUrl: hero.backgroundImageUrl || c.image_url || "",
      primaryCta: { ...initial.hero.primaryCta, ...(hero.primaryCta || {}) },
      secondaryCta: { ...initial.hero.secondaryCta, ...(hero.secondaryCta || {}) },
    } };
}
export function serializeCollection(form: CollectionForm, status: CollectionStatus = form.status) {
  const hero = { ...form.hero, eyebrow: form.hero.eyebrow || form.eyebrow,
    headline: form.hero.headline || form.title, subheadline: form.hero.subheadline || form.description,
    accentColor: form.accent_color };
  return { title: form.title.trim(), slug: slugify(form.slug || form.title),
    description: form.description, eyebrow: form.eyebrow, image_url: form.image_url,
    accent_color: form.accent_color, status, sort_order: form.sort_order,
    seo_title: form.seo_title, seo_description: form.seo_description,
    hero_settings_json: JSON.stringify(hero),
    product_plan_json: JSON.stringify(form.plan.map(catalog_product_id => ({ catalog_product_id }))),
  };
}
export function safeMediaUrl(url: string | null | undefined): string {
  if (!url || url.startsWith("//") || url.includes(String.fromCharCode(92)) ||
      [...url].some(ch => ch.charCodeAt(0)<32)) return "";
  if (url.startsWith("/")) return url;
  try { const value = new URL(url); return value.protocol === "https:" ? value.href : ""; } catch { return ""; }
}
export function supplierId(item: SupplierBlank) {
  return String(item.catalog_product_id || item.completeful_product_id || item.provider_product_id || item.id || "");
}
export function supplierImage(item: SupplierBlank) {
  return safeMediaUrl(item.realistic_image_url || item.cover_image_url || item.main_icon_url);
}
