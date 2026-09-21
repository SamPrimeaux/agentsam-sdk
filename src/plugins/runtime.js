import { recordToolCall } from './registry.js';

function clean(value) { return value == null ? '' : String(value).trim(); }

export async function executeAgentSamTool(options = {}) {
  const tool = options.tool;
  if (!tool?.tool_key) throw new Error('agentsam_tool_required');
  const context = options.context || {};
  const started = Date.now();
  let status = 'success';
  let errorCode = '';
  let failureOrigin = null;
  try {
    if (typeof options.authorizeTool === 'function') {
      const authorization = await options.authorizeTool({ tool, args: options.args || {}, context });
      if (authorization === false || authorization?.allowed === false) {
        const error = new Error(`tool_not_authorized:${tool.tool_key}`);
        error.code = 'AGENTSAM_TOOL_NOT_AUTHORIZED';
        throw error;
      }
    }
    if (Boolean(tool.requires_approval) || Boolean(tool.requires_confirmation)) {
      const approved = typeof options.requireApproval === 'function'
        ? await options.requireApproval({ tool, args: options.args || {}, context })
        : false;
      if (approved !== true) {
        const error = new Error(`tool_not_approved:${tool.tool_key}`);
        error.code = 'AGENTSAM_TOOL_NOT_APPROVED';
        throw error;
      }
    }
    const target = clean(tool.dispatch_target || 'plugin');
    // The persisted row selects the lane and handler family. This keeps
    // installed plugins generic instead of embedding provider names in the
    // AgentSam orchestration loop.
    const dispatcher = typeof options.resolveDispatcher === 'function'
      ? await options.resolveDispatcher({ tool, target, context })
      : options.dispatchers?.[target]
        || options.dispatchers?.[clean(tool.handler_type)]
        || options.handlers?.[clean(tool.handler_type)]
        || options.handlers?.[clean(tool.handler_key)];
    if (typeof dispatcher !== 'function') throw new Error(`tool_dispatcher_unavailable:${target}`);
    return await dispatcher({ tool, args: options.args || {}, context });
  } catch (error) {
    status = error?.code === 'AGENTSAM_TOOL_NOT_AUTHORIZED' || error?.code === 'AGENTSAM_TOOL_NOT_APPROVED' ? 'blocked' : 'error';
    errorCode = clean(error?.code || error?.message || 'tool_error').slice(0, 160);
    failureOrigin = status === 'blocked' ? 'policy' : 'tool';
    throw error;
  } finally {
    if (options.db?.prepare && context.accountId) {
      try {
        await recordToolCall(options.db, {
          accountId: context.accountId,
          agentRunId: context.agentRunId,
          conversationId: context.conversationId,
          callIndex: context.callIndex,
          toolKey: tool.tool_key,
          status,
          durationMs: Date.now() - started,
          errorCode,
          failureOrigin,
          sourceClient: context.sourceClient || 'agentsam-sdk',
          externalExecution: true,
        });
      } catch {
        // Execution evidence is best-effort here; the primary tool result wins.
      }
    }
  }
}

export function createPluginRuntime(options = {}) {
  const tools = Array.isArray(options.tools) ? options.tools : [];
  const byKey = new Map(tools.map((tool) => [clean(tool.tool_key), tool]));
  return Object.freeze({
    tools: Object.freeze([...tools]),
    toolDescriptors() {
      return tools.map((tool) => ({
        name: tool.tool_key,
        description: tool.description || '',
        category: tool.tool_category || tool.plugin_key || 'integrations',
        risk: tool.risk_level || 'low',
        input_schema: tool.input_schema || { type: 'object', properties: {}, required: [], additionalProperties: false },
        requires_approval: Boolean(tool.requires_approval),
        requires_confirmation: Boolean(tool.requires_confirmation),
        dispatch_target: tool.dispatch_target,
      }));
    },
    resolveTool(toolKey) { return byKey.get(clean(toolKey)) || null; },
    execute(toolKey, args = {}, context = {}) {
      const tool = byKey.get(clean(toolKey));
      if (!tool) throw new Error(`agentsam_tool_not_found:${toolKey}`);
      return executeAgentSamTool({
        tool, args, context, db: options.db, dispatchers: options.dispatchers,
        handlers: options.handlers, resolveDispatcher: options.resolveDispatcher,
        authorizeTool: options.authorizeTool, requireApproval: options.requireApproval,
      });
    },
  });
}

export function createPluginCapabilityAdapter(pluginRuntime, baseAdapter = null) {
  if (!pluginRuntime?.toolDescriptors || !pluginRuntime?.execute) throw new TypeError('plugin_runtime_required');
  return Object.freeze({
    toolDescriptors(options = {}) {
      const base = baseAdapter?.toolDescriptors?.(options) || [];
      return [...base, ...pluginRuntime.toolDescriptors()];
    },
    canInvoke(id) { return Boolean(pluginRuntime.resolveTool(id) || baseAdapter?.canInvoke?.(id)); },
    async invoke(id, input = {}) {
      if (pluginRuntime.resolveTool(id)) {
        return { capability_id: id, capability_version: 'plugin-v1', result: await pluginRuntime.execute(id, input) };
      }
      if (!baseAdapter?.invoke) throw new Error(`capability_handler_unavailable:${id}`);
      return baseAdapter.invoke(id, input);
    },
  });
}
