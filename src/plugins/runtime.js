import { recordToolCall } from './registry.js';

function clean(value) { return value == null ? '' : String(value).trim(); }

const DISPATCH_TARGET_BY_TRANSPORT = Object.freeze({
  remote_jsonrpc: 'mcp',
  iam_mcp_catalog: 'mcp',
  http_rest: 'plugin',
  http_graphql: 'plugin',
  webhook: 'plugin',
  workers_binding: 'internal',
  native: 'native',
  none: 'internal',
});

/** Resolve an explicit per-tool lane override, otherwise derive it from the
 * owning plugin's transport. The legacy D1 default `internal` is treated as
 * absent for plugin-owned rows unless handler_config explicitly overrides it.
 */
export function resolvePluginDispatchTarget(tool = {}) {
  const configOverride = clean(tool.handler_config?.dispatch_target_override);
  const storedTarget = clean(tool.dispatch_target);
  const transport = clean(tool.plugin_transport || tool.transport);
  const hasPluginTransport = Boolean(clean(tool.plugin_key) && transport);
  const override = configOverride || (
    storedTarget && !(storedTarget === 'internal' && hasPluginTransport) ? storedTarget : ''
  );
  if (override) return override;
  if (DISPATCH_TARGET_BY_TRANSPORT[transport]) return DISPATCH_TARGET_BY_TRANSPORT[transport];
  return clean(tool.plugin_kind) === 'native' ? 'native' : 'internal';
}

export async function executeAgentSamTool(options = {}) {
  const tool = options.tool;
  if (!tool?.tool_key) throw new Error('agentsam_tool_required');
  const requestedContext = options.context && typeof options.context === 'object' ? options.context : {};
  const trustedAccountId = clean(options.accountId);
  if (options.db?.prepare && !/^[A-Za-z0-9_-]{1,128}$/.test(trustedAccountId)) {
    throw new Error('authenticated_account_required');
  }
  if (trustedAccountId && requestedContext.accountId && requestedContext.accountId !== trustedAccountId) {
    throw new Error('account_context_mismatch');
  }
  const context = trustedAccountId ? { ...requestedContext, accountId: trustedAccountId } : requestedContext;
  const started = Date.now();
  let status = 'success';
  let errorCode = '';
  let failureOrigin = null;
  let costUsd = Number.isFinite(options.costUsd) ? Math.max(0, options.costUsd) : 0;
  let costBasis = clean(options.costBasis) || 'unknown';
  const args = options.args || {};
  const resolveCost = async (details) => {
    if (typeof options.resolveCost !== 'function') return;
    try {
      const observed = await options.resolveCost({ tool, args, context, ...details });
      if (Number.isFinite(observed?.costUsd) && observed.costUsd >= 0) costUsd = observed.costUsd;
      if (['api_metered', 'external_subscription', 'platform_included', 'unknown'].includes(observed?.costBasis)) {
        costBasis = observed.costBasis;
      }
    } catch {
      // Cost enrichment must never change the tool result.
    }
  };
  try {
    if (typeof options.authorizeTool === 'function') {
      const authorization = await options.authorizeTool({ tool, args, context });
      if (authorization === false || authorization?.allowed === false) {
        const error = new Error(`tool_not_authorized:${tool.tool_key}`);
        error.code = 'AGENTSAM_TOOL_NOT_AUTHORIZED';
        throw error;
      }
    }
    if (Boolean(tool.requires_approval) || Boolean(tool.requires_confirmation)) {
      const approved = typeof options.requireApproval === 'function'
        ? await options.requireApproval({ tool, args, context })
        : false;
      if (approved !== true) {
        const error = new Error(`tool_not_approved:${tool.tool_key}`);
        error.code = 'AGENTSAM_TOOL_NOT_APPROVED';
        throw error;
      }
    }
    const target = resolvePluginDispatchTarget(tool);
    // Plugin transport supplies the default lane; a tool-level target is only
    // an explicit override for tools that need a different executor path.
    const dispatcher = typeof options.resolveDispatcher === 'function'
      ? await options.resolveDispatcher({ tool, target, context })
      : options.dispatchers?.[target] || options.handlers?.[clean(tool.handler_key)];
    if (typeof dispatcher !== 'function') {
      const error = new Error(`tool_dispatcher_unavailable:${target}:${clean(tool.handler_key) || 'unknown'}`);
      error.failureOrigin = 'platform';
      throw error;
    }
    const result = await dispatcher({ tool, args, context });
    await resolveCost({ result });
    return result;
  } catch (error) {
    status = error?.code === 'AGENTSAM_TOOL_NOT_AUTHORIZED' || error?.code === 'AGENTSAM_TOOL_NOT_APPROVED' ? 'blocked' : 'error';
    errorCode = clean(error?.code || error?.name || 'tool_error').slice(0, 160);
    const allowedOrigins = new Set(['model', 'tool', 'provider', 'platform', 'policy', 'user']);
    const reportedOrigin = clean(error?.failureOrigin || error?.failure_origin);
    failureOrigin = status === 'blocked' ? 'policy' : (allowedOrigins.has(reportedOrigin) ? reportedOrigin : 'tool');
    await resolveCost({ error });
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
          costUsd,
          costBasis,
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
    /** Project persisted plugin rows into ephemeral SAM discovery cards; this is not a contract source. */
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
        tool, args, context, accountId: options.accountId, db: options.db, dispatchers: options.dispatchers,
        handlers: options.handlers, resolveDispatcher: options.resolveDispatcher,
        authorizeTool: options.authorizeTool, requireApproval: options.requireApproval,
        resolveCost: options.resolveCost, costUsd: options.costUsd, costBasis: options.costBasis,
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
