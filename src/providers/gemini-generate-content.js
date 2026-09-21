import { compileToolSchema } from './tool-schema.js';
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
function toolDeclarations(tools = []) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description || '',
    parametersJsonSchema: compileToolSchema({ provider: 'gemini', canonicalSchema: tool.parameters, name: tool.name }).providerSchema,
  }));
}
function usageParts(response = {}) {
  const usage = response.usageMetadata || {};
  return {
    input_tokens: integer(usage.promptTokenCount),
    cached_input_tokens: integer(usage.cachedContentTokenCount),
    cache_write_tokens: 0,
    output_tokens: integer(usage.candidatesTokenCount),
    reasoning_tokens: integer(usage.thoughtsTokenCount),
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
function candidateContent(response = {}) {
  return response?.candidates?.[0]?.content || { role: 'model', parts: [] };
}
function outputText(content = {}) {
  return (content.parts || []).filter((part) => typeof part?.text === 'string').map((part) => part.text).join('');
}
function toolCalls(content = {}) {
  const calls = [];
  let index = 0;
  for (const part of content.parts || []) {
    if (!part?.functionCall?.name) continue;
    index += 1;
    calls.push({
      call_id: `gcall_${index}_${clean(part.functionCall.name).replace(/[^A-Za-z0-9_-]/g, '_')}`,
      name: part.functionCall.name,
      arguments: JSON.stringify(part.functionCall.args || {}),
    });
  }
  return calls;
}

export function createGeminiGenerateContentAdapter(options = {}) {
  const apiKey = clean(options.apiKey || process.env.GEMINI_API_KEY);
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = clean(options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');

  async function request(model, body, params = {}) {
    if (!apiKey) throw new Error('gemini_api_key_required');
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal(params.timeoutMs || options.timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error?.message || data?.message || `Gemini HTTP ${response.status}`);
      error.status = response.status;
      error.provider = 'gemini';
      throw error;
    }
    return data;
  }

  async function send(contents, params = {}) {
    const record = params.modelRecord || options.modelRecord;
    if (!record || record.provider !== 'gemini') throw new Error('gemini_model_record_required');
    const emitFn = params.emit || options.emit;
    const runId = params.runId;
    const model = record.provider_model_id;
    const declarations = toolDeclarations(params.tools || []);
    const body = {
      contents,
      ...(clean(params.instructions) ? { systemInstruction: { parts: [{ text: String(params.instructions) }] } } : {}),
      ...(declarations.length ? { tools: [{ functionDeclarations: declarations }] } : {}),
      generationConfig: {
        ...(Number(params.maxOutputTokens) > 0 ? { maxOutputTokens: Number(params.maxOutputTokens) } : {}),
      },
    };

    emit(emitFn, 'model.started', {
      provider: 'gemini',
      model,
      reasoning_effort: params.reasoningEffort || 'auto',
      requested_service_tier: 'default',
    }, runId);

    let response;
    try {
      response = await request(model, body, params);
    } catch (error) {
      const diagnostic = diagnosticFromError(error, { source: 'gemini', kind: 'provider_error' });
      emit(emitFn, 'error.observed', diagnostic, runId);
      emit(emitFn, 'run.failed', { stage: 'model', provider: 'gemini', model, error: diagnostic }, runId);
      throw error;
    }

    const content = candidateContent(response);
    const calls = toolCalls(content);
    const delta = usageParts(response);
    const usageSnapshot = createUsageSnapshot({
      current_context: { input_tokens: delta.input_tokens, window_tokens: Number(record.context_window) || 0 },
      cumulative: cumulative(params.cumulativeUsage, delta),
      estimate_kind: 'provider',
    });
    const cost = record.pricing ? calculateModelCost(record, delta, { serviceTier: 'default' }) : null;
    emit(emitFn, 'usage.snapshot', usageSnapshot, runId);
    if (cost) emit(emitFn, 'cost.snapshot', cost, runId);
    emit(emitFn, 'model.completed', {
      provider: 'gemini',
      model,
      response_id: response.responseId || null,
      status: response?.candidates?.[0]?.finishReason || 'completed',
      requested_service_tier: 'default',
      actual_service_tier: 'default',
    }, runId);

    return Object.freeze({
      provider: 'gemini',
      model,
      response_id: response.responseId || null,
      status: response?.candidates?.[0]?.finishReason || 'completed',
      output_text: outputText(content),
      tool_calls: Object.freeze(calls),
      usage_delta: Object.freeze(delta),
      usage_snapshot: usageSnapshot,
      cost,
      provider_state: Object.freeze({
        contents: [...contents, content],
        pending_tools: calls.map((call) => ({ call_id: call.call_id, name: call.name })),
      }),
      requested_service_tier: 'default',
      actual_service_tier: 'default',
      raw: response,
    });
  }

  async function create(params = {}) {
    const prior = Array.isArray(params.providerState?.contents) ? params.providerState.contents : [];
    const input = typeof params.input === 'string' ? params.input : JSON.stringify(params.input ?? '');
    return send([...prior, { role: 'user', parts: [{ text: input }] }], params);
  }

  async function continueWithToolOutputs(params = {}) {
    const prior = Array.isArray(params.providerState?.contents) ? params.providerState.contents : [];
    const pending = Array.isArray(params.providerState?.pending_tools) ? params.providerState.pending_tools : [];
    if (!prior.length) throw new Error('gemini_provider_state_required');
    const byId = new Map(pending.map((row) => [row.call_id, row.name]));
    const parts = (params.toolOutputs || []).map((row) => {
      const callId = row.call_id || row.callId;
      const name = byId.get(callId);
      if (!name) throw new Error(`gemini_tool_call_unknown:${callId}`);
      let responseValue = row.output;
      if (typeof responseValue === 'string') {
        try { responseValue = JSON.parse(responseValue); }
        catch { responseValue = { output: responseValue }; }
      }
      return { functionResponse: { name, response: responseValue ?? {} } };
    });
    if (!parts.length) throw new Error('gemini_tool_outputs_required');
    return send([...prior, { role: 'user', parts }], params);
  }

  async function compact(params = {}) {
    const prior = Array.isArray(params.providerState?.contents) ? params.providerState.contents : [];
    if (!prior.length) throw new Error('gemini_provider_state_required');
    const emitFn = params.emit || options.emit;
    const startedAt = Date.now();
    emit(emitFn, 'context.compaction.started', { provider: 'gemini', model: params.model }, params.runId);
    const summary = await send([...prior, {
      role: 'user',
      parts: [{ text: 'Create a compact continuation summary of this conversation. Preserve the objective, decisions, changed files, active plan, unresolved failures, tool results that still matter, and constraints. Do not add new work.' }],
    }], { ...params, tools: [], maxOutputTokens: Math.min(Number(params.maxOutputTokens) || 4096, 4096) });
    const summaryText = String(summary.output_text || '').trim();
    const compactState = Object.freeze({ contents: [
      { role: 'user', parts: [{ text: 'Prior conversation continuation summary:' }] },
      { role: 'model', parts: [{ text: summaryText }] },
    ], pending_tools: [] });
    emit(emitFn, 'context.compaction.completed', {
      provider: 'gemini', model: params.model, summary_text: summaryText,
      tokens_before: params.tokensBefore ?? null,
      tokens_after: Math.ceil(summaryText.length / 4),
      duration_ms: Date.now() - startedAt,
    }, params.runId);
    return Object.freeze({ provider: 'gemini', output: Object.freeze([]), provider_state: compactState, summary_text: summaryText, usage: summary.usage_delta || null });
  }

  return Object.freeze({ provider: 'gemini', create, continueWithToolOutputs, compact });
}
