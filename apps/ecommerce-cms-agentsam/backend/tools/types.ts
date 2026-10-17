import type { FromSchema, JSONSchema } from "json-schema-to-ts";

/** Product-owned contract, pinned locally; no SDK runtime imports. */
export type ToolAccess = "merchant" | "operator";
export type ToolHandlerKind = "core" | "vectorize";
export type ToolResult =
  | { status: "ok"; data: unknown }
  | { status: "failed"; error: string }
  | { status: "awaiting_confirmation"; confirmationId: string }
  | { status: "unavailable"; reason: string };

export type ToolExecutionContext = Readonly<{
  accountId: string;
  actorId: string;
  role: string;
  approved?: boolean;
}>;

export type ToolDescriptor<S extends JSONSchema = JSONSchema> = Readonly<{
  id: string;
  wireName: string;
  capabilityKey: string;
  description: string;
  access: ToolAccess;
  risk: "low" | "medium" | "high";
  handlerKind: ToolHandlerKind;
  /** Existing executor remains the runtime authority until the adapter migration. */
  legacyHandlerKey: string;
  legacyAliases: readonly string[];
  inputSchema: S;
}>;

/** FromSchema is derived from the same runtime JSON Schema, never handwritten. */
export type ToolInput<S extends JSONSchema> = FromSchema<S>;

export function defineTool<const S extends JSONSchema>(descriptor: ToolDescriptor<S>): ToolDescriptor<S> {
  return Object.freeze(descriptor);
}
