/** Shared platform appearance authority (cms_themes semantic roles). */
export interface StudioThemeRecord {
  id?: string;
  themeFamily?: string;
  cssVars?: Record<string, string>;
}
export interface StudioAppearance {
  theme: 'light' | 'dark';
  tokens: Record<string, string>;
  productTokens: Record<string, string>;
  accentColor: string;
  accentInk: string;
  themeId: string | null;
}
export type CachedStudioAppearance = StudioAppearance & {
  accountId?: string | null;
  updatedAt?: number;
};
export const STUDIO_APPEARANCE_CACHE_PREFIX: string;
export const STUDIO_APPEARANCE_CACHE_LAST: string;
export const FIRST_PAINT_BOOTSTRAP_SCRIPT: string;
export function projectStudioShellAppearance(record?: StudioThemeRecord | null, fallback?: {theme?:string;accentColor?:string|null}): StudioAppearance;
export function applyStudioShellAppearance(appearance: StudioAppearance, root: HTMLElement): void;
export function appearanceCacheKey(accountId?:string|null): string;
export function readStudioAppearanceCache(accountId?:string|null, storage?:Storage|null): CachedStudioAppearance|null;
export function writeStudioAppearanceCache(accountId:string|null|undefined, appearance:StudioAppearance, storage?:Storage|null): void;
export function clearStudioAppearanceCache(accountId?:string|null, storage?:Storage|null): void;
export function bootstrapStudioAppearanceFromCache(accountId:string|null|undefined, root:HTMLElement): StudioAppearance|null;
