import { createAgentEvent, createUsageSnapshot } from '../telemetry/index.js';
import { diagnosticFromError } from '../errors/index.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function integer(value) { const n = Number(value ?? 0); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0; }
function emit(emitFn, type, payload, runId) {
  if (typeof emitFn === 'function') emitFn(createAgentEvent(type, payload, { runId }));
}
function toolsForOllama(tools = []) {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || { type: 'object', properties: {} },
    },
  }));
}
function callsFromMessage(message = {}) {
  return (message.tool_calls || []).map((call, index) => ({
    call_id: call.id || `ocall_${index + 1}_${clean(call.function?.name)}`,
    name: call.function?.name,
    arguments: typeof call.function?.arguments === 'string'
      ? call.function.arguments
      : JSON.stringify(call.function?.arguments || {}),
  }));
}

export function createOllamaChatAdapter(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const endpoint = clean(options.endpoint || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');

  async function send(messages, params = {}) {
    const record = params.modelRecord || options.modelRecord;
    if (!record || record.provider !== 'ollama') throw new Error('ollama_model_record_required');
    const emitFn = params.emit || options.emit;
    const model = record.provider_model_id;
    emit(emitFn, 'model.started', { provider: 'ollama', model, reasoning_effort: 'auto', requested_service_tier: 'local' }, params.runId);

    let response;
    try {
      response = await fetchImpl(endpoint + '/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages,
          ...(params.tools?.length ? { tools: toolsForOllama(params.tools) } : {}),
          ...(Number(params.maxOutputTokens) > 0 ? { options: { num_predict: Number(params.maxOutputTokens) } } : {}),
        }),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    } catch (error) {
      const diagnostic = diagnosticFromError(error, { source: 'ollama', kind: 'provider_error' });
      emit(emitFn, 'error.observed', diagnostic, params.runId);
      emit(emitFn, 'run.failed', { stage: 'model', provider: 'ollama', model, error: diagnostic }, params.runId);
      throw error;
    }

    const data = await response.json();
    const message = data.message || { role: 'assistant', content: '' };
    const delta = {
      input_tokens: integer(data.prompt_eval_count),
      output_tokens: integer(data.eval_count),
      cached_input_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
    };
    const base = params.cumulativeUsage || {};
    const usageSnapshot = createUsageSnapshot({
      current_context: { input_tokens: delta.input_tokens, window_tokens: Number(record.context_window) || 0 },
      cumulative: {
        input_tokens: integer(base.input_tokens) + delta.input_tokens,
        output_tokens: integer(base.output_tokens) + delta.output_tokens,
        cached_input_tokens: integer(base.cached_input_tokens),
        cache_write_tokens: integer(base.cache_write_tokens),
        reasoning_tokens: integer(base.reasoning_tokens),
      },
      estimate_kind: 'provider',
    });
    emit(emitFn, 'usage.snapshot', usageSnapshot, params.runId);
    emit(emitFn, 'model.completed', { provider: 'ollama', model, status: data.done ? 'completed' : 'partial', requested_service_tier: 'local', actual_service_tier: 'local' }, params.runId);

    return Object.freeze({
      provider: 'ollama',
      model,
      response_id: null,
      status: data.done ? 'completed' : 'partial',
      output_text: String(message.content || ''),
      tool_calls: Object.freeze(callsFromMessage(message)),
      usage_delta: Object.freeze(delta),
      usage_snapshot: usageSnapshot,
      cost: null,
      provider_state: Object.freeze({ messages: [...messages, message] }),
      requested_service_tier: 'local',
      actual_service_tier: 'local',
      raw: data,
    });
  }

  async function create(params = {}) {
    const prior = Array.isArray(params.providerState?.messages) ? params.providerState.messages : [];
    const messages = [...prior];
    if (clean(params.instructions) && !messages.some((row) => row.role === 'system')) {
      messages.push({ role: 'system', content: String(params.instructions) });
    }
    messages.push({ role: 'user', content: typeof params.input === 'string' ? params.input : JSON.stringify(params.input ?? '') });
    return send(messages, params);
  }

  async function continueWithToolOutputs(params = {}) {
    const prior = Array.isArray(params.providerState?.messages) ? params.providerState.messages : [];
    if (!prior.length) throw new Error('ollama_provider_state_required');
    const toolMessages = (params.toolOutputs || []).map((row) => ({
      role: 'tool',
      content: typeof row.output === 'string' ? row.output : JSON.stringify(row.output ?? null),
    }));
    return send([...prior, ...toolMessages], params);
  }

  async function compact(params = {}) {
    const prior = Array.isArray(params.providerState?.messages) ? params.providerState.messages : [];
    if (!prior.length) throw new Error('ollama_provider_state_required');
    const emitFn = params.emit || options.emit;
    const startedAt = Date.now();
    emit(emitFn, 'context.compaction.started', { provider: 'ollama', model: params.model }, params.runId);
    const summary = await send([...prior, {
      role: 'user',
      content: 'Create a compact continuation summary of this conversation. Preserve the objective, decisions, changed files, active plan, unresolved failures, tool results that still matter, and constraints. Do not add new work.',
    }], { ...params, tools: [], maxOutputTokens: Math.min(Number(params.maxOutputTokens) || 4096, 4096) });
    const summaryText = String(summary.output_text || '').trim();
    const messages = [];
    if (params.instructions) messages.push({ role: 'system', content: String(params.instructions) });
    messages.push({ role: 'user', content: 'Prior conversation continuation summary:' });
    messages.push({ role: 'assistant', content: summaryText });
    const compactState = Object.freeze({ messages });
    emit(emitFn, 'context.compaction.completed', {
      provider: 'ollama', model: params.model, summary_text: summaryText,
      tokens_before: params.tokensBefore ?? null,
      tokens_after: Math.ceil(summaryText.length / 4),
      duration_ms: Date.now() - startedAt,
    }, params.runId);
    return Object.freeze({ provider: 'ollama', output: Object.freeze([]), provider_state: compactState, summary_text: summaryText, usage: summary.usage_delta || null });
  }

  return Object.freeze({ provider: 'ollama', create, continueWithToolOutputs, compact });
}
