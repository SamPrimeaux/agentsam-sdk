import { compileToolSchema, restoreOptionalArguments } from '../providers/tool-schema.js';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { assessContextUsage, compileAgentInstructions, createContextBudget, estimateContextTokens, truncateResultText, resolveProjectContext, buildProjectCard } from '../context/index.js';
import { getModelRecord, calculateModelCost } from '../models/index.js';
import { searchToolCards, hydrateToolSchemas } from '../tools/index.js';
import { createAgentEvent } from '../telemetry/index.js';
import { diagnosticFromError } from '../errors/index.js';

const RUNTIME_OWNED_KEYS = new Set(['account_id', 'user_id', 'tenant_id', 'workspace_id', 'connection_id', 'runtime_lease_id', 'execution_id']);

// A single integer ceiling ("die after 8 rounds") is not a meaningful safety
// invariant for genuine engineering work -- it stops runs mid-task for no
// reason tied to risk, cost, or progress. Replace it with named modes so
// callers pick a budget that matches the work, while `quick` preserves the
// exact previous default (8) for any caller that doesn't opt in.
const RUN_MODE_BUDGETS = Object.freeze({ quick: 8, interactive: 32, agent: 128, long: 512 });
const DEFAULT_NO_PROGRESS_LIMIT = 4;

function clean(value) { return value == null ? '' : String(value).trim(); }
function hash(value) { return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`; }
function event(emit, type, payload, runId) { if (typeof emit === 'function') emit(createAgentEvent(type, payload, { runId })); }

export function capabilityFunctionName(id) {
  const source = clean(id).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'capability';
  if (source.length <= 58) return `as_${source}`;
  return `as_${source.slice(0, 45)}_${createHash('sha256').update(source).digest('hex').slice(0, 10)}`;
}

// A turn's tool surface is a relevance-scored, maxTools-capped subset of the
// full capability catalog (see buildAgentToolSurface). Provider conversation
// state (previousResponseId) can carry a tool name from an earlier turn into
// a later turn whose narrower surface no longer hydrated that capability, so
// the model can legitimately call a real, executable capability whose alias
// simply isn't in *this round's* toolSurface.aliases map. Before treating
// that as an unrecognized/hallucinated call, check it against the adapter's
// full executable catalog: if the alias resolves to a real, currently
// invocable capability, honor it rather than failing a legitimate call.
export function resolveCapabilityFallback(capabilityAdapter, aliasName) {
  if (!capabilityAdapter?.toolDescriptors) return null;
  const fullCatalog = capabilityAdapter.toolDescriptors({ includeUnavailable: false });
  const descriptor = fullCatalog.find((row) => capabilityFunctionName(row.name) === aliasName);
  if (!descriptor) return null;
  return { capabilityId: descriptor.name, descriptor };
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
      parameters: ['openai', 'grok', 'gemini'].includes(options.schemaProvider)
        ? compileToolSchema({ provider: options.schemaProvider, canonicalSchema: descriptor.input_schema, name: alias }).providerSchema
        : descriptor.input_schema || { type: 'object', properties: {}, required: [], additionalProperties: false },
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
      hydrated_schema_chars: tools.reduce((sum, tool) => sum + JSON.stringify(tool.parameters).length, 0),
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
  let instructions;
  let resolvedContext = null;
  if (options.instructions == null) {
    const card = buildProjectCard(cwd, {
      activeTaskId: options.activeTaskId || options.taskId,
      lockedBy: options.lockedBy,
      checkpointSha: options.checkpointSha,
      beliefs: options.beliefs || options.workspaceState,
    });
    resolvedContext = resolveProjectContext({
      cwd,
      objective,
      budget,
      items: [
        {
          kind: 'repo',
          ref: 'project://card',
          priority: 100,
          content: card.content,
        },
        ...(options.contextItems || []),
      ],
    });
    const cardContent = resolvedContext.items.find((i) => i.ref === 'project://card')?.content || card.content;
    const extraContent = resolvedContext.items
      .filter((i) => i.ref !== 'project://card')
      .map((i) => i.content)
      .join('\n\n');
    const ruleContent = resolvedContext.rules?.content || '';
    instructions = [cardContent, extraContent, ruleContent].filter(Boolean).join('\n\n');
  } else {
    instructions = String(options.instructions);
  }
  const toolSurface = buildAgentToolSurface(options.capabilityAdapter, objective, { ...options, schemaProvider: record.provider });
  const emit = options.emit;
  const runId = options.runId;
  event(emit, 'tool.search', toolSurface.receipt, runId);

  let previousResponseId = clean(options.previousResponseId || options.previousProviderState?.previous_response_id) || null;
  let providerState = options.previousProviderState && typeof options.previousProviderState === 'object'
    ? structuredClone(options.previousProviderState)
    : previousResponseId ? { previous_response_id: previousResponseId } : null;
  let priorActiveTokens = options.previousUsageSnapshot?.current_context?.input_tokens;
  let input = objective;
  const pendingCompactedInput = providerState?.compacted_input;
  if (!previousResponseId && Array.isArray(providerState?.compacted_input)) {
    input = [...providerState.compacted_input, userMessage(objective)];
    providerState = { ...providerState, compacted_input: undefined, compaction_input: undefined, has_compacted_input: undefined };
    priorActiveTokens = null;
  }
  let compacted = null;
  let projected = projectedInputTokens({ instructions, input, toolSurface, priorActiveTokens, budget });

  if (budget && projected >= budget.compactAtTokens && providerState && options.autoCompact !== false && typeof provider.compact === 'function') {
    compacted = await provider.compact({
      model: record.provider_model_id,
      modelRecord: record,
      previousResponseId,
      providerState,
      input: !previousResponseId && pendingCompactedInput ? pendingCompactedInput : undefined,
      instructions,
      promptCacheKey: options.promptCacheKey,
      tokensBefore: Number.isFinite(priorActiveTokens) ? priorActiveTokens : projected,
      emit,
      runId,
    });
    if (!Array.isArray(compacted.output) || !compacted.output.length) throw new Error('provider_compaction_output_missing');
    input = [...compacted.output, userMessage(objective)];
    // The returned output is the canonical input; do not prepend it again in the adapter.
    providerState = null;
    previousResponseId = null;
    if (typeof options.onCompaction === 'function') await options.onCompaction(compacted);
    priorActiveTokens = null;
    projected = projectedInputTokens({ instructions, input, toolSurface, priorActiveTokens, budget });
  }

  assertEconomicPreflight(projected, budget, options.allowEconomicOverride === true);
  const pressure = budget ? assessContextUsage(projected, budget) : null;
  const declaredMaxOutput = Number(record.max_output_tokens);
  const maxOutputTokens = Number.isInteger(options.maxOutputTokens) && options.maxOutputTokens > 0
    ? (Number.isFinite(declaredMaxOutput) && declaredMaxOutput > 0 ? Math.min(options.maxOutputTokens, declaredMaxOutput) : options.maxOutputTokens)
    : (Number.isFinite(declaredMaxOutput) && declaredMaxOutput > 0 ? Math.min(32_768, declaredMaxOutput) : 16_384);
  const projectedCost = record.pricing
    ? calculateModelCost(record, { input_tokens: projected, output_tokens: maxOutputTokens }, { serviceTier })
    : null;
  if (Number.isFinite(options.maxCallCostUsd) && projectedCost && projectedCost.total_usd > options.maxCallCostUsd) {
    throw new Error(`projected_call_cost_exceeds_budget:${projectedCost.total_usd.toFixed(6)}>${Number(options.maxCallCostUsd).toFixed(6)}`);
  }
  const preflight = Object.freeze({
    model: record.provider_model_id,
    reasoning_effort: reasoningEffort,
    service_tier: serviceTier,
    estimated_input_tokens: projected,
    max_output_tokens: maxOutputTokens,
    projected_max_call_cost_usd: projectedCost?.total_usd ?? null,
    pricing_threshold_tokens: budget?.pricingThresholdTokens ?? null,
    tokens_until_pricing_threshold: pressure?.tokensUntilPricingThreshold ?? null,
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
    window_tokens: budget?.windowTokens ?? null,
    utilization_ratio: pressure?.utilizationRatio ?? null,
    pricing_threshold_tokens: budget?.pricingThresholdTokens ?? null,
    tokens_until_pricing_threshold: pressure?.tokensUntilPricingThreshold ?? null,
    pressure: pressure?.stage ?? 'unknown',
    projected_max_call_cost_usd: projectedCost?.total_usd ?? null,
    tool_surface: toolSurface.receipt,
    resolver_receipt: resolvedContext?.receipt || null,
  }, runId);

  let cumulativeUsage = options.cumulativeUsage || null;
  if (compacted?.usage_delta || compacted?.usage) {
    const delta = compacted.usage_delta || compacted.usage;
    cumulativeUsage = Object.fromEntries(['input_tokens', 'output_tokens', 'cached_input_tokens', 'cache_write_tokens', 'reasoning_tokens'].map(key => [key, Number(cumulativeUsage?.[key] || 0) + Number(delta[key] || 0)]));
  }
  let totalCostUsd = 0;
  const costBreakdownUsd = { input: 0, cached_input: 0, cache_write: 0, output: 0 };
  const accumulateCost = (cost) => {
    totalCostUsd += Number(cost?.total_usd || 0);
    for (const key of Object.keys(costBreakdownUsd)) costBreakdownUsd[key] += Number(cost?.components_usd?.[key] || 0);
  };
  accumulateCost(compacted?.cost);
  let response = await provider.create({
    model: record.provider_model_id,
    modelRecord: record,
    input,
    instructions,
    reasoningEffort,
    serviceTier,
    autoCompact: options.autoCompact,
    tools: toolSurface.tools,
    previousResponseId: previousResponseId || undefined,
    providerState,
    maxOutputTokens,
    promptCacheKey: options.promptCacheKey,
    cumulativeUsage,
    emit,
    runId,
  });
  accumulateCost(response.cost);
  providerState = response.provider_state || (response.response_id ? { previous_response_id: response.response_id } : providerState);
  cumulativeUsage = response.usage_snapshot?.cumulative || cumulativeUsage;

  const toolReceipts = [];
  const maxToolRounds = Number.isInteger(options.maxToolRounds) && options.maxToolRounds > 0
    ? options.maxToolRounds
    : (RUN_MODE_BUDGETS[options.runMode] ?? RUN_MODE_BUDGETS.quick);
  const maxNoProgressRounds = Number.isInteger(options.maxNoProgressRounds) && options.maxNoProgressRounds > 0
    ? options.maxNoProgressRounds
    : DEFAULT_NO_PROGRESS_LIMIT;
  const runStartedAt = Date.now();
  let toolCallCount = 0;
  let lastRoundSignature = null;
  let repeatedRoundCount = 0;
  let rounds = 0;
  while (response.tool_calls?.length) {
    rounds += 1;
    if (rounds > maxToolRounds) throw new Error(`tool_round_limit_exceeded:${maxToolRounds}`);
    toolCallCount += response.tool_calls.length;
    const roundSignatureParts = [];
    const outputs = [];
    const activeTokens = response.usage_snapshot?.current_context?.input_tokens;
    const maxToolChars = toolResultCharBudget(activeTokens, budget);
    for (const call of response.tool_calls) {
      let capabilityId = toolSurface.aliases.get(call.name);
      let descriptor = capabilityId ? toolSurface.descriptors.find((row) => row.name === capabilityId) : null;
      if (!capabilityId) {
        const fallback = resolveCapabilityFallback(options.capabilityAdapter, call.name);
        if (fallback) { capabilityId = fallback.capabilityId; descriptor = fallback.descriptor; }
      }
      if (!capabilityId) throw new Error(`unrecognized_tool_call:${call.name}`);
      const args = sanitizeToolInput(restoreOptionalArguments(parseArguments(call.arguments), descriptor?.input_schema), descriptor, cwd);
      roundSignatureParts.push(`${capabilityId}:${JSON.stringify(args)}`);
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
    const roundSignature = roundSignatureParts.slice().sort().join('|');
    repeatedRoundCount = (roundSignature && roundSignature === lastRoundSignature) ? repeatedRoundCount + 1 : 0;
    lastRoundSignature = roundSignature;
    if (repeatedRoundCount >= maxNoProgressRounds) {
      throw new Error(`no_progress_detected:${repeatedRoundCount + 1}`);
    }
    response = await provider.continueWithToolOutputs({
      model: record.provider_model_id,
      previousResponseId: response.response_id,
      providerState: response.provider_state || providerState,
      modelRecord: record,
      toolOutputs: outputs,
      instructions,
      reasoningEffort,
      serviceTier,
      autoCompact: options.autoCompact,
      tools: toolSurface.tools,
      maxOutputTokens,
      promptCacheKey: options.promptCacheKey,
      cumulativeUsage,
      emit,
      runId,
    });
    accumulateCost(response.cost);
    providerState = response.provider_state || (response.response_id ? { previous_response_id: response.response_id } : providerState);
    cumulativeUsage = response.usage_snapshot?.cumulative || cumulativeUsage;
  }

  const active = response.usage_snapshot?.current_context?.input_tokens ?? 0;
  const finalPressure = budget ? assessContextUsage(active, budget) : null;
  event(emit, 'context.snapshot', {
    estimate_kind: 'provider',
    active_input_tokens: active,
    window_tokens: budget?.windowTokens ?? null,
    utilization_ratio: finalPressure?.utilizationRatio ?? null,
    pricing_threshold_tokens: budget?.pricingThresholdTokens ?? null,
    tokens_until_pricing_threshold: finalPressure?.tokensUntilPricingThreshold ?? null,
    pressure: finalPressure?.stage ?? 'unknown',
    compact_before_next_turn: finalPressure?.shouldCompact ?? false,
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
    run_budget: Object.freeze({
      run_mode: options.runMode || 'quick',
      max_tool_rounds: maxToolRounds,
      tool_rounds: rounds,
      tool_calls: toolCallCount,
      elapsed_ms: Date.now() - runStartedAt,
      max_no_progress_rounds: maxNoProgressRounds,
    }),
    compaction: compacted ? { compaction_id: compacted.compaction_id, provider: record.provider, model: record.provider_model_id, created_at: new Date().toISOString(), usage: compacted.usage_delta || compacted.usage || {}, cost_usd: compacted.cost?.total_usd || 0 } : null,
    compacted_before_turn: Boolean(compacted),
    provider_state: providerState,
    continuation: Object.freeze({
      previous_response_id: response.response_id || providerState?.previous_response_id || null,
      provider_state: providerState,
      usage_snapshot: response.usage_snapshot,
      compact_before_next_turn: finalPressure?.shouldCompact ?? false,
    }),
  });
}
