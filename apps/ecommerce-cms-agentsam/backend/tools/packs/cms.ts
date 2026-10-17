import type { JSONSchema } from "json-schema-to-ts";
import { defineTool, type ToolInput } from "../types.ts";

export const pagesInputSchema = {
  type: "object",
  properties: { limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
  additionalProperties: false,
} as const satisfies JSONSchema;
export type PagesListInput = ToolInput<typeof pagesInputSchema>;

export const cmsTools = [
  defineTool({
    id: "cms.pages.list", wireName: "cms_pages_list",
    capabilityKey: "cms.pages.read", description: "List CMS pages for the authorized merchant.",
    access: "merchant", risk: "low", handlerKind: "core",
    legacyHandlerKey: "fnf_cms_pages_list", legacyAliases: ["fnf_cms_pages_list"],
    inputSchema: pagesInputSchema,
  }),
] as const;
