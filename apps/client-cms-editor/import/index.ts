/**
 * Import existing theme: ingest → normalize → ThemePack (CmsStarterPack-compatible).
 */
import { ingestSource } from './ingest';
import { normalizeHtmlTheme } from './normalize-html';
import type { ThemePack } from './theme-pack';

export type ImportThemeOptions = {
  packId?: string;
  /** Where to write filesystem ThemePack (manifest/tokens/pages/assets/provenance). */
  outDir: string;
  quarantineParent?: string;
};

export function importThemeFromSource(sourcePath: string, options: ImportThemeOptions): ThemePack {
  const intake = ingestSource(sourcePath, { quarantineParent: options.quarantineParent });
  return normalizeHtmlTheme(intake, { packId: options.packId, outDir: options.outDir });
}

export { ingestSource } from './ingest';
export { normalizeHtmlTheme } from './normalize-html';
export { packageThemePackToFs, loadStarterPackFromThemePackFs } from './ingest';
export type { ThemePack, ThemePackManifest, ThemePackProvenance } from './theme-pack';
export type { SourceIntake } from './ingest';
export {
  createLocalDevAuthHost,
  createChatGptCmsAuthHost,
  createOAuthChallengeCmsAuthHost,
  createStockCmsAuthHost,
  listCmsStockSignInOptions,
  isCmsProtectedPath,
  LOCAL_DEV_PRINCIPAL,
  CMS_STOCK_SIGN_IN_OPTIONS,
} from './auth-host';
export type {
  CmsAuthHost,
  CmsAuthDecision,
  CmsPrincipal,
  CmsStockSignInId,
} from './auth-host';
