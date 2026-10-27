export interface MerchCollectionRuleCondition { field: "title" | "slug" | "collection"; operator: "contains" | "equals" | "starts_with"; value: string }
export interface MerchCollectionRules { mode: "manual" | "automatic" | "hybrid"; match: "all" | "any"; conditions: MerchCollectionRuleCondition[]; excludedIds: number[] }
export interface MerchAssortmentRecipe { id:string; label:string; caption:string; slots:readonly string[] }
export const MERCH_ASSORTMENT_RECIPES: readonly MerchAssortmentRecipe[];
export function assortmentSearchTerms(id:string):string[];
export const DEFAULT_COLLECTION_RULES: Readonly<MerchCollectionRules>;
export function normalizeCollectionRules(input?: Partial<MerchCollectionRules>):MerchCollectionRules;
export function matchesCollectionRules(product:Record<string,unknown>,config:Partial<MerchCollectionRules>):boolean;
export function resolveCollectionMembers(products:Array<{id:number;title?:string;slug?:string;collection?:string}>,manualIds:number[],config?:Partial<MerchCollectionRules>):number[];
