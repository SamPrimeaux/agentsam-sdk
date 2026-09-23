import { createAgentEvent, createUsageSnapshot } from '../telemetry/index.js';
import { diagnosticFromError } from '../errors/index.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function integer(value) { const n = Number(value ?? 0); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0; }
function emit(emitFn, type, payload, runId) {
  if (typeof emitFn === 'function') emitFn(createAgentEvent(type, payload, { runId }));
}
function toolsForChat(tools = []) {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || { type: 'object', properties: {} },
    },
  }));
}
function usageParts(response = {}) {
  const usage = response.usage || {};
  return {
    input_tokens: integer(usage.prompt_tokens),
    cached_input_tokens: integer(usage.prompt_tokens_details?.cached_tokens),
    cache_write_tokens: 0,
    output_tokens: integer(usage.completion_tokens),
    reasoning_tokens: integer(usage.completion_tokens_details?.reasoning_tokens),
  };
}
function cumulative(base, delta) {
  return {
    input_tokens: integer(base?.input_tokens) + delta.input_tokens,
    output_tokens: integer(base?.output_tokens) + delta.output_tokens,
    cached_input_tokens: integer(base?.cached_input_tokens) + delta.cached_input_tokens,
    cache_write_tokens: integer(base?.cache_write_tokens),
    reasoning_tokens: integer(base?.reasoning_tokens) + delta.reasoning_tokens,
  };
}
function toolCalls(message = {}) {
  return (message.tool_calls || []).map((call) => ({
    call_id: call.id,
    name: call.function?.name,
    arguments: typeof call.function?.arguments === 'string'
      ? call.function.arguments
      : JSON.stringify(call.function?.arguments || {}),
  }));
}

export function createCloudflareChatAdapter(options = {}) {
  const credential = options.credential || {};
  const apiToken = clean(credential.value || process.env.CLOUDFLARE_API_TOKEN);
  const accountId = clean(credential.account_id || process.env.CLOUDFLARE_ACCOUNT_ID);
  const gatewayId = clean(options.gatewayId || process.env.CLOUDFLARE_AI_GATEWAY_ID || 'default');
  const fetchImpl = options.fetchImpl || fetch;

  async function request(body, params = {}) {
    if (!apiToken) throw new Error('cloudflare_api_token_required');
    if (!accountId) throw new Error('cloudflare_account_id_required');
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiToken}`,
        'content-type': 'application/json',
        'cf-aig-gateway-id': gatewayId,
      },
      body: JSON.stringify(body),
      signal: typeof AbortSignal?.timeout === 'function' && Number(params.timeoutMs || options.timeoutMs) > 0
        ? AbortSignal.timeout(Number(params.timeoutMs || options.timeoutMs))
        : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error?.message || data?.errors?.[0]?.message || data?.message || `Cloudflare Workers AI HTTP ${response.status}`);
      error.status = response.status;
      error.provider = 'cloudflare';
      throw error;
    }
    return data;
  }

  async function send(messages, params = {}) {
    const record = params.modelRecord || options.modelRecord;
    if (!record || record.provider !== 'cloudflare') throw new Error('cloudflare_model_record_required');
    const emitFn = params.emit || options.emit;
    const model = record.provider_model_id;
    const tools = toolsForChat(params.tools || []);
    emit(emitFn, 'model.started', { provider: 'cloudflare', model, reasoning_effort: 'auto', requested_service_tier: 'default' }, params.runId);

    let response;
    try {
      response = await request({
        model,
        messages,
        ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
        ...(Number(params.maxOutputTokens) > 0 ? { max_tokens: Number(params.maxOutputTokens) } : {}),
      }, params);
    } catch (error) {
      const diagnostic = diagnosticFromError(error, { source: 'cloudflare', kind: 'provider_error' });
      emit(emitFn, 'error.observed', diagnostic, params.runId);
      emit(emitFn, 'run.failed', { stage: 'model', provider: 'cloudflare', model, error: diagnostic }, params.runId);
      throw error;
    }

    const message = response?.choices?.[0]?.message || { role: 'assistant', content: '' };
    const delta = usageParts(response);
    const usageSnapshot = createUsageSnapshot({
      current_context: { input_tokens: delta.input_tokens, window_tokens: Number(record.context_window) || 0 },
      cumulative: cumulative(params.cumulativeUsage, delta),
      estimate_kind: 'provider',
    });
    emit(emitFn, 'usage.snapshot', usageSnapshot, params.runId);
    emit(emitFn, 'model.completed', {
      provider: 'cloudflare', model, response_id: response.id || null,
      status: response?.choices?.[0]?.finish_reason || 'completed',
      requested_service_tier: 'default', actual_service_tier: 'default',
    }, params.runId);

    return Object.freeze({
      provider: 'cloudflare',
      model,
      response_id: response.id || null,
      status: response?.choices?.[0]?.finish_reason || 'completed',
      output_text: typeof message.content === 'string' ? message.content : '',
      tool_calls: Object.freeze(toolCalls(message)),
      usage_delta: Object.freeze(delta),
      usage_snapshot: usageSnapshot,
      cost: null,
      provider_state: Object.freeze({ messages: [...messages, message] }),
      requested_service_tier: 'default',
      actual_service_tier: 'default',
      raw: response,
    });
  }

  async function create(params = {}) {
    const prior = Array.isArray(params.providerState?.messages) ? params.providerState.messages : [];
    const messages = [...prior];
    if (clean(params.instructions) && !messages.some((row) => row.role === 'system')) {
      messages.unshift({ role: 'system', content: String(params.instructions) });
    }
    messages.push({ role: 'user', content: typeof params.input === 'string' ? params.input : JSON.stringify(params.input ?? '') });
    return send(messages, params);
  }

  async function continueWithToolOutputs(params = {}) {
    const prior = Array.isArray(params.providerState?.messages) ? params.providerState.messages : [];
    if (!prior.length) throw new Error('cloudflare_provider_state_required');
    const toolMessages = (params.toolOutputs || []).map((row) => ({
      role: 'tool',
      tool_call_id: row.call_id || row.callId,
      content: typeof row.output === 'string' ? row.output : JSON.stringify(row.output ?? null),
    }));
    if (!toolMessages.length) throw new Error('cloudflare_tool_outputs_required');
    return send([...prior, ...toolMessages], params);
  }

  async function compact(params = {}) {
    const prior = Array.isArray(params.providerState?.messages) ? params.providerState.messages : [];
    if (!prior.length) throw new Error('cloudflare_provider_state_required');
    const emitFn = params.emit || options.emit;
    const startedAt = Date.now();
    emit(emitFn, 'context.compaction.started', { provider: 'cloudflare', model: params.model }, params.runId);
    const summary = await send([...prior, {
      role: 'user',
      content: 'Create a compact continuation summary of this conversation. Preserve the objective, decisions, changed files, active plan, unresolved failures, tool results that still matter, and constraints. Do not add new work.',
    }], { ...params, tools: [], maxOutputTokens: Math.min(Number(params.maxOutputTokens) || 4096, 4096) });
    const summaryText = String(summary.output_text || '').trim();
    const compactState = Object.freeze({ messages: [
      ...(params.instructions ? [{ role: 'system', content: String(params.instructions) }] : []),
      { role: 'user', content: 'Prior conversation continuation summary:' },
      { role: 'assistant', content: summaryText },
    ] });
    emit(emitFn, 'context.compaction.completed', {
      provider: 'cloudflare', model: params.model, summary_text: summaryText,
      tokens_before: params.tokensBefore ?? null,
      tokens_after: Math.ceil(summaryText.length / 4),
      duration_ms: Date.now() - startedAt,
    }, params.runId);
    return Object.freeze({ provider: 'cloudflare', output: Object.freeze([]), provider_state: compactState, summary_text: summaryText, usage: summary.usage_delta || null, cost: null });
  }

  return Object.freeze({ provider: 'cloudflare', create, continueWithToolOutputs, compact });
}
