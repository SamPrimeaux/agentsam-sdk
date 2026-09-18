import { calculateModelCost, getModelRecord } from '../models/index.js';
import { createAgentEvent, createUsageSnapshot } from '../telemetry/index.js';
import { createOpenAIHttpError, diagnosticFromError } from '../errors/index.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

function clean(value) { return value == null ? '' : String(value).trim(); }
function integer(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
function optionalSignal(timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined;
  return typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(Math.floor(timeoutMs)) : undefined;
}
function normalizeServiceTier(value, requested = 'default') {
  const tier = clean(value).toLowerCase();
  if (tier === 'priority') return 'fast';
  if (tier === 'auto' || !tier) return requested === 'auto' ? 'default' : requested;
  return tier;
}

function historyItems(input) {
  if (input == null) return [];
  if (Array.isArray(input)) return structuredClone(input);
  if (typeof input === 'string') return [{ role: 'user', content: input }];
  return [structuredClone(input)];
}

function xaiCompactionHistory(params = {}, response = {}) {
  if (params.providerState?.compaction_input && Array.isArray(params.providerState.compaction_input)) {
    return [
      ...structuredClone(params.providerState.compaction_input),
      ...historyItems(params.input),
      ...structuredClone(response.output || []),
    ];
  }
  const prefix = clean(params.instructions)
    ? [{ role: 'system', content: String(params.instructions) }]
    : [];
  return [
    ...prefix,
    ...historyItems(params.input),
    ...structuredClone(response.output || []),
  ];
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
  return (response.output || [])
    .filter((item) => item?.type === 'function_call')
    .map((item) => Object.freeze({
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

function normalizeTools(tools = []) {
  if (!Array.isArray(tools)) throw new TypeError('tools must be an array');
  return tools.map((tool) => {
    if (tool?.type !== 'function' || !clean(tool.name)) {
      throw new TypeError('OpenAI-compatible adapter tools must be Responses function tool descriptors');
    }
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

function assertRuntimeConfig(model, reasoningEffort, serviceTier, explicitRecord, expectedProvider) {
  const record = explicitRecord || getModelRecord(model);
  if (!record || record.provider !== expectedProvider) {
    throw new RangeError(`unsupported ${expectedProvider} model record: ${model}`);
  }
  const reasoning = Array.isArray(record.reasoning_efforts) && record.reasoning_efforts.length
    ? record.reasoning_efforts
    : ['auto'];
  const tiers = Array.isArray(record.service_tiers) && record.service_tiers.length
    ? record.service_tiers
    : ['default'];
  if (reasoningEffort !== 'auto' && !reasoning.includes(reasoningEffort)) {
    throw new RangeError(`unsupported reasoning effort for ${record.provider_model_id}: ${reasoningEffort}`);
  }
  if (!tiers.includes(serviceTier)) {
    throw new RangeError(`unsupported service tier for ${record.provider_model_id}: ${serviceTier}`);
  }
  return record;
}

function emitEvent(emit, type, payload, meta = {}) {
  if (typeof emit !== 'function') return;
  emit(createAgentEvent(type, payload, meta));
}

function genericHttpError(providerId, response, parsed, rawText) {
  const error = new Error(
    clean(parsed?.error?.message || parsed?.message) ||
    `${providerId} Responses API returned HTTP ${response.status}`,
  );
  error.status = response.status;
  error.provider = providerId;
  error.body = parsed;
  error.rawText = rawText;
  return error;
}

export function createOpenAIResponsesAdapter(options = {}) {
  const providerId = clean(options.providerId || 'openai').toLowerCase();
  const apiKey = clean(
    options.apiKey ||
    (providerId === 'openai' ? process.env.OPENAI_API_KEY : providerId === 'grok' ? process.env.XAI_API_KEY : ''),
  );
  const baseUrl = clean(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchImpl = options.fetchImpl || fetch;
  const defaultEmit = options.emit;
  const timeoutMs = options.timeoutMs;

  async function request(pathname, body, runtime = {}) {
    if (!apiKey) throw new Error(`${providerId}_api_key_required`);
    const response = await fetchImpl(`${baseUrl}${pathname}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: optionalSignal(runtime.timeoutMs ?? timeoutMs),
    });

    let rawText = '';
    let parsed = null;
    if (typeof response.text === 'function') {
      try { rawText = await response.text(); } catch { rawText = ''; }
      if (rawText) {
        try { parsed = JSON.parse(rawText); } catch { parsed = null; }
      }
    } else if (typeof response.json === 'function') {
      try {
        parsed = await response.json();
        rawText = JSON.stringify(parsed ?? null);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      if (providerId === 'openai') {
        throw createOpenAIHttpError({
          status: response.status,
          body: parsed,
          rawText,
          headers: response.headers,
          requestedServiceTier: body?.service_tier,
        });
      }
      throw genericHttpError(providerId, response, parsed, rawText);
    }

    return Object.freeze({
      data: parsed ?? {},
      http: Object.freeze({
        status: response.status,
        request_id: clean(
          response.headers?.get?.('x-request-id') ||
          response.headers?.get?.('openai-request-id'),
        ) || null,
        ray_id: clean(response.headers?.get?.('cf-ray')) || null,
      }),
    });
  }

  async function create(params = {}) {
    const suppliedRecord = params.modelRecord || options.modelRecord || null;
    const modelRecord = suppliedRecord || getModelRecord(params.model);
    const model = modelRecord?.provider_model_id || clean(params.model);
    const reasoningEffort = clean(params.reasoningEffort || params.reasoning_effort || 'auto');
    const serviceTier = clean(params.serviceTier || params.service_tier || 'default');
    const record = assertRuntimeConfig(model, reasoningEffort, serviceTier, modelRecord, providerId);
    const emit = params.emit || defaultEmit;
    const meta = { runId: params.runId, sequence: params.sequence };
    const tools = normalizeTools(params.tools || []);
    const previousResponseId = clean(params.previousResponseId || params.providerState?.previous_response_id);

    const body = {
      model,
      input: params.input ?? '',
      ...(reasoningEffort !== 'auto' ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(providerId === 'openai' || serviceTier !== 'default' ? { service_tier: serviceTier } : {}),
      store: params.store !== false,
      truncation: 'disabled',
      parallel_tool_calls: params.parallelToolCalls !== false,
      ...(clean(params.instructions) ? { instructions: String(params.instructions) } : {}),
      ...(tools.length ? { tools } : {}),
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
      ...(Number.isInteger(params.maxOutputTokens) && params.maxOutputTokens > 0
        ? { max_output_tokens: params.maxOutputTokens }
        : {}),
      ...(clean(params.promptCacheKey) ? { prompt_cache_key: clean(params.promptCacheKey) } : {}),
      ...(params.promptCacheOptions ? { prompt_cache_options: params.promptCacheOptions } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
      ...(params.background === true ? { background: true } : {}),
    };

    emitEvent(emit, 'model.started', {
      provider: providerId,
      model,
      reasoning_effort: reasoningEffort,
      requested_service_tier: serviceTier,
    }, meta);

    let response;
    let http;
    try {
      const result = await request('/responses', body, params);
      response = result.data;
      http = result.http;
    } catch (error) {
      const diagnostic = diagnosticFromError(error, { source: providerId, kind: 'provider_error' });
      emitEvent(emit, 'error.observed', diagnostic, meta);
      emitEvent(emit, 'run.failed', { stage: 'model', provider: providerId, model, error: diagnostic }, meta);
      throw error;
    }

    const delta = usageParts(response);
    const actualServiceTier = normalizeServiceTier(response.service_tier, serviceTier);
    const cost = record.pricing
      ? calculateModelCost(record, { ...delta, estimate_kind: 'provider' }, { serviceTier: actualServiceTier })
      : null;
    const usageSnapshot = createUsageSnapshot({
      current_context: {
        input_tokens: delta.input_tokens,
        window_tokens: Number(record.context_window) || 0,
      },
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
    if (cost) emitEvent(emit, 'cost.snapshot', cost, meta);
    emitEvent(emit, 'model.completed', {
      provider: providerId,
      model,
      response_id: response.id,
      status: response.status,
      request_id: http?.request_id || null,
      ray_id: http?.ray_id || null,
      requested_service_tier: serviceTier,
      actual_service_tier: actualServiceTier,
    }, meta);

    const providerState = providerId === 'grok'
      ? Object.freeze({
          previous_response_id: response.id || null,
          compaction_input: xaiCompactionHistory(params, response),
        })
      : Object.freeze({ previous_response_id: response.id || null });

    return Object.freeze({
      provider: providerId,
      model,
      response_id: response.id || null,
      status: response.status || 'completed',
      request_id: http?.request_id || null,
      ray_id: http?.ray_id || null,
      output_text: extractOpenAIOutputText(response),
      tool_calls: Object.freeze(extractOpenAIFunctionCalls(response)),
      usage_delta: Object.freeze(delta),
      usage_snapshot: usageSnapshot,
      cost,
      provider_state: providerState,
      requested_service_tier: serviceTier,
      actual_service_tier: actualServiceTier,
      raw: response,
    });
  }

  async function continueWithToolOutputs(params = {}) {
    const previousResponseId = clean(params.previousResponseId || params.providerState?.previous_response_id);
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
    if (providerId !== 'openai' && providerId !== 'grok') throw new Error(`native_compaction_unavailable:${providerId}`);
    const modelRecord = params.modelRecord || options.modelRecord || getModelRecord(params.model);
    const model = modelRecord?.provider_model_id || clean(params.model);
    if (!modelRecord || modelRecord.provider !== providerId) {
      throw new RangeError(`unsupported ${providerId} model record: ${params.model}`);
    }

    const emit = params.emit || defaultEmit;
    const meta = { runId: params.runId, sequence: params.sequence };
    const previousResponseId = clean(params.previousResponseId || params.providerState?.previous_response_id);
    const body = {
      model,
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
      ...(params.input != null ? { input: params.input } : {}),
      ...(clean(params.instructions) ? { instructions: String(params.instructions) } : {}),
      ...(clean(params.promptCacheKey) ? { prompt_cache_key: clean(params.promptCacheKey) } : {}),
      ...(params.promptCacheOptions ? { prompt_cache_options: params.promptCacheOptions } : {}),
    };

    const compactStartedAt = Date.now();
    emitEvent(emit, 'context.compaction.started', {
      provider: providerId,
      model,
      previous_response_id: previousResponseId || null,
    }, meta);

    let response;
    let http;
    try {
      const result = await request('/responses/compact', body, params);
      response = result.data;
      http = result.http;
    } catch (error) {
      const diagnostic = diagnosticFromError(error, { source: providerId, kind: 'provider_error' });
      emitEvent(emit, 'error.observed', diagnostic, meta);
      emitEvent(emit, 'run.failed', { stage: 'compaction', provider: providerId, model, error: diagnostic }, meta);
      throw error;
    }

    const compactUsage = usageParts(response);
    const compactCost = modelRecord.pricing
      ? calculateModelCost(modelRecord, { ...compactUsage, estimate_kind: 'provider' }, { serviceTier: 'default' })
      : null;
    if (compactCost) emitEvent(emit, 'cost.snapshot', compactCost, meta);
    emitEvent(emit, 'context.compaction.completed', {
      provider: providerId,
      model,
      compaction_id: response.id,
      usage: response.usage || null,
      tokens_before: Number(params.tokensBefore || compactUsage.input_tokens || 0),
      tokens_after: Number(compactUsage.output_tokens || 0),
      duration_ms: Date.now() - compactStartedAt,
      request_id: http?.request_id || null,
      ray_id: http?.ray_id || null,
    }, meta);

    return Object.freeze({
      provider: providerId,
      model,
      compaction_id: response.id,
      request_id: http?.request_id || null,
      ray_id: http?.ray_id || null,
      output: Object.freeze(response.output || []),
      provider_state: Object.freeze({ previous_response_id: null }),
      usage: response.usage || null,
      cost: compactCost,
      raw: response,
    });
  }

  return Object.freeze({
    provider: providerId,
    create,
    continueWithToolOutputs,
    ...(providerId === 'openai' ? { compact } : {}),
  });
}
