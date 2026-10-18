import type { JSONSchema } from "json-schema-to-ts";
import { defineTool, type ToolInput } from "../types.ts";

export const objectListInputSchema = {
  type: "object",
  properties: {
    prefix: { type: "string" }, folder: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 24 },
  },
  additionalProperties: false,
} as const satisfies JSONSchema;
export type ObjectListInput = ToolInput<typeof objectListInputSchema>;

/** Direct R2 listing is deliberately NOT in the merchant pack. */
export const operatorTools = [
  defineTool({
    id: "storage.objects.list", wireName: "storage_objects_list",
    capabilityKey: "storage.objects.list", description: "List objects in an operator-authorized storage binding.",
    access: "operator", risk: "medium", handlerKind: "core",
    legacyHandlerKey: "fnf_r2_media_list", legacyAliases: ["fnf_r2_media_list"],
    inputSchema: objectListInputSchema,
  }),
] as const;

/** Developer/operator tools stay out of merchant discovery and grants. */
export const operatorOnlyLegacyKeys = Object.freeze([
  "agentsam_d1_query",
  "fnf_worker_deploy",
  "agentsam_github_repo_list",
  "search_cloudflare_documentation",
] as const);
