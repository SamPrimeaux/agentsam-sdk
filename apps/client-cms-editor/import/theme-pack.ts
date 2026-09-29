/**
 * ThemePack — filesystem-portable normalized import artifact.
 * Compatible with CmsStarterPack install path; SQLite indexes, does not sole-own, this data.
 */
import type { CmsStarterPack } from '../shared/cms/src/starter-pack';

export type ThemePackProvenance = {
  kind: 'imported';
  sourceKind: 'directory' | 'zip';
  sourcePath: string;
  sourceHash: string;
  ingestedAt: string;
  packId: string;
  packVersion: number;
};

export type ThemePackDonorCandidate = {
  path: string;
  reason: string;
  hash?: string;
};

export type ThemePackManifest = {
  schema: 'agentsam.theme-pack.v1';
  id: string;
  name: string;
  version: number;
  description?: string;
  provenance: ThemePackProvenance;
  site?: {
    name?: string;
    domain?: string;
    initials?: string;
    color?: string;
  };
  pages: string[];
  assetCount: number;
  donorCandidates: ThemePackDonorCandidate[];
};

export type ThemePack = {
  manifest: ThemePackManifest;
  /** CMS-native installable pack (same contract as Heuristic/Blank). */
  starterPack: CmsStarterPack;
  /** Absolute or relative paths to copied canonical assets under the pack root. */
  assets: Array<{
    id: string;
    sourcePath: string;
    canonicalPath: string;
    hash: string;
    mimeType?: string;
  }>;
  donorCandidates: ThemePackDonorCandidate[];
};

export type ThemePackFsLayout = {
  root: string;
  manifestPath: string;
  tokensPath: string;
  starterPackPath: string;
  provenancePath: string;
  assetsDir: string;
  pagesDir: string;
};
