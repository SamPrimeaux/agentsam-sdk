export interface MerchCollectionCondition {
  field: "title" | "slug" | "collection";
  operator: "contains" | "equals" | "starts_with";
  value: string;
}
export interface MerchCollectionRules {
  mode: "manual" | "automatic" | "hybrid";
  match: "all" | "any";
  conditions: MerchCollectionCondition[];
  excludedIds: number[];
}
export interface MerchCatalogProduct {
  id: number;
  title?: string;
  slug?: string;
  collection?: string;
  status?: string;
}
export interface AssortmentSupplierBlank {
  id?: string;
  catalog_product_id?: string;
  completeful_product_id?: string;
  name?: string;
  title?: string;
  variant_count?: number;
  print_location_count?: number;
  mockup_count?: number;
  available?: number | boolean;
}
export interface AssortmentSlotMatch {
  slot: string;
  search: string;
  candidates: AssortmentSupplierBlank[];
  recommended: AssortmentSupplierBlank | null;
}
export const MERCH_ASSORTMENT_RECIPES: readonly {
  readonly id: string; readonly label: string; readonly caption: string; readonly slots: readonly string[];
}[];
export const DEFAULT_COLLECTION_RULES: Readonly<MerchCollectionRules>;
export function assortmentSearchTerms(recipe: string): string[];
export function resolveAssortmentCandidates(recipeId: string, resultsBySlot?: Record<string, AssortmentSupplierBlank[]>): {
  recipe_id: string; slots: AssortmentSlotMatch[]; recommended_ids: string[]; missing_slots: string[];
};
export function normalizeCollectionRules(input?: Partial<MerchCollectionRules>): MerchCollectionRules;
export function matchesCollectionRules(product: MerchCatalogProduct, rules: Partial<MerchCollectionRules>): boolean;
export function resolveCollectionMembers(products: MerchCatalogProduct[], manualIds: number[], rules?: Partial<MerchCollectionRules>): number[];
