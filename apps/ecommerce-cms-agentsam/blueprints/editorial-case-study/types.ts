export type Sku = string;
export type DefinitionKey = string;
export type ArtifactId = string;
export type AssetId = string;
export type ThemeVariant = "light" | "tint" | "dark" | "brand";

export type DiscoveryConfidence = "measured" | "observed" | "inferred" | "unknown";
export interface SourceReceipt {
  uri: string;
  sha256?: string;
  kind: "repository" | "r2" | "file" | "url";
  permission?: string;
  confidence: DiscoveryConfidence;
  description?: string;
}
export interface MediaReference {
  assetId?: AssetId;
  sourceUri?: string;
  kind: "image" | "video" | "model" | "other";
  alt?: string;
  posterAssetId?: AssetId;
  sourceSku?: Sku;
  // The renderer must resolve assets through its authorized media provider.
}
export interface ReusableDefinitionRef {
  definitionKey: DefinitionKey;
  definitionVersion: string;
  inventorySku?: Sku;
  origin: "built_in" | "package" | "imported" | "generated" | "app";
  artifactId?: ArtifactId;
}
export interface BlockInstanceProposal {
  id?: string; // assign a stable CMS ID when actually placed, not during intake
  definition: ReusableDefinitionRef;
  order: number;
  settings: Record<string, unknown>;
  parentId?: string;
  blocks?: BlockInstanceProposal[];
}
export interface SectionInstanceProposal {
  id?: string;
  definition: ReusableDefinitionRef;
  order: number;
  status: "active" | "hidden" | "archived";
  settings: Record<string, unknown>;
  blocks: BlockInstanceProposal[];
  media: Record<string, MediaReference | MediaReference[]>;
  themeVariant?: ThemeVariant;
}
export interface CaseStudyIntake {
  schema: "iam.cms.case-study-intake.v1";
  slug: string;
  brand: string;
  pagePresetSku?: Sku;
  tokens: Record<string, string>;
  sources: SourceReceipt[];
  sections: SectionInstanceProposal[];
  lifecycle: "draft_pending_review";
}
