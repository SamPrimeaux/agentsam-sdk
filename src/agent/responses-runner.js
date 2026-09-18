import { createHash } from 'node:crypto';
import path from 'node:path';
import { assessContextUsage, compileAgentInstructions, createContextBudget, estimateContextTokens, truncateResultText } from '../context/index.js';
import { getModelRecord, calculateModelCost } from '../models/index.js';
import { searchToolCards, hydrateToolSchemas } from '../tools/index.js';
import { createAgentEvent } from '../telemetry/index.js';
import { diagnosticFromError } from '../errors/index.js';

const RUNTIME_OWNED_KEYS = new Set(['account_id', 'user_id', 'tenant_id', 'workspace_id', 'connection_id', 'runtime_lease_id', 'execution_id']);

function clean(value) { return value == null ? '' : String(value).trim(); }
function hash(value) { return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`; }
function event(emit, type, payload, runId) { if (typeof emit === 'function') emit(createAgentEvent(type, payload, { runId })); }

export function capabilityFunctionName(id) {
  const source = clean(id).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'capability';
  if (source.length <= 58) return `as_${source}`;
  return `as_${source.slice(0, 45)}_${createHash('sha256').update(source).digest('hex').slice(0, 10)}`;
}

function userMessage(text) {
  return { role: 'user', content: [{ type: 'input_text', text: String(text) }] };
}

function modelBudget(record) {
  const windowTokens = Number(record?.context_window);
  if (!Number.isFinite(windowTokens) || windowTokens <= 0) return null;
  const policy = record.context_policy || {};
  return createContextBudget({
    windowTokens,
    targetInputTokens: policy.target_input_tokens,
    compactAtTokens: policy.compact_at_tokens,
    interveneAtTokens: policy.intervene_at_tokens,
    maxNormalInputTokens: policy.max_normal_input_tokens,
    pricingThresholdTokens: policy.pricing_threshold_tokens,
    safetyMarginTokens: policy.safety_margin_tokens,
  });
}

export function buildAgentToolSurface(capabilityAdapter, objective, options = {}) {
  if (!capabilityAdapter?.toolDescriptors) throw new TypeError('capabilityAdapter.toolDescriptors is required');
  const catalog = capabilityAdapter.toolDescriptors({ includeUnavailable: false });
  const searched = searchToolCards(catalog, objective, { maxItems: options.maxTools ?? 8, maxChars: options.maxCardChars ?? 24_000 });
  const selected = searched.cards.map((card) => card.tool);
  const hydrated = hydrateToolSchemas(catalog, selected, { maxTools: options.maxTools ?? 8, maxChars: options.maxSchemaChars ?? 40_000 });
  const aliases = new Map();
  const tools = hydrated.tools.map((descriptor) => {
    const alias = capabilityFunctionName(descriptor.name);
    aliases.set(alias, descriptor.name);
    return Object.freeze({
      type: 'function',
      name: alias,
      description: descriptor.description,
      parameters: descriptor.input_schema || { type: 'object', properties: {} },
      strict: true,
    });
  });
  return Object.freeze({
    tools: Object.freeze(tools),
    aliases,
    descriptors: Object.freeze(hydrated.tools),
    receipt: Object.freeze({
      catalog_tools: catalog.length,
      cards_returned: searched.receipt.returned_items,
      card_chars: searched.receipt.chars,
      hydrated_tools: hydrated.receipt.hydrated_tools,
      hydrated_schema_chars: hydrated.receipt.schema_chars,
      deferred_tools: Object.freeze(hydrated.receipt.deferred_tools),
    }),
  });
}

function sanitizeToolInput(value, descriptor, cwd) {
  const parsed = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  for (const key of RUNTIME_OWNED_KEYS) delete parsed[key];
  const properties = descriptor?.input_schema?.properties || {};
  if (Object.hasOwn(properties, 'cwd')) parsed.cwd = cwd;
  return parsed;
}

function parseArguments(value) {
  if (!clean(value)) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('arguments must be an object');
    return parsed;
  } catch (error) { throw new Error(`invalid_tool_arguments:${error?.message || error}`); }
}

function boundedToolOutput(value, callId, maxChars) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const ref = `tool:${callId}`;
  const digest = hash(serialized);
  if (serialized.length <= maxChars) return Object.freeze({ ref, hash: digest, source_chars: serialized.length, chars: serialized.length, truncated: false, output: serialized });
  const bounded = truncateResultText(serialized, maxChars);
  return Object.freeze({
    ref,
    hash: digest,
    source_chars: serialized.length,
    chars: bounded.chars,
    truncated: true,
    output: JSON.stringify({ ref, hash: digest, truncated: true, source_chars: serialized.length, excerpt: bounded.text }),
  });
}

function toolResultCharBudget(activeTokens, budget) {
  if (!budget) return 48_000;
  if (!Number.isFinite(activeTokens) || activeTokens < 0) return budget.maxToolResultChars;
  const reserveTokens = 4_000;
  const headroomTokens = Math.max(256, budget.maxNormalInputTokens - Math.ceil(activeTokens) - reserveTokens);
  return Math.max(1_024, Math.min(budget.maxToolResultChars, Math.floor(headroomTokens * budget.charsPerToken)));
}

function projectedInputTokens({ instructions, input, toolSurface, priorActiveTokens, budget }) {
  const inputChars = typeof input === 'string' ? input.length : JSON.stringify(input ?? '').length;
  const charsPerToken = budget?.charsPerToken || 4;
  const newTokens = estimateContextTokens(String(instructions || '').length + inputChars + toolSurface.receipt.hydrated_schema_chars, charsPerToken);
  return Math.max(newTokens, Number.isFinite(priorActiveTokens) ? Math.ceil(priorActiveTokens) + newTokens : newTokens);
}

function assertEconomicPreflight(projectedTokens, budget, allowOverride) {
  if (!budget || allowOverride) return;
  if (budget.pricingThresholdTokens != null && projectedTokens > budget.pricingThresholdTokens) {
    throw new Error(`context_preflight_pricing_threshold:${projectedTokens}>${budget.pricingThresholdTokens}`);
  }
  if (projectedTokens >= budget.maxNormalInputTokens) throw new Error(`context_preflight_max_normal:${projectedTokens}>=${budget.maxNormalInputTokens}`);
  if (projectedTokens >= budget.compactAtTokens) throw new Error(`context_preflight_compaction_required:${projectedTokens}>=${budget.compactAtTokens}`);
}

export async function runResponsesAgent(options = {}) {
  const provider = options.provider;
  if (!provider?.create || !provider?.continueWithToolOutputs) throw new TypeError('Responses provider adapter is required');
  if (!options.capabilityAdapter) throw new TypeError('capabilityAdapter is required');
  const cwd = path.resolve(options.cwd || process.cwd());
  const objective = clean(options.prompt);
  if (!objective) throw new TypeError('prompt is required');
  const record = options.modelRecord || getModelRecord(options.model);
  if (!record) throw new RangeError(`unknown model: ${options.model}`);
  const reasoningEffort = clean(options.reasoningEffort || 'auto');
  const serviceTier = clean(options.serviceTier || 'default');
  const budget = modelBudget(record);
  const instructionSet = options.instructions == null ? compileAgentInstructions(cwd, { maxChars: budget?.maxSystemChars || 48_000 }) : null;
  const instructions = options.instructions == null ? instructionSet.content : String(options.instructions);
  const toolSurface = buildAgentToolSurface(options.capabilityAdapter, objective, options);
  const emit = options.emit;
  const runId = options.runId;
  event(emit, 'tool.search', toolSurface.receipt, runId);

  let previousResponseId = clean(options.previousResponseId || options.previousProviderState?.previous_response_id) || null;
  let providerState = options.previousProviderState && typeof options.previousProviderState === 'object'
    ? structuredClone(options.previousProviderState)
    : previousResponseId ? { previous_response_id: previousResponseId } : null;
  let priorActiveTokens = options.previousUsageSnapshot?.current_context?.input_tokens;
  let input = objective;
  let compacted = null;
  let projected = projectedInputTokens({ instructions, input, toolSurface, priorActiveTokens, budget });

  if (projected >= budget.compactAtTokens && previousResponseId && options.autoCompact !== false && typeof provider.compact === 'function') {
    compacted = await provider.compact({
      model: record.provider_model_id,
      previousResponseId,
      instructions,
      promptCacheKey: options.promptCacheKey,
      emit,
      runId,
    });
    input = [...(compacted.output || []), userMessage(objective)];
    previousResponseId = null;
    priorActiveTokens = null;
    projected = projectedInputTokens({ instructions, input, toolSurface, priorActiveTokens, budget });
  }

  assertEconomicPreflight(projected, budget, options.allowEconomicOverride === true);
  const pressure = assessContextUsage(projected, budget);
  const maxOutputTokens = Number.isInteger(options.maxOutputTokens) && options.maxOutputTokens > 0
    ? Math.min(options.maxOutputTokens, record.max_output_tokens)
    : Math.min(32_768, record.max_output_tokens);
  const projectedCost = calculateModelCost(record, { input_tokens: projected, output_tokens: maxOutputTokens }, { serviceTier });
  if (Number.isFinite(options.maxCallCostUsd) && projectedCost.total_usd > options.maxCallCostUsd) {
    throw new Error(`projected_call_cost_exceeds_budget:${projectedCost.total_usd.toFixed(6)}>${Number(options.maxCallCostUsd).toFixed(6)}`);
  }
  const preflight = Object.freeze({
    model: record.provider_model_id,
    reasoning_effort: reasoningEffort,
    service_tier: serviceTier,
    estimated_input_tokens: projected,
    max_output_tokens: maxOutputTokens,
    projected_max_call_cost_usd: projectedCost.total_usd,
    pricing_threshold_tokens: budget.pricingThresholdTokens,
    tokens_until_pricing_threshold: pressure.tokensUntilPricingThreshold,
    compacted_before_turn: Boolean(compacted),
    estimate_kind: 'local',
  });
  if (typeof options.beforeRequest === 'function') {
    const approved = await options.beforeRequest(preflight);
    if (approved === false) throw new Error('model_request_not_approved');
  }
  event(emit, 'context.snapshot', {
    estimate_kind: 'local',
    estimated_input_tokens: projected,
    window_tokens: budget.windowTokens,
    utilization_ratio: pressure.utilizationRatio,
    pricing_threshold_tokens: budget.pricingThresholdTokens,
    tokens_until_pricing_threshold: pressure.tokensUntilPricingThreshold,
    pressure: pressure.stage,
    projected_max_call_cost_usd: projectedCost.total_usd,
    tool_surface: toolSurface.receipt,
  }, runId);

  let cumulativeUsage = options.cumulativeUsage || null;
  let totalCostUsd = 0;
  const costBreakdownUsd = { input: 0, cached_input: 0, cache_write: 0, output: 0 };
  const accumulateCost = (cost) => {
    totalCostUsd += Number(cost?.total_usd || 0);
    for (const key of Object.keys(costBreakdownUsd)) costBreakdownUsd[key] += Number(cost?.components_usd?.[key] || 0);
  };
  let response = await provider.create({
    model: record.provider_model_id,
    input,
    instructions,
    reasoningEffort,
    serviceTier,
    tools: toolSurface.tools,
    previousResponseId: previousResponseId || undefined,
    maxOutputTokens,
    promptCacheKey: options.promptCacheKey,
    cumulativeUsage,
    emit,
    runId,
  });
  accumulateCost(response.cost);
  cumulativeUsage = response.usage_snapshot?.cumulative || cumulativeUsage;

  const toolReceipts = [];
  const maxToolRounds = Number.isInteger(options.maxToolRounds) && options.maxToolRounds > 0 ? options.maxToolRounds : 8;
  let rounds = 0;
  while (response.tool_calls?.length) {
    rounds += 1;
    if (rounds > maxToolRounds) throw new Error(`tool_round_limit_exceeded:${maxToolRounds}`);
    const outputs = [];
    const activeTokens = response.usage_snapshot?.current_context?.input_tokens;
    const maxToolChars = toolResultCharBudget(activeTokens, budget);
    for (const call of response.tool_calls) {
      const capabilityId = toolSurface.aliases.get(call.name);
      if (!capabilityId) throw new Error(`unrecognized_tool_call:${call.name}`);
      const descriptor = toolSurface.descriptors.find((row) => row.name === capabilityId);
      const args = sanitizeToolInput(parseArguments(call.arguments), descriptor, cwd);
      if (typeof options.beforeTool === 'function') {
        const approved = await options.beforeTool({
          call_id: call.call_id,
          capability_id: capabilityId,
          descriptor: descriptor ? { ...descriptor, input_schema: undefined } : null,
          input: args,
          cwd,
        });
        if (approved === false) {
          const denied = new Error(`tool_execution_not_approved:${capabilityId}`);
          denied.code = 'AGENTSAM_TOOL_NOT_APPROVED';
          const diagnostic = diagnosticFromError(denied, { source: 'tool', kind: 'tool_execution_denied' });
          event(emit, 'tool.failed', { call_id: call.call_id, capability_id: capabilityId, error: diagnostic }, runId);
          event(emit, 'error.observed', { ...diagnostic, call_id: call.call_id, capability_id: capabilityId }, runId);
          throw denied;
        }
      }
      event(emit, 'tool.started', { call_id: call.call_id, capability_id: capabilityId }, runId);
      try {
        const value = await options.capabilityAdapter.invoke(capabilityId, args);
        const bounded = boundedToolOutput(value, call.call_id, maxToolChars);
        toolReceipts.push(Object.freeze({ call_id: call.call_id, capability_id: capabilityId, ...bounded, output: undefined }));
        outputs.push({ call_id: call.call_id, output: bounded.output });
        event(emit, 'tool.completed', {
          call_id: call.call_id,
          capability_id: capabilityId,
          result_ref: bounded.ref,
          result_hash: bounded.hash,
          result_chars: bounded.chars,
          source_chars: bounded.source_chars,
          truncated: bounded.truncated,
        }, runId);
      } catch (error) {
        const diagnostic = diagnosticFromError(error, { source: 'tool', kind: 'tool_execution_error' });
        event(emit, 'tool.failed', { call_id: call.call_id, capability_id: capabilityId, error: diagnostic }, runId);
        event(emit, 'error.observed', { ...diagnostic, call_id: call.call_id, capability_id: capabilityId }, runId);
        outputs.push({ call_id: call.call_id, output: JSON.stringify({ ok: false, error: diagnostic }) });
      }
    }
    response = await provider.continueWithToolOutputs({
      model: record.provider_model_id,
      previousResponseId: response.response_id,
      toolOutputs: outputs,
      instructions,
      reasoningEffort,
      serviceTier,
      tools: toolSurface.tools,
      maxOutputTokens,
      promptCacheKey: options.promptCacheKey,
      cumulativeUsage,
      emit,
      runId,
    });
    accumulateCost(response.cost);
    cumulativeUsage = response.usage_snapshot?.cumulative || cumulativeUsage;
  }

  const active = response.usage_snapshot?.current_context?.input_tokens ?? 0;
  const finalPressure = assessContextUsage(active, budget);
  event(emit, 'context.snapshot', {
    estimate_kind: 'provider',
    active_input_tokens: active,
    window_tokens: budget.windowTokens,
    utilization_ratio: finalPressure.utilizationRatio,
    pricing_threshold_tokens: budget.pricingThresholdTokens,
    tokens_until_pricing_threshold: finalPressure.tokensUntilPricingThreshold,
    pressure: finalPressure.stage,
    compact_before_next_turn: finalPressure.shouldCompact,
  }, runId);

  return Object.freeze({
    output_text: response.output_text || '',
    response_id: response.response_id,
    model: record.provider_model_id,
    reasoning_effort: reasoningEffort,
    requested_service_tier: serviceTier,
    actual_service_tier: response.actual_service_tier,
    usage_snapshot: response.usage_snapshot,
    cumulative_usage: cumulativeUsage,
    total_cost_usd: totalCostUsd,
    cost_breakdown_usd: Object.freeze({ ...costBreakdownUsd }),
    tool_surface: toolSurface.receipt,
    tool_receipts: Object.freeze(toolReceipts),
    compacted_before_turn: Boolean(compacted),
    continuation: Object.freeze({
      previous_response_id: response.response_id,
      usage_snapshot: response.usage_snapshot,
      compact_before_next_turn: finalPressure.shouldCompact,
    }),
  });
}
