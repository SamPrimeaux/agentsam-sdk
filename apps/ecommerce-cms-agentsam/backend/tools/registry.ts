import { commerceTools } from "./packs/commerce.ts";
import { cmsTools } from "./packs/cms.ts";
import { mediaTools } from "./packs/media.ts";
import { agentTools } from "./packs/agent.ts";
import { operatorTools, operatorOnlyLegacyKeys } from "./packs/operator.ts";
import type { ToolDescriptor } from "./types.ts";

export type InstallScope = "merchant" | "operator";
const merchant = [...commerceTools, ...cmsTools, ...mediaTools, ...agentTools] as const;
const operator = [...operatorTools] as const;
const all = [...merchant, ...operator] as const;

export function listToolDescriptors(scope: InstallScope = "merchant"): readonly ToolDescriptor[] {
  return scope === "operator" ? all : merchant;
}

/** Explicit aliases only; never infer dotted names by reversing underscores. */
export function resolveTool(name: string, scope: InstallScope = "merchant"): ToolDescriptor | null {
  return listToolDescriptors(scope).find((tool) =>
    tool.id === name || tool.wireName === name || tool.legacyAliases.includes(name)
  ) || null;
}

export function providerToolDescriptors(scope: InstallScope = "merchant") {
  return listToolDescriptors(scope).map((tool) => ({
    name: tool.wireName,
    description: tool.description,
    input_schema: tool.inputSchema,
    capability_key: tool.capabilityKey,
    operation_id: tool.id,
  }));
}

export function inspectRegistry(legacyHandlers: ReadonlySet<string>): string[] {
  const seen = new Map<string, string>();
  const errors: string[] = [];
  const allowedWire = /^[a-zA-Z0-9_-]+$/;
  for (const tool of all) {
    const names = [tool.id, tool.wireName, ...tool.legacyAliases];
    if (!allowedWire.test(tool.wireName)) errors.push(`invalid wire name: ${tool.id}`);
    if (!tool.capabilityKey || !tool.inputSchema || tool.inputSchema.type !== "object")
      errors.push(`invalid capability/input schema: ${tool.id}`);
    if (!tool.legacyAliases.includes(tool.legacyHandlerKey))
      errors.push(`missing handler alias: ${tool.id}`);
    if (tool.handlerKind === "core" && !legacyHandlers.has(tool.legacyHandlerKey))
      errors.push(`unresolved legacy handler: ${tool.id} => ${tool.legacyHandlerKey}`);
    for (const name of names) {
      const previous = seen.get(name);
      if (previous && previous !== tool.id) errors.push(`ambiguous operation name "${name}": ${previous}, ${tool.id}`);
      seen.set(name, tool.id);
    }
  }
  for (const name of operatorOnlyLegacyKeys) {
    if (resolveTool(name, "merchant")) errors.push(`operator operation exposed to merchant: ${name}`);
  }
  for (const tool of merchant) if (tool.access !== "merchant") errors.push(`operator tool in merchant pack: ${tool.id}`);
  for (const tool of operator) if (tool.access !== "operator") errors.push(`merchant tool in operator pack: ${tool.id}`);
  return errors;
}
