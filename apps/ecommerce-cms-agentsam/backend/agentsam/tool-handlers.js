/**
 * AgentSam tool execution — FNF-scoped handlers (vectorize, future d1).
 */

import { executeFnfSemanticSearch } from "./fnf-vectorize.js";
import { getAgentSamTool } from "./tools-registry.js";

export async function executeAgentSamTool(env, toolKey, params = {}) {
  const tool = await getAgentSamTool(env, toolKey);
  if (!tool) {
    return { ok: false, error: "tool_not_found", tool_key: toolKey };
  }

  if (toolKey === "fnf_semantic_search" || tool.handler_type === "vectorize") {
    return executeFnfSemanticSearch(env, {
      ...params,
      source_type: params.source_type || tool.handler_config?.default_source_type || null,
    });
  }

  return {
    ok: false,
    error: "handler_not_implemented",
    tool_key: toolKey,
    handler_type: tool.handler_type,
  };
}
