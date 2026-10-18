import type { JSONSchema } from "json-schema-to-ts";
import { defineTool, type ToolInput } from "../types.ts";

export const ordersInputSchema = {
  type: "object",
  properties: { limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }, status: { type: "string" } },
  additionalProperties: false,
} as const satisfies JSONSchema;
export type OrdersListInput = ToolInput<typeof ordersInputSchema>;

export const productsInputSchema = {
  type: "object",
  properties: { limit: { type: "integer", minimum: 1, maximum: 100, default: 24 } },
  additionalProperties: false,
} as const satisfies JSONSchema;
export type ProductsListInput = ToolInput<typeof productsInputSchema>;

export const commerceTools = [
  defineTool({
    id: "commerce.orders.list", wireName: "commerce_orders_list",
    capabilityKey: "commerce.orders.read", description: "List the authorized merchant's orders.",
    access: "merchant", risk: "low", handlerKind: "core",
    legacyHandlerKey: "fnf_store_orders_list", legacyAliases: ["fnf_store_orders_list"],
    inputSchema: ordersInputSchema,
  }),
  defineTool({
    id: "commerce.products.list", wireName: "commerce_products_list",
    capabilityKey: "commerce.products.read", description: "List the authorized merchant's products.",
    access: "merchant", risk: "low", handlerKind: "core",
    legacyHandlerKey: "fnf_store_products_list", legacyAliases: ["fnf_store_products_list"],
    inputSchema: productsInputSchema,
  }),
] as const;
