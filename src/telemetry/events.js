export const AGENT_EVENT_TYPES = Object.freeze([
  'run.started', 'run.status', 'run.completed', 'run.failed',
  'error.observed',
  'model.started', 'model.delta', 'model.completed',
  'usage.snapshot', 'cost.snapshot',
  'context.snapshot', 'context.compaction.started', 'context.compaction.completed',
  'tool.search', 'tool.started', 'tool.completed', 'tool.failed',
  'approval.requested', 'approval.resolved',
  'plan.updated', 'task.updated',
  'timer.started', 'timer.updated', 'timer.completed',
  'runtime.waiting_input',
]);

function integer(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`${label} must be a non-negative number`);
  return Math.floor(number);
}

export function createAgentEvent(type, payload = {}, options = {}) {
  if (!AGENT_EVENT_TYPES.includes(type)) throw new RangeError(`unsupported AgentEvent type: ${type}`);
  const event = {
    schema_version: 1,
    type,
    timestamp: options.timestamp || new Date().toISOString(),
    ...(options.runId ? { run_id: String(options.runId) } : {}),
    ...(Number.isInteger(options.sequence) && options.sequence >= 0 ? { sequence: options.sequence } : {}),
    payload: payload && typeof payload === 'object' ? payload : { value: payload },
  };
  JSON.stringify(event);
  return Object.freeze(event);
}

export function createUsageSnapshot(value = {}) {
  const estimateKind = value.estimate_kind === 'provider' ? 'provider' : 'local';
  return Object.freeze({
    current_context: Object.freeze({
      input_tokens: integer(value.current_context?.input_tokens ?? value.currentContextTokens, 'current_context.input_tokens'),
      window_tokens: integer(value.current_context?.window_tokens ?? value.windowTokens, 'current_context.window_tokens'),
    }),
    cumulative: Object.freeze({
      input_tokens: integer(value.cumulative?.input_tokens ?? value.inputTokens, 'cumulative.input_tokens'),
      output_tokens: integer(value.cumulative?.output_tokens ?? value.outputTokens, 'cumulative.output_tokens'),
      cached_input_tokens: integer(value.cumulative?.cached_input_tokens ?? value.cachedInputTokens, 'cumulative.cached_input_tokens'),
      cache_write_tokens: integer(value.cumulative?.cache_write_tokens ?? value.cacheWriteTokens, 'cumulative.cache_write_tokens'),
      reasoning_tokens: integer(value.cumulative?.reasoning_tokens ?? value.reasoningTokens, 'cumulative.reasoning_tokens'),
    }),
    estimate_kind: estimateKind,
    provider_authoritative: estimateKind === 'provider',
  });
}
