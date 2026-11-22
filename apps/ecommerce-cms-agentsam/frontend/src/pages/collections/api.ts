import { adminFetch, adminFormFetch } from "../../lib/api";
import type { Collection, CollectionForm, Product, MediaAsset, SupplierBlank, CollectionStatus, MerchCollectionRules } from "./model";
import { serializeCollection, collectionSiteId } from "./model";
import { normalizeCollectionRules } from "@inneranimalmedia/agentsam-merch/collection-planning";

// The existing Collections Studio UI speaks the FNF merchandising contract.
// This is its site-scoped AgentSam CMS adapter; never write legacy store_* tables.
type Ok = { ok: boolean; error?: string };
export type MediaProvider = "default" | "inneranimalmedia";
export type MediaPageRequest = { page: number; cursor: string | null };
export type CollectionMediaPage = {
  assets: MediaAsset[];
  next: MediaPageRequest | null;
  total: number | null;
  cursorSearch: boolean;
  hosted: boolean;
};
type MediaResponse = Ok & {
  assets?: MediaAsset[];
  items?: MediaAsset[];
  pagination?: { page?: number; total?: number; total_exact?: boolean; has_next?: boolean; cursor?: string | null; search_mode?: string };
  capabilities?: { provider_api?: string; source_provider?: string };
};
function mediaPath(params: URLSearchParams, provider: MediaProvider) {
  if (provider === "inneranimalmedia") params.set("provider", provider);
  const query = params.toString();
  return scoped("/api/admin/media" + (query ? "?" + query : ""));
}
type CmsRow = {
  id: string; site_id?: string; site_name?: string; name: string; slug: string; description?: string; status: CollectionStatus;
  visibility?: string; sort_order?: number; seo_title?: string | null; seo_description?: string | null;
  image_url?: string | null; metadata?: Record<string, unknown>; metadata_json?: string;
  product_count?: number; updated_at?: string | number; created_at?: string | number;
};
type CmsItem = { item_type: string; item_ref: string; status: string; sort_order: number };
type CollectionDetail = { collection: Collection; product_ids: number[]; rules: MerchCollectionRules };
const revisions = new Map<string, string | number>();
function displayTimestamp(value?: string | number): string | undefined {
  if (value == null) return undefined;
  const numeric = Number(value);
  if (String(value).trim() && Number.isFinite(numeric) && numeric > 0) {
    const iso = new Date(numeric < 100_000_000_000 ? numeric * 1000 : numeric);
    return Number.isNaN(iso.getTime()) ? undefined : iso.toISOString();
  }
  return typeof value === "string" ? value : undefined;
}
const MANUAL_RULES: MerchCollectionRules = { mode: "manual", match: "all", conditions: [], excludedIds: [] };
function accepted<T extends Ok>(result: T): T {
  if (!result.ok) throw new Error(result.error || "Request was not completed");
  return result;
}
function scoped(path: string, siteIdOverride?: string | null): string {
  const siteId = siteIdOverride ?? collectionSiteId();
  if (!siteId) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("site_id", siteId);
  return url.pathname + url.search;
}
function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try { return object(JSON.parse(value)); } catch { return {}; }
  }
  return {};
}
function normalize(row: CmsRow): Collection {
  const metadata = Object.keys(object(row.metadata)).length ? object(row.metadata) : object(row.metadata_json);
  if (row.updated_at) revisions.set(row.id, row.updated_at);
  return {
    id: row.id, site_id: row.site_id, site_name: row.site_name,
    slug: row.slug, title: row.name, description: row.description || "",
    eyebrow: String(metadata.eyebrow || ""), image_url: row.image_url || String(metadata.image_url || "") || null,
    accent_color: String(metadata.accent_color || "#5a7df7"), status: row.status,
    sort_order: row.sort_order || 0, seo_title: row.seo_title || null, seo_description: row.seo_description || null,
    hero_settings_json: JSON.stringify(object(metadata.merch_hero)),
    product_plan_json: JSON.stringify(Array.isArray(metadata.merch_plan) ? metadata.merch_plan : []),
    product_count: row.product_count || 0,
    updated_at: displayTimestamp(row.updated_at), created_at: displayTimestamp(row.created_at),
  };
}
async function items(id: string, siteId?: string): Promise<CmsItem[]> {
  const all: CmsItem[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const url = scoped(`/api/admin/collections/${encodeURIComponent(id)}/items?limit=100&offset=${offset}`, siteId);
    const page = accepted(await adminFetch<Ok & { items: CmsItem[] }>(url)).items || [];
    all.push(...page);
    if (page.length < 100) break;
  }
  return all;
}
export const collectionsApi = {
  async list(): Promise<Collection[]> {
    const path = collectionSiteId() ? "/api/admin/collections" : "/api/admin/collections?scope=account";
    const result = accepted(await adminFetch<Ok & { collections: CmsRow[] }>(scoped(path)));
    return (result.collections || []).map(normalize);
  },
  async products(): Promise<Product[]> {
    const path = collectionSiteId() ? "/api/admin/products" : "/api/admin/products?scope=account";
    return accepted(await adminFetch<Ok & { products: Product[] }>(scoped(path))).products || [];
  },
  async get(id: string, siteId?: string): Promise<CollectionDetail> {
    const path = `/api/admin/collections/${encodeURIComponent(id)}`;
    const [result, members] = await Promise.all([
      adminFetch<Ok & { collection: CmsRow }>(scoped(path, siteId)), items(id, siteId),
    ]);
    const row = accepted(result).collection;
    const metadata = Object.keys(object(row.metadata)).length ? object(row.metadata) : object(row.metadata_json);
    const rawRules = object(metadata.merch_rules);
    let rules: MerchCollectionRules;
    try { rules = normalizeCollectionRules(Object.keys(rawRules).length ? rawRules : MANUAL_RULES); }
    catch { rules = { ...MANUAL_RULES }; }
    return {
      collection: normalize(row),
      product_ids: members.filter(m => m.item_type === "product" && m.status === "active").map(m => Number(m.item_ref)).filter(Number.isSafeInteger),
      rules,
    };
  },
  async save(form: CollectionForm, id?: string, status?: CollectionStatus, siteId?: string): Promise<Collection> {
    const payload = serializeCollection(form, status);
    const path = id ? `/api/admin/collections/${encodeURIComponent(id)}` : "/api/admin/collections";
    const result = accepted(await adminFetch<Ok & { collection: CmsRow }>(scoped(path, siteId), {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({ ...payload, eyebrow: form.eyebrow, merch_rules: form.rules,
        ...(id && revisions.has(id) ? { expected_updated_at: revisions.get(id) } : {}) }),
    }));
    return normalize(result.collection);
  },
  async saveRules(_id: string, rules: MerchCollectionRules) {
    // Rules are persisted with the collection metadata by save(); this is an intentional
    // compatibility no-op for the FNF editor's former separate rules endpoint.
    return { ok: true, rules };
  },
  async assign(id: string, productIds: number[], siteId?: string) {
    const response = accepted(await adminFetch<Ok & { items: CmsItem[] }>(
      scoped(`/api/admin/collections/${encodeURIComponent(id)}/items`, siteId),
      { method: "PUT", body: JSON.stringify({
        items: productIds.map(item_ref => ({ item_type: "product", item_ref: String(item_ref), status: "active" })),
      }) },
    ));
    return { ok: true, product_ids: response.items.filter(item => item.item_type === "product").map(item => Number(item.item_ref)) };
  },
  async media(q: string, request: MediaPageRequest, provider: MediaProvider, signal?: AbortSignal): Promise<CollectionMediaPage> {
    const params = new URLSearchParams({
      view: "images", kind: "image", page_size: "60", page: String(request.page),
      ...(q ? { q } : {}), ...(request.cursor ? { cursor: request.cursor } : {}),
    });
    const result = accepted(await adminFetch<MediaResponse>(mediaPath(params, provider), { signal }));
    const pagination = result.pagination;
    const hosted = result.capabilities?.provider_api === "cloudflare_oauth" ||
      result.capabilities?.source_provider === "iam_registry";
    const cursorSearch = pagination?.search_mode === "cursor_scan" ||
      result.capabilities?.provider_api === "cloudflare_oauth";
    const cursor = pagination?.cursor || null;
    if (pagination?.has_next && ((cursor && cursor === request.cursor) || (cursorSearch && !cursor))) {
      throw new Error("The media provider did not return a new page cursor. Retry to continue.");
    }
    return {
      assets: result.assets || result.items || [],
      next: pagination?.has_next ? { page: request.page + 1, cursor } : null,
      total: !cursorSearch && pagination?.total_exact !== false &&
        typeof pagination?.total === "number" ? pagination.total : null,
      cursorSearch, hosted,
    };
  },
  async uploadMedia(file: File, provider: MediaProvider): Promise<MediaAsset> {
    const form = new FormData();
    form.append("files", file, file.name);
    form.append("folder", "images");
    const result = accepted(await adminFormFetch<MediaResponse>(mediaPath(new URLSearchParams(), provider), form));
    const asset = result.assets?.[0] || result.items?.[0];
    if (!asset?.url) throw new Error("The upload did not return an image delivery URL.");
    return asset;
  },
  async scaffold(id: string): Promise<{ created: {catalog_product_id:string;product_id:number;draft_id:string;variant_count:number}[]; reused: {catalog_product_id:string;product_id:number;draft_id:string}[]; unavailable: {catalog_product_id:string;reason:string}[] }> {
    return accepted(await adminFetch<Ok & { created: {catalog_product_id:string;product_id:number;draft_id:string;variant_count:number}[]; reused: {catalog_product_id:string;product_id:number;draft_id:string}[]; unavailable: {catalog_product_id:string;reason:string}[] }>(
      scoped(`/api/admin/product-studio/collections/${encodeURIComponent(id)}/scaffold`),
      { method: "POST", body: JSON.stringify({}) },
    ));
  },
  async supplier(search: string): Promise<SupplierBlank[]> {
    const params = new URLSearchParams({ search, limit: "12", offset: "0" });
    const data = accepted(await adminFetch<Ok & { items?: SupplierBlank[] }>(scoped(`/api/admin/completeful/catalog?${params}`)));
    if (!Array.isArray(data.items)) throw new Error("Supplier catalog is not available for this site");
    return data.items;
  },
};
