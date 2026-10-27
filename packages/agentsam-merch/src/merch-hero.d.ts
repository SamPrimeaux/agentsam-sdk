export interface MerchHeroInput {
  version?: number;
  layout?: "split" | "center" | "right";
  height?: "compact" | "standard" | "immersive";
  backgroundMode?: "gradient" | "solid" | "image";
  focus?: "center" | "left" | "right" | "top" | "bottom";
  overlay?: number;
  artworkScale?: number;
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  artworkUrl?: string;
  backgroundImageUrl?: string;
  accentColor?: string;
  textColor?: string;
  backgroundColor?: string;
  gradientTo?: string;
  primaryCta?: { label?: string; href?: string };
  secondaryCta?: { label?: string; href?: string };
}
export function normalizeMerchHero(input?: MerchHeroInput, defaults?: Record<string, unknown>): MerchHeroInput;
export function renderMerchHero(input?: MerchHeroInput, defaults?: Record<string, unknown>): string;
export function parseMerchHero(input: string | MerchHeroInput, defaults?: Record<string,unknown>): MerchHeroInput;
export function serializeMerchHero(input?: MerchHeroInput, defaults?: Record<string, unknown>): string;
