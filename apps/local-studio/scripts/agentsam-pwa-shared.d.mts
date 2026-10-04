export const APP_MANIFEST_FILE: string;
export const PWA_BASE_PATH: string;
export const PWA_MANIFEST_PATH: string;
export const PWA_ICON_PATH: string;
export const PWA_ICONS: readonly { src: string; sizes: string; type: string }[];
export const DEFAULT_APP_NAME: string;
export const THEME_COLOR: string;
export const OG_SITE_REL_PATH: string;

export type PwaIdentity = { name: string; startUrl: string };

export function escapeHtml(value: unknown): string;
export function readAppIdentity(cwd?: string): PwaIdentity;
export function snapshotPwaIdentity(cwd?: string): PwaIdentity;
export function isInstallQuery(url: unknown): boolean;
export function isDocumentPath(pathname: unknown): boolean;
export function acceptsHtml(accept: unknown): boolean;
export function stripInstallParams(url: unknown): string;
export function renderInstallPageHtml(
  template: string,
  options?: { identity?: Partial<PwaIdentity>; url?: string },
): string;
export function renderWebManifest(identity?: Partial<PwaIdentity>): string;
export function pwaHeadTags(identity?: Partial<PwaIdentity>): [string, string][];
export function injectPwaHead(html: string, identity?: Partial<PwaIdentity>): string;
export function createHeadInjector(identity?: Partial<PwaIdentity>): {
  push(chunk: Uint8Array | string): (Uint8Array | string)[];
  flush(): Uint8Array[];
};
export function readOgSite(cwd?: string): Record<string, unknown>;
export function siteHasCustomCard(site?: Record<string, unknown>): boolean;
