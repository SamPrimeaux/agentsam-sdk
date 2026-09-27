/**
 * AssetInput — common intake for CLI / GUI / agents.
 * All drag-drop, path, stdin, URL, and provider refs normalize here
 * before asset.ingest (BrandPack or Content domain operation).
 */

import type { AssetId, RepresentationProvider, RepresentationRole } from "./kinds.js";

export type AssetInput =
  | LocalPathInput
  | DirectoryInput
  | BytesInput
  | UrlInput
  | ProviderRefInput
  | AssetIdInput;

export interface LocalPathInput {
  kind: "local-path";
  path: string;
  mime?: string;
}

export interface DirectoryInput {
  kind: "directory";
  path: string;
  recursive?: boolean;
}

export interface BytesInput {
  kind: "bytes";
  bytes: Uint8Array;
  name?: string;
  mime?: string;
}

export interface UrlInput {
  kind: "url";
  url: string;
  mime?: string;
}

export interface ProviderRefInput {
  kind: "provider-ref";
  provider: RepresentationProvider;
  ref: string;
  role?: RepresentationRole;
}

export interface AssetIdInput {
  kind: "asset-id";
  assetId: AssetId;
}

export function isAssetInput(value: unknown): value is AssetInput {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: string }).kind;
  return (
    kind === "local-path" ||
    kind === "directory" ||
    kind === "bytes" ||
    kind === "url" ||
    kind === "provider-ref" ||
    kind === "asset-id"
  );
}
