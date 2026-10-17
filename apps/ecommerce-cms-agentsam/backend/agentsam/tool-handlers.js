/**
 * AgentSam tool execution.
 *
 * Registry discovery and execution are intentionally separate:
 * - agentsam_tools says what exists + policy/scope.
 * - this module says which registered tools have a real executor.
 * Decorative/unimplemented rows are never handed to Workers AI as callable tools.
 */

import { executeFnfSemanticSearch } from "./fnf-vectorize.js";
import { getAgentSamTool } from "./tools-registry.js";
import { executeCompletefulTool } from "./completeful-tools.js";
import { executeAdminAppTool } from "./admin-app-tools.js";
import { CORE_EXECUTABLE_TOOL_KEYS, SELF_CONFIRMING_TOOL_KEYS, executeCoreTool } from "./core-tools.js";

// Media operations are offered only for account-scoped active D1 rows
// and only when their named executor exists in CORE_EXECUTABLE_TOOL_KEYS.
// Remaining provider operations stay unavailable until their real adapters ship.
const COMPLETEFUL_EXECUTABLE_OPERATIONS = new Set([
  "status",
  "shops.list",
  "shops.refresh",
  "shops.select",
  "catalog.list",
  "catalog.get",
  "catalog.read",
  "catalog.semantic",
  "catalog.search",
  "catalog.sync",
  "webhooks.list",
]);

export function isAgentSamToolExecutable(tool) {
  if (!tool?.tool_key) return false;
  if (tool.handler_type === "vectorize" || tool.tool_key === "fnf_semantic_search") return true;
  if (CORE_EXECUTABLE_TOOL_KEYS.has(tool.tool_key)) return true;
  if (tool.handler_type === "admin_api" && ["growth", "mail"].includes(tool.handler_key)) return true;
  if (tool.handler_key === "completeful") {
    return COMPLETEFUL_EXECUTABLE_OPERATIONS.has(
      String(tool.handler_config?.operation || "").toLowerCase(),
    );
  }
  return false;
}

function writeGate(tool, options = {}) {
  if (SELF_CONFIRMING_TOOL_KEYS.has(tool?.tool_key)) return null;
  if (tool?.requires_approval && options.approved !== true) {
    return {
      ok: false,
      approval_required: true,
      tool_key: tool.tool_key,
      capability_key: tool.capability_key,
      risk_level: tool.risk_level,
      message: `${tool.display_name || tool.tool_key} requires explicit approval before execution.`,
    };
  }
  if (
    (tool?.requires_confirmation || tool?.connector_access_class === "write") &&
    options.confirmed !== true &&
    options.approved !== true
  ) {
    return {
      ok: false,
      confirmation_required: true,
      tool_key: tool.tool_key,
      capability_key: tool.capability_key,
      risk_level: tool.risk_level,
      message: `${tool.display_name || tool.tool_key} requires confirmation before execution.`,
    };
  }
  return null;
}

export async function executeAgentSamTool(env, toolKey, params = {}, options = {}) {
  const tool = await getAgentSamTool(env, toolKey);
  if (!tool) {
    return { ok: false, error: "tool_not_found", tool_key: toolKey };
  }

  if (!isAgentSamToolExecutable(tool)) {
    return {
      ok: false,
      error: "handler_not_implemented",
      tool_key: toolKey,
      handler_type: tool.handler_type,
      handler_key: tool.handler_key || null,
    };
  }

  const gated = writeGate(tool, options);
  if (gated) return gated;

  if (toolKey === "fnf_semantic_search" || tool.handler_type === "vectorize") {
    return executeFnfSemanticSearch(env, {
      ...params,
      source_type: params.source_type || tool.handler_config?.default_source_type || null,
    });
  }

  if (CORE_EXECUTABLE_TOOL_KEYS.has(toolKey)) {
    return executeCoreTool(env, tool, params, options);
  }

  if (tool.handler_type === "admin_api") {
    return executeAdminAppTool(env, tool, params, options);
  }

  if (tool.handler_key === "completeful") {
    return executeCompletefulTool(env, tool, params);
  }

  return {
    ok: false,
    error: "handler_not_implemented",
    tool_key: toolKey,
    handler_type: tool.handler_type,
  };
}
