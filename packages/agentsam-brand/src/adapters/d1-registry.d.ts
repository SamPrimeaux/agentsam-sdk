export type BrandRegistryRecord = {
  id: string;
  name: string;
  slug: string;
  display_name?: string | null;
  parent_brand_id?: string | null;
  architecture_model?: 'master_brand' | 'monolithic_sub' | 'standalone_brand' | 'endorsed_brand';
  status?: 'active' | 'pending' | 'paused' | 'archived' | 'parked';
  tagline?: string | null;
  description?: string | null;
  mission?: string | null;
  theme?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  assetCount?: number;
  [key: string]: unknown;
};

export type BrandAssetVariant = {
  id: string;
  asset_id: string;
  variant_key: string;
  file_format: string;
  storage_provider: 'r2' | 'cf_images' | 'external';
  storage_location: string;
  delivery_url?: string | null;
  custom_domain_url?: string | null;
  isPrimary: boolean;
  [key: string]: unknown;
};

export type BrandAssetRecord = {
  id: string;
  account_id: string;
  brand_slug: string;
  asset_key: string;
  version: string;
  category: string;
  title?: string | null;
  metadata: Record<string, unknown>;
  variants: BrandAssetVariant[];
  primaryVariant: BrandAssetVariant | null;
  previewUrl: string | null;
  [key: string]: unknown;
};

export class D1BrandRegistryAdapter {
  constructor(options?: { db?: D1Database; accountId?: string; allowWrites?: boolean; execute?: (input: Record<string, unknown>) => Promise<unknown> });
  readonly kind: 'd1';
  list(query?: { accountId?: string; status?: string; includeArchived?: boolean; includeAssets?: boolean; search?: string; parentBrandId?: string; limit?: number; offset?: number; assetLimit?: number }): Promise<BrandRegistryRecord[]>;
  find(query: { id?: string; brandId?: string; slug?: string; brandSlug?: string; accountId?: string; includeAssets?: boolean; assetLimit?: number }): Promise<BrandRegistryRecord | null>;
  listAssets(query?: { accountId?: string; brandSlug?: string; assetId?: string; limit?: number; offset?: number }): Promise<{ items: BrandAssetRecord[]; total: number; offset: number; limit: number; hasMore: boolean }>;
  findAsset(query: { accountId?: string; assetId: string }): Promise<BrandAssetRecord | null>;
  listUnmatchedAssetSlugs(query?: { accountId?: string }): Promise<Array<{ brandSlug: string; assetCount: number; status: string }>>;
  register(input: Record<string, unknown>): Promise<{ created: true; brand: BrandRegistryRecord }>;
  update(identifier: string | { id: string }, input: Record<string, unknown>): Promise<{ updated: true; brand: BrandRegistryRecord }>;
  archive(identifier: string | { id: string }): Promise<{ updated: true; brand: BrandRegistryRecord }>;
}
