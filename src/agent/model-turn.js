function clean(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeToolCall(call = {}) {
  const args = call.arguments == null
    ? '{}'
    : typeof call.arguments === 'string'
      ? call.arguments
      : JSON.stringify(call.arguments);
  return Object.freeze({
    id: clean(call.call_id || call.id) || null,
    name: clean(call.name),
    arguments: args,
  });
}

/**
 * Provider-only AgentSam inference boundary.
 *
 * This function never resolves accounts, touches D1, authorizes a tool, or
 * executes a tool. Provider adapters own wire-format translation and this
 * function normalizes their result for the orchestration runtime.
 */
export async function runAgentSamModelTurn(options = {}) {
  const provider = options.provider;
  if (!provider?.create || !provider?.continueWithToolOutputs) {
    throw new TypeError('AgentSam provider adapter is required');
  }

  const continuation = Array.isArray(options.toolOutputs) && options.toolOutputs.length > 0;
  const response = continuation
    ? await provider.continueWithToolOutputs(options)
    : await provider.create(options);
  const toolCalls = Object.freeze((response.tool_calls || []).map(normalizeToolCall));

  return Object.freeze({
    type: toolCalls.length ? 'tool_calls' : 'assistant',
    content: clean(response.output_text),
    tool_calls: toolCalls,
    provider: clean(response.provider || options.modelRecord?.provider) || null,
    model: clean(response.model || options.model || options.modelRecord?.provider_model_id) || null,
    usage: response.usage_snapshot || response.usage_delta || null,
    response_id: response.response_id || null,
    provider_state: response.provider_state || null,
    requested_service_tier: response.requested_service_tier || null,
    actual_service_tier: response.actual_service_tier || null,
    cost: response.cost || null,
    raw: response,
  });
}
