import type { JSONSchema } from "json-schema-to-ts";
import { defineTool, type ToolInput } from "../types.ts";

export const mediaLibraryInputSchema = {
  type: "object",
  properties: {
    folder: { type: "string" }, q: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 40 },
  },
  additionalProperties: false,
} as const satisfies JSONSchema;
export type MediaLibraryInput = ToolInput<typeof mediaLibraryInputSchema>;

export const semanticSearchInputSchema = {
  type: "object",
  properties: {
    query: { type: "string", minLength: 1 },
    source_type: { type: "string", enum: ["product", "cms", "skill", "repo", "brand"] },
    top_k: { type: "integer", minimum: 1, maximum: 100, default: 8 },
  },
  required: ["query"],
  additionalProperties: false,
} as const satisfies JSONSchema;
export type SemanticSearchInput = ToolInput<typeof semanticSearchInputSchema>;

// Typed descriptors below are executable through the same authorized Media
// Library services used by the app. D1 installation rows remain the runtime gate.
export const mediaGenerateSchema = {
  type: "object",
  properties: {
    prompt: { type: "string", minLength: 1, maxLength: 1000 },
    model_id: { type: "string", minLength: 2, maxLength: 160 },
    background: { type: "string", enum: ["auto", "transparent", "white"] },
    size: { type: "string", enum: ["auto", "square", "landscape", "portrait"] },
    quality: { type: "string", enum: ["auto", "low", "medium", "high"] },
    format: { type: "string", enum: ["png", "webp", "jpg"] },
  },
  required: ["prompt", "model_id"],
  additionalProperties: false,
} as const satisfies JSONSchema;
export type MediaGenerateInput = ToolInput<typeof mediaGenerateSchema>;

export const mockupRenderSchema = {
  type: "object",
  properties: {
    draft_id: { type: "string", minLength: 1 },
    colors: { type: "array", items: { type: "string" }, maxItems: 25 },
    print_location_ids: { type: "array", items: { type: "string" }, maxItems: 25 },
  },
  required: ["draft_id"],
  additionalProperties: false,
} as const satisfies JSONSchema;
export type MockupRenderInput = ToolInput<typeof mockupRenderSchema>;

export const mediaAssetIdSchema = {
  type: "object",
  properties: { media_asset_id: { type: "integer", minimum: 1 } },
  required: ["media_asset_id"],
  additionalProperties: false,
} as const satisfies JSONSchema;
export const mediaEditSchema = {
  type: "object",
  properties: {
    media_asset_id: { type: "integer", minimum: 1 },
    model_id: { type: "string", minLength: 2, maxLength: 120 },
    prompt: { type: "string", minLength: 1, maxLength: 1000 },
  },
  required: ["media_asset_id", "model_id", "prompt"],
  additionalProperties: false,
} as const satisfies JSONSchema;
export const mediaResampleSchema = {
  type: "object",
  properties: {
    media_asset_id: { type: "integer", minimum: 1 },
    scale: { type: "integer", enum: [2, 4] },
  },
  required: ["media_asset_id", "scale"],
  additionalProperties: false,
} as const satisfies JSONSchema;
export const artworkPreflightSchema = {
  type: "object",
  properties: {
    media_asset_id: { type: "integer", minimum: 1 },
    catalog_product_id: { type: "string", minLength: 1 },
    print_location_id: { type: "string", minLength: 1 },
    scale_percent: { type: "number", minimum: 5, maximum: 150 },
  },
  required: ["media_asset_id", "catalog_product_id", "print_location_id"],
  additionalProperties: false,
} as const satisfies JSONSchema;
export type MediaEditInput = ToolInput<typeof mediaEditSchema>;
export type ArtworkPreflightInput = ToolInput<typeof artworkPreflightSchema>;

export const mediaTools = [
  defineTool({
    id: "commerce.mockup.render", wireName: "commerce_mockup_render",
    capabilityKey: "commerce.mockup.render",
    description: "Render verified Completeful supplier mockups per selected color and print location, with idempotent provider receipts and saved assets. Costs require approval.",
    access: "merchant", risk: "high", handlerKind: "core",
    legacyHandlerKey: "commerce_mockup_render", legacyAliases: ["commerce_mockup_render"],
    inputSchema: mockupRenderSchema,
  }),
  defineTool({
    id: "media.image.generate", wireName: "media_image_generate",
    capabilityKey: "media.image.generate",
    description: "Generate one image from a policy-eligible model and save an unplaced review candidate in Media Library. Requires confirmation before paid execution.",
    access: "merchant", risk: "medium", handlerKind: "core",
    legacyHandlerKey: "media_image_generate", legacyAliases: ["media_image_generate"],
    inputSchema: mediaGenerateSchema,
  }),
  defineTool({
    id: "media.image.background.remove", wireName: "media_image_background_remove",
    capabilityKey: "media.image.background.remove",
    description: "Remove image background with installed Cloudflare Images segmentation and save a new PNG asset. Original remains unchanged.",
    access: "merchant", risk: "medium", handlerKind: "core",
    legacyHandlerKey: "media_image_background_remove", legacyAliases: ["media_image_background_remove"],
    inputSchema: mediaAssetIdSchema,
  }),
  defineTool({
    id: "media.image.optimize", wireName: "media_image_optimize",
    capabilityKey: "media.image.optimize",
    description: "Queue existing Media Library optimization pipeline for one image. Source masters are preserved by classification.",
    access: "merchant", risk: "medium", handlerKind: "core",
    legacyHandlerKey: "media_image_optimize", legacyAliases: ["media_image_optimize"],
    inputSchema: mediaAssetIdSchema,
  }),
  defineTool({
    id: "media.image.edit", wireName: "media_image_edit",
    capabilityKey: "media.image.edit",
    description: "Prompt-edit a Media Library image with an enabled, canonical OpenAI image model and save a separate derivative.",
    access: "merchant", risk: "medium", handlerKind: "core",
    legacyHandlerKey: "media_image_edit", legacyAliases: ["media_image_edit"],
    inputSchema: mediaEditSchema,
  }),
  defineTool({
    id: "media.image.resample", wireName: "media_image_resample",
    capabilityKey: "media.image.resample",
    description: "Resample image pixel dimensions into a new PNG version; does not improve original sharpness or certify printing.",
    access: "merchant", risk: "medium", handlerKind: "core",
    legacyHandlerKey: "media_image_resample", legacyAliases: ["media_image_resample"],
    inputSchema: mediaResampleSchema,
  }),
  defineTool({
    id: "commerce.artwork.preflight", wireName: "commerce_artwork_preflight",
    capabilityKey: "commerce.artwork.preflight",
    description: "Calculate measured artwork PPI for a selected Completeful print location; if supplier requirements are incomplete, return unverified instead of asserting READY.",
    access: "merchant", risk: "low", handlerKind: "core",
    legacyHandlerKey: "commerce_artwork_preflight", legacyAliases: ["commerce_artwork_preflight"],
    inputSchema: artworkPreflightSchema,
  }),
  defineTool({
    id: "media.library.list", wireName: "media_library_list",
    capabilityKey: "media.library.read", description: "Browse assets registered to the authorized merchant.",
    access: "merchant", risk: "low", handlerKind: "core",
    legacyHandlerKey: "fnf_media_library_list", legacyAliases: ["fnf_media_library_list"],
    inputSchema: mediaLibraryInputSchema,
  }),
  defineTool({
    id: "search.semantic", wireName: "search_semantic",
    capabilityKey: "retrieval.semantic.search", description: "Search merchant-authorized indexed content.",
    access: "merchant", risk: "low", handlerKind: "vectorize",
    legacyHandlerKey: "fnf_semantic_search", legacyAliases: ["fnf_semantic_search"],
    inputSchema: semanticSearchInputSchema,
  }),
] as const;
