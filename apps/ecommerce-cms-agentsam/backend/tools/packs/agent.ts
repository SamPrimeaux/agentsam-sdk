import type { JSONSchema } from "json-schema-to-ts";
import { defineTool, type ToolInput } from "../types.ts";

/**
 * Read the canonical model catalog; never substitute legacy agentsam_ai rows.
 * Catalog availability, routing eligibility, and verified prices are distinct facts.
 * Optional retrieval-lane metadata describes installed indexes, not chat models.
 */
export const modelsInputSchema = {
  type: "object",
  properties: {
    provider: { type: "string", minLength: 1, maxLength: 80 },
    model_kind: { type: "string", minLength: 1, maxLength: 80 },
    include_inactive: { type: "boolean", default: false },
    routing_eligible_only: { type: "boolean", default: false },
    picker_only: { type: "boolean", default: false },
    include_pricing: { type: "boolean", default: false },
    include_retrieval_lanes: { type: "boolean", default: false },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  },
  additionalProperties: false,
} as const satisfies JSONSchema;
export type ModelsListInput = ToolInput<typeof modelsInputSchema>;

export const agentTools = [
  defineTool({
    id: "agent.models.list",
    wireName: "agent_models_list",
    capabilityKey: "agentsam.models.read",
    description: "Read canonical model metadata and routing policy from agentsam_model_catalog and agentsam_model_policies. Optionally include unverified/verified price rows and tenant-scoped retrieval-lane inventory; never use legacy agentsam_ai as a fallback.",
    access: "merchant", risk: "low", handlerKind: "core",
    legacyHandlerKey: "fnf_agentsam_ai_models", legacyAliases: ["fnf_agentsam_ai_models"],
    inputSchema: modelsInputSchema,
  }),
] as const;
