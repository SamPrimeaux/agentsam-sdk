/**
 * Re-export shared Asset Core so Content hosts can depend on one package
 * while BrandPack and Content remain peer domains over the same identity.
 */
export type {
  AssetId,
  AssetKind,
  AssetRecord,
  AssetRepresentation,
  AssetHashes,
  AssetMachineFacts,
  AssetProvenance,
  AssetInput,
  RepresentationProvider,
  RepresentationRole,
} from "@inneranimalmedia/agentsam-assets-core";

export {
  createEmptyAssetRecord,
  isAssetId,
  isAssetInput,
  masterRepresentation,
  primaryRepresentation,
} from "@inneranimalmedia/agentsam-assets-core";
