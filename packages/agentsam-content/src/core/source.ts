/**
 * Where an asset came from (source) and where its bytes live (providerRefs).
 * Asset ≠ provider object: one asset may have a master in R2, a derivative
 * in CF Images, a video in Stream and a backup in Drive.
 */

export type ContentProviderName =
  | "cloudflare-images"
  | "cloudflare-stream"
  | "r2"
  | "google-drive"
  | "local"
  | "cms"
  | (string & {});

export type ProviderRole =
  | "original"
  | "master"
  | "derivative"
  | "preview"
  | "poster"
  | "backup"
  | "delivery";

export interface ProviderRef {
  provider: ContentProviderName;
  /** Provider-native identifier (CF image UUID, Stream UID, R2 key, Drive file id...). */
  ref: string;
  role: ProviderRole;
  /** Optional bucket/account/space qualifier. */
  scope?: string;
  bytes?: number;
  mime?: string;
  url?: string;
}

export type ContentSourceType =
  | "upload"
  | "generation"
  | "site-crawl"
  | "archive-import"
  | "drive-folder"
  | "provider-sync"
  | "derivation";

export interface ContentSource {
  type: ContentSourceType;
  /** URL, archive name, drive folder id, generation job id, parent asset id... */
  ref?: string;
  /** Import batch identity, e.g. "import_0137". */
  batch?: string;
  importedAt?: string;
}

export function primaryRef(refs: ProviderRef[]): ProviderRef | undefined {
  return (
    refs.find((r) => r.role === "delivery") ??
    refs.find((r) => r.role === "derivative") ??
    refs.find((r) => r.role === "original") ??
    refs.find((r) => r.role === "master") ??
    refs[0]
  );
}

export function masterRef(refs: ProviderRef[]): ProviderRef | undefined {
  return refs.find((r) => r.role === "master") ?? refs.find((r) => r.role === "original") ?? refs[0];
}
