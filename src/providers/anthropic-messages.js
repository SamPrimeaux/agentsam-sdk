import { createAgentEvent, createUsageSnapshot } from '../telemetry/index.js';
import { calculateModelCost } from '../models/index.js';
import { diagnosticFromError } from '../errors/index.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function integer(value) { const n = Number(value ?? 0); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0; }
function emit(emitFn, type, payload, runId) {
  if (typeof emitFn === 'function') emitFn(createAgentEvent(type, payload, { runId }));
}
function signal(ms) {
  return typeof AbortSignal?.timeout === 'function' && Number(ms) > 0 ? AbortSignal.timeout(Number(ms)) : undefined;
}
function toolsForAnthropic(tools = []) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description || '',
    input_schema: tool.parameters || { type: 'object', properties: {} },
  }));
}
function textFromContent(content = []) {
  return content.filter((part) => part?.type === 'text').map((part) => String(part.text || '')).join('');
}
function callsFromContent(content = []) {
  return content.filter((part) => part?.type === 'tool_use').map((part) => ({
    call_id: part.id,
    name: part.name,
    arguments: JSON.stringify(part.input || {}),
  }));
}
function usageParts(response = {}) {
  const usage = response.usage || {};
  return {
    input_tokens: integer(usage.input_tokens),
    cached_input_tokens: integer(usage.cache_read_input_tokens),
    cache_write_tokens: integer(usage.cache_creation_input_tokens),
    output_tokens: integer(usage.output_tokens),
    reasoning_tokens: 0,
  };
}
function cumulative(base, delta) {
  return {
    input_tokens: integer(base?.input_tokens) + delta.input_tokens,
    output_tokens: integer(base?.output_tokens) + delta.output_tokens,
    cached_input_tokens: integer(base?.cached_input_tokens) + delta.cached_input_tokens,
    cache_write_tokens: integer(base?.cache_write_tokens) + delta.cache_write_tokens,
    reasoning_tokens: integer(base?.reasoning_tokens),
  };
}

export function createAnthropicMessagesAdapter(options = {}) {
  const apiKey = clean(options.apiKey || process.env.ANTHROPIC_API_KEY);
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = clean(options.baseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '');

  async function request(body, params = {}) {
    if (!apiKey) throw new Error('anthropic_api_key_required');
    const response = await fetchImpl(baseUrl + '/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: signal(params.timeoutMs || options.timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error?.message || data?.message || `Anthropic HTTP ${response.status}`);
      error.status = response.status;
      error.provider = 'anthropic';
      throw error;
    }
    return data;
  }

  async function send(messages, params = {}) {
    const record = params.modelRecord || options.modelRecord;
    if (!record || record.provider !== 'anthropic') throw new Error('anthropic_model_record_required');
    const emitFn = params.emit || options.emit;
    const runId = params.runId;
    const model = record.provider_model_id;
    const body = {
      model,
      max_tokens: Number(params.maxOutputTokens) > 0 ? Number(params.maxOutputTokens) : 8192,
      messages,
      ...(clean(params.instructions) ? {
        system: [{
          type: 'text',
          text: String(params.instructions),
          cache_control: { type: 'ephemeral' },
        }],
      } : {}),
      ...(params.tools?.length ? { tools: toolsForAnthropic(params.tools) } : {}),
    };

    emit(emitFn, 'model.started', {
      provider: 'anthropic',
      model,
      reasoning_effort: params.reasoningEffort || 'auto',
      requested_service_tier: 'default',
    }, runId);

    let response;
    try {
      response = await request(body, params);
    } catch (error) {
      const diagnostic = diagnosticFromError(error, { source: 'anthropic', kind: 'provider_error' });
      emit(emitFn, 'error.observed', diagnostic, runId);
      emit(emitFn, 'run.failed', { stage: 'model', provider: 'anthropic', model, error: diagnostic }, runId);
      throw error;
    }

    const delta = usageParts(response);
    const usageSnapshot = createUsageSnapshot({
      current_context: { input_tokens: delta.input_tokens, window_tokens: Number(record.context_window) || 0 },
      cumulative: cumulative(params.cumulativeUsage, delta),
      estimate_kind: 'provider',
    });
    const cost = record.pricing ? calculateModelCost(record, delta, { serviceTier: 'default' }) : null;
    if (cost) emit(emitFn, 'cost.snapshot', cost, runId);
    emit(emitFn, 'usage.snapshot', usageSnapshot, runId);
    emit(emitFn, 'model.completed', {
      provider: 'anthropic',
      model,
      response_id: response.id || null,
      status: response.stop_reason || 'completed',
      requested_service_tier: 'default',
      actual_service_tier: 'default',
    }, runId);

    const assistant = { role: 'assistant', content: response.content || [] };
    const nextMessages = [...messages, assistant];
    return Object.freeze({
      provider: 'anthropic',
      model,
      response_id: response.id || null,
      status: response.stop_reason || 'completed',
      output_text: textFromContent(response.content),
      tool_calls: Object.freeze(callsFromContent(response.content)),
      usage_delta: Object.freeze(delta),
      usage_snapshot: usageSnapshot,
      cost,
      provider_state: Object.freeze({ messages: nextMessages }),
      requested_service_tier: 'default',
      actual_service_tier: 'default',
      raw: response,
    });
  }

  async function create(params = {}) {
    const prior = Array.isArray(params.providerState?.messages) ? params.providerState.messages : [];
    const input = typeof params.input === 'string' ? params.input : JSON.stringify(params.input ?? '');
    const messages = [...prior, { role: 'user', content: [{ type: 'text', text: input }] }];
    return send(messages, params);
  }

  async function continueWithToolOutputs(params = {}) {
    const prior = Array.isArray(params.providerState?.messages) ? params.providerState.messages : [];
    if (!prior.length) throw new Error('anthropic_provider_state_required');
    const content = (params.toolOutputs || []).map((row) => ({
      type: 'tool_result',
      tool_use_id: row.call_id || row.callId,
      content: typeof row.output === 'string' ? row.output : JSON.stringify(row.output ?? null),
    }));
    if (!content.length) throw new Error('anthropic_tool_outputs_required');
    return send([...prior, { role: 'user', content }], params);
  }

  return Object.freeze({ provider: 'anthropic', create, continueWithToolOutputs });
}
