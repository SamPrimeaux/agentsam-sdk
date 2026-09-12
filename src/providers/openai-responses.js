import { calculateModelCost, getModelRecord } from '../models/index.js';
import { createAgentEvent, createUsageSnapshot } from '../telemetry/index.js';
import { createOpenAIHttpError, diagnosticFromError } from '../errors/index.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

function clean(value) { return value == null ? '' : String(value).trim(); }
function integer(value) { const n = Number(value ?? 0); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0; }

function normalizeServiceTier(value, requested = 'default') {
  const tier = clean(value).toLowerCase();
  if (tier === 'priority') return 'fast';
  if (tier === 'auto' || !tier) return requested === 'auto' ? 'default' : requested;
  return tier;
}

export function extractOpenAIOutputText(response = {}) {
  if (typeof response.output_text === 'string') return response.output_text;
  const chunks = [];
  for (const item of response.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('');
}

export function extractOpenAIFunctionCalls(response = {}) {
  return (response.output || []).filter((item) => item?.type === 'function_call').map((item) => Object.freeze({
    id: item.id || null,
    call_id: item.call_id,
    name: item.name,
    arguments: item.arguments || '{}',
    status: item.status || null,
  }));
}

function usageParts(response = {}) {
  const usage = response.usage || {};
  return {
    input_tokens: integer(usage.input_tokens),
    cached_input_tokens: integer(usage.input_tokens_details?.cached_tokens),
    cache_write_tokens: integer(usage.input_tokens_details?.cache_write_tokens),
    output_tokens: integer(usage.output_tokens),
    reasoning_tokens: integer(usage.output_tokens_details?.reasoning_tokens),
  };
}

function errorMessage(body, status) {
  return body?.error?.message || body?.message || `OpenAI Responses API returned HTTP ${status}`;
}

function optionalSignal(timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined;
  if (typeof AbortSignal?.timeout !== 'function') return undefined;
  return AbortSignal.timeout(Math.floor(timeoutMs));
}

function normalizeTools(tools = []) {
  if (!Array.isArray(tools)) throw new TypeError('tools must be an array');
  return tools.map((tool) => {
    if (tool?.type !== 'function' || !clean(tool.name)) throw new TypeError('OpenAI adapter tools must be Responses function tool descriptors');
    return {
      type: 'function',
      name: clean(tool.name),
      description: clean(tool.description) || undefined,
      parameters: tool.parameters || { type: 'object', properties: {} },
      strict: tool.strict !== false,
      ...(tool.async === true ? { async: true } : {}),
    };
  });
}

function assertRuntimeConfig(model, reasoningEffort, serviceTier) {
  const record = getModelRecord(model);
  if (!record || record.provider !== 'openai') throw new RangeError(`unsupported OpenAI model catalog entry: ${model}`);
  if (!record.reasoning_efforts.includes(reasoningEffort)) throw new RangeError(`unsupported reasoning effort for ${record.provider_model_id}: ${reasoningEffort}`);
  if (!record.service_tiers.includes(serviceTier)) throw new RangeError(`unsupported service tier for ${record.provider_model_id}: ${serviceTier}`);
  return record;
}

function emitEvent(emit, type, payload, meta = {}) {
  if (typeof emit !== 'function') return;
  emit(createAgentEvent(type, payload, meta));
}

export function createOpenAIResponsesAdapter(options = {}) {
  const apiKey = clean(options.apiKey || process.env.OPENAI_API_KEY);
  const baseUrl = clean(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchImpl = options.fetchImpl || fetch;
  const defaultEmit = options.emit;
  const timeoutMs = options.timeoutMs;

  async function request(pathname, body, runtime = {}) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for OpenAI Responses execution');
    const response = await fetchImpl(`${baseUrl}${pathname}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: optionalSignal(runtime.timeoutMs ?? timeoutMs),
    });
    let rawText = '';
    try { rawText = await response.text(); } catch { rawText = ''; }
    let parsed = null;
    if (rawText) {
      try { parsed = JSON.parse(rawText); } catch { parsed = null; }
    }
    if (!response.ok) {
      throw createOpenAIHttpError({
        status: response.status,
        body: parsed,
        rawText,
        headers: response.headers,
        requestedServiceTier: body?.service_tier,
      });
    }
    return Object.freeze({
      data: parsed ?? {},
      http: Object.freeze({
        status: response.status,
        request_id: clean(response.headers?.get?.('x-request-id') || response.headers?.get?.('openai-request-id')) || null,
        ray_id: clean(response.headers?.get?.('cf-ray')) || null,
      }),
    });
  }

  async function create(params = {}) {
    const modelRecord = getModelRecord(params.model);
    const model = modelRecord?.provider_model_id || clean(params.model);
    const reasoningEffort = clean(params.reasoningEffort || params.reasoning_effort || 'low');
    const serviceTier = clean(params.serviceTier || params.service_tier || 'default');
    const record = assertRuntimeConfig(model, reasoningEffort, serviceTier);
    const emit = params.emit || defaultEmit;
    const meta = { runId: params.runId, sequence: params.sequence };
    const tools = normalizeTools(params.tools || []);
    const body = {
      model,
      input: params.input ?? '',
      reasoning: { effort: reasoningEffort },
      service_tier: serviceTier,
      store: params.store !== false,
      truncation: 'disabled',
      parallel_tool_calls: params.parallelToolCalls !== false,
      ...(clean(params.instructions) ? { instructions: String(params.instructions) } : {}),
      ...(tools.length ? { tools } : {}),
      ...(clean(params.previousResponseId) ? { previous_response_id: clean(params.previousResponseId) } : {}),
      ...(Number.isInteger(params.maxOutputTokens) && params.maxOutputTokens > 0 ? { max_output_tokens: params.maxOutputTokens } : {}),
      ...(clean(params.promptCacheKey) ? { prompt_cache_key: clean(params.promptCacheKey) } : {}),
      ...(params.promptCacheOptions ? { prompt_cache_options: params.promptCacheOptions } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
      ...(params.background === true ? { background: true } : {}),
    };

    emitEvent(emit, 'model.started', {
      provider: 'openai', model, reasoning_effort: reasoningEffort, requested_service_tier: serviceTier,
    }, meta);

    let response;
    try {
      response = await request('/responses', body, params);
    } catch (error) {
      emitEvent(emit, 'run.failed', { stage: 'model', provider: 'openai', model, message: error.message, status: error.status || null }, meta);
      throw error;
    }

    const delta = usageParts(response);
    const actualServiceTier = normalizeServiceTier(response.service_tier, serviceTier);
    const cost = calculateModelCost(record, { ...delta, estimate_kind: 'provider' }, { serviceTier: actualServiceTier });
    const usageSnapshot = createUsageSnapshot({
      current_context: { input_tokens: delta.input_tokens, window_tokens: record.context_window },
      cumulative: params.cumulativeUsage ? {
        input_tokens: integer(params.cumulativeUsage.input_tokens) + delta.input_tokens,
        output_tokens: integer(params.cumulativeUsage.output_tokens) + delta.output_tokens,
        cached_input_tokens: integer(params.cumulativeUsage.cached_input_tokens) + delta.cached_input_tokens,
        cache_write_tokens: integer(params.cumulativeUsage.cache_write_tokens) + delta.cache_write_tokens,
        reasoning_tokens: integer(params.cumulativeUsage.reasoning_tokens) + delta.reasoning_tokens,
      } : delta,
      estimate_kind: 'provider',
    });

    emitEvent(emit, 'usage.snapshot', usageSnapshot, meta);
    emitEvent(emit, 'cost.snapshot', cost, meta);
    emitEvent(emit, 'model.completed', {
      provider: 'openai', model, response_id: response.id, status: response.status,
      requested_service_tier: serviceTier, actual_service_tier: actualServiceTier,
    }, meta);

    return Object.freeze({
      provider: 'openai',
      model,
      response_id: response.id,
      status: response.status,
      output_text: extractOpenAIOutputText(response),
      tool_calls: Object.freeze(extractOpenAIFunctionCalls(response)),
      usage_delta: Object.freeze(delta),
      usage_snapshot: usageSnapshot,
      cost,
      requested_service_tier: serviceTier,
      actual_service_tier: actualServiceTier,
      raw: response,
    });
  }

  async function continueWithToolOutputs(params = {}) {
    const previousResponseId = clean(params.previousResponseId);
    if (!previousResponseId) throw new TypeError('previousResponseId is required');
    const outputs = (params.toolOutputs || []).map((row) => {
      const callId = clean(row.call_id || row.callId);
      if (!callId) throw new TypeError('tool output call_id is required');
      const output = typeof row.output === 'string' ? row.output : JSON.stringify(row.output ?? null);
      return { type: 'function_call_output', call_id: callId, output };
    });
    if (!outputs.length) throw new TypeError('at least one tool output is required');
    return create({ ...params, previousResponseId, input: outputs });
  }

  async function compact(params = {}) {
    const modelRecord = getModelRecord(params.model);
    const model = modelRecord?.provider_model_id || clean(params.model);
    if (!modelRecord || modelRecord.provider !== 'openai') throw new RangeError(`unsupported OpenAI model catalog entry: ${params.model}`);
    const emit = params.emit || defaultEmit;
    const meta = { runId: params.runId, sequence: params.sequence };
    const body = {
      model,
      ...(clean(params.previousResponseId) ? { previous_response_id: clean(params.previousResponseId) } : {}),
      ...(params.input != null ? { input: params.input } : {}),
      ...(clean(params.instructions) ? { instructions: String(params.instructions) } : {}),
      ...(clean(params.promptCacheKey) ? { prompt_cache_key: clean(params.promptCacheKey) } : {}),
      ...(params.promptCacheOptions ? { prompt_cache_options: params.promptCacheOptions } : {}),
    };
    emitEvent(emit, 'context.compaction.started', { provider: 'openai', model, previous_response_id: body.previous_response_id || null }, meta);
    const response = await request('/responses/compact', body, params);
    emitEvent(emit, 'context.compaction.completed', {
      provider: 'openai', model, compaction_id: response.id, usage: response.usage || null,
    }, meta);
    return Object.freeze({ provider: 'openai', model, compaction_id: response.id, output: Object.freeze(response.output || []), usage: response.usage || null, raw: response });
  }

  return Object.freeze({ provider: 'openai', create, continueWithToolOutputs, compact });
}
