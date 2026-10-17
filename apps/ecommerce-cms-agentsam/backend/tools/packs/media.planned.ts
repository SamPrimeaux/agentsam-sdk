/**
 * Deliberately unregistered, uncallable provider work.
 * Completed media operations live in media.ts and have real executors + D1 seeds.
 * This file holds only capabilities we cannot yet honestly execute.
 */
import type { JSONSchema } from "json-schema-to-ts";
export interface PlannedTool {
  id: string;
  wireName: string;
  capabilityKey: string;
  description: string;
  risk: "low" | "medium" | "high";
  executor: string;
  blockedBy: readonly string[];
  inputSchema: JSONSchema;
}
const imageRef = {
  type: "object",
  properties: { media_asset_id: { type: "integer", minimum: 1 } },
  additionalProperties: false,
} as const satisfies JSONSchema;
export const plannedMediaTools: readonly PlannedTool[] = [
  {
    id: "media.image.upscale", wireName: "media_image_upscale", capabilityKey: "media.image.upscale",
    description: "Upscale low-resolution artwork to meet a manufacturing profile's effective PPI; saves a derivative.",
    risk: "low", executor: "unknown: provider not chosen",
    blockedBy: ["upscale provider (not found in FNF or IAM registries)", "agentsam-merch executor to decide when upscaling is acceptable vs replace_with_higher_resolution_master"],
    inputSchema: {
      type: "object",
      properties: { ...imageRef.properties, scale: { type: "integer", enum: [2, 4], default: 2 } },
      additionalProperties: false,
    },
  },
  {
    id: "commerce.artwork.prepare", wireName: "commerce_artwork_prepare", capabilityKey: "commerce.artwork.prepare",
    description: "Produce the manufacturing derivative (trim, place, convert) and prove it passes preflight.",
    risk: "medium", executor: "agentsam-merch createArtworkPreparer (to create); runtimes browser canvas | Worker env.IMAGES/jSquash | Node sharp",
    blockedBy: ["artwork-prep executor", "computePlacement", "derivative registration"],
    inputSchema: {
      type: "object",
      properties: {
        media_asset_id: { type: "integer", minimum: 1 }, catalog_product_id: { type: "string" }, print_location_id: { type: "string" },
        placement: { type: "object", additionalProperties: true },
      },
      required: ["media_asset_id", "catalog_product_id", "print_location_id"],
      additionalProperties: false,
    },
  },
] as const;
