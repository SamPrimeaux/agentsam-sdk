import type { MerchHeroInput } from "./merch-hero.js";
export interface MerchShowcaseProduct {
  id?: number; slug?: string; title?: string; primary_image?: string|null;
  image_url?: string|null; price_cents?: number|null;
}
export interface MerchShowcaseInput {
  title?: string; description?: string; eyebrow?: string;
  hero?: MerchHeroInput; products?: MerchShowcaseProduct[];
  links?: {productBase?:string;shop?:string};
  [key:string]: unknown;
}
export function collectionShowcaseStyle(input?:MerchShowcaseInput):{mode:"editorial"|"lifestyle"|"minimal";hero:MerchHeroInput};
export function renderMerchCollectionShowcase(input?:MerchShowcaseInput):string;
