export const RUNTIME_RECEIPT_SCHEMA_VERSION = 1;

const RUN_MODES = new Set(['ask', 'plan', 'agent', 'debug', 'multitask']);
const RUN_STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'partial', 'cancelled']);
const APPROVAL_STATUSES = new Set(['pending', 'approved', 'denied', 'expired']);
const TERMINAL_STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'cancelled', 'unknown']);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function required(value, label) {
  const text = clean(value);
  if (!text) throw new TypeError(`${label} is required`);
  return text;
}

function optional(value) {
  const text = clean(value);
  return text || null;
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < 0) throw new RangeError('expected a non-negative number');
  return Math.floor(number);
}

function optionalNonNegativeInteger(value) {
  if (value == null || value === '') return null;
  return nonNegativeInteger(value);
}

function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < 0) throw new RangeError('expected a non-negative number');
  return number;
}

function canonicalMode(value) {
  const mode = clean(value || 'agent').toLowerCase();
  if (!RUN_MODES.has(mode)) throw new RangeError(`unsupported run mode: ${mode}`);
  return mode;
}

function canonicalRunStatus(value) {
  const status = clean(value || 'queued').toLowerCase();
  if (!RUN_STATUSES.has(status)) throw new RangeError(`unsupported run status: ${status}`);
  return status;
}

function jsonText(value, fallback) {
  if (value == null || value === '') return JSON.stringify(fallback);
  if (typeof value === 'string') {
    JSON.parse(value);
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Provider-neutral execution receipt. The authenticated host supplies account_id;
 * tenant/workspace/user aliases are deliberately not part of this contract.
 */
export function createRunReceipt(value = {}) {
  return Object.freeze({
    schema_version: RUNTIME_RECEIPT_SCHEMA_VERSION,
    id: required(value.id ?? value.run_id, 'id'),
    account_id: required(value.account_id ?? value.accountId, 'account_id'),
    conversation_id: optional(value.conversation_id ?? value.conversationId),
    external_agent_id: optional(value.external_agent_id ?? value.externalAgentId),
    parent_run_id: optional(value.parent_run_id ?? value.parentRunId),
    source_client: optional(value.source_client ?? value.sourceClient),
    surface: optional(value.surface),
    mode: canonicalMode(value.mode),
    model_key: optional(value.model_key ?? value.modelKey),
    reasoning_effort: optional(value.reasoning_effort ?? value.reasoningEffort),
    requested_service_tier: optional(value.requested_service_tier ?? value.requestedServiceTier),
    actual_service_tier: optional(value.actual_service_tier ?? value.actualServiceTier),
    selected_by: optional(value.selected_by ?? value.selectedBy),
    routing_arm_id: optional(value.routing_arm_id ?? value.routingArmId),
    status: canonicalRunStatus(value.status),
    cancel_requested: value.cancel_requested === true || value.cancel_requested === 1 ? 1 : 0,
    error_code: optional(value.error_code ?? value.errorCode),
    error_message: optional(value.error_message ?? value.errorMessage),
    model_call_count: nonNegativeInteger(value.model_call_count ?? value.modelCallCount),
    tool_call_count: nonNegativeInteger(value.tool_call_count ?? value.toolCallCount),
    input_tokens: nonNegativeInteger(value.input_tokens ?? value.inputTokens),
    cached_input_tokens: nonNegativeInteger(value.cached_input_tokens ?? value.cachedInputTokens),
    output_tokens: nonNegativeInteger(value.output_tokens ?? value.outputTokens),
    reasoning_tokens: nonNegativeInteger(value.reasoning_tokens ?? value.reasoningTokens),
    cost_usd: nonNegativeNumber(value.cost_usd ?? value.costUsd),
    created_at_unix: optionalNonNegativeInteger(value.created_at_unix ?? value.createdAtUnix),
    started_at_unix: optionalNonNegativeInteger(value.started_at_unix ?? value.startedAtUnix),
    completed_at_unix: optionalNonNegativeInteger(value.completed_at_unix ?? value.completedAtUnix),
    updated_at_unix: optionalNonNegativeInteger(value.updated_at_unix ?? value.updatedAtUnix),
    latency_ms: optionalNonNegativeInteger(value.latency_ms ?? value.latencyMs),
  });
}

/** One authoritative provider/model call receipt. */
export function createUsageReceipt(value = {}) {
  const inputTokens = nonNegativeInteger(value.input_tokens ?? value.inputTokens);
  const cachedInputTokens = nonNegativeInteger(value.cached_input_tokens ?? value.cachedInputTokens);
  const cacheWriteTokens = nonNegativeInteger(value.cache_write_tokens ?? value.cacheWriteTokens);
  const outputTokens = nonNegativeInteger(value.output_tokens ?? value.outputTokens);
  const reasoningTokens = nonNegativeInteger(value.reasoning_tokens ?? value.reasoningTokens);
  const totalTokens = value.total_tokens == null && value.totalTokens == null
    ? inputTokens + outputTokens
    : nonNegativeInteger(value.total_tokens ?? value.totalTokens);

  return Object.freeze({
    schema_version: RUNTIME_RECEIPT_SCHEMA_VERSION,
    id: required(value.id, 'id'),
    account_id: required(value.account_id ?? value.accountId, 'account_id'),
    agent_run_id: optional(value.agent_run_id ?? value.agentRunId),
    conversation_id: optional(value.conversation_id ?? value.conversationId),
    repository_id: optional(value.repository_id ?? value.repositoryId),
    source_client: optional(value.source_client ?? value.sourceClient),
    usage_kind: optional(value.usage_kind ?? value.usageKind) || 'model',
    provider: required(value.provider, 'provider'),
    model_key: required(value.model_key ?? value.modelKey, 'model_key'),
    model_call_index: optionalNonNegativeInteger(value.model_call_index ?? value.modelCallIndex),
    provider_request_id: optional(value.provider_request_id ?? value.providerRequestId),
    requested_service_tier: optional(value.requested_service_tier ?? value.requestedServiceTier),
    actual_service_tier: optional(value.actual_service_tier ?? value.actualServiceTier),
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    cache_write_tokens: cacheWriteTokens,
    output_tokens: outputTokens,
    reasoning_tokens: reasoningTokens,
    total_tokens: totalTokens,
    cost_usd: nonNegativeNumber(value.cost_usd ?? value.costUsd),
    cost_basis: optional(value.cost_basis ?? value.costBasis),
    duration_ms: optionalNonNegativeInteger(value.duration_ms ?? value.durationMs),
    status: optional(value.status) || 'ok',
    error_code: optional(value.error_code ?? value.errorCode),
    ref_table: optional(value.ref_table ?? value.refTable),
    ref_id: optional(value.ref_id ?? value.refId),
    created_at_unix: optionalNonNegativeInteger(value.created_at_unix ?? value.createdAtUnix),
  });
}

/** Approval receipt linked to execution/tool/process lineage without ownership aliases. */
export function createApprovalReceipt(value = {}) {
  const status = clean(value.status || 'pending').toLowerCase();
  if (!APPROVAL_STATUSES.has(status)) throw new RangeError(`unsupported approval status: ${status}`);
  return Object.freeze({
    schema_version: RUNTIME_RECEIPT_SCHEMA_VERSION,
    id: required(value.id, 'id'),
    account_id: required(value.account_id ?? value.accountId, 'account_id'),
    agent_run_id: optional(value.agent_run_id ?? value.agentRunId),
    tool_call_id: optional(value.tool_call_id ?? value.toolCallId),
    terminal_job_id: optional(value.terminal_job_id ?? value.terminalJobId),
    conversation_id: optional(value.conversation_id ?? value.conversationId),
    capability_key: optional(value.capability_key ?? value.capabilityKey),
    tool_key: optional(value.tool_key ?? value.toolKey),
    action_summary: required(value.action_summary ?? value.actionSummary, 'action_summary'),
    sanitized_input_json: jsonText(value.sanitized_input_json ?? value.sanitizedInput, {}),
    risk_level: optional(value.risk_level ?? value.riskLevel) || 'medium',
    approval_type: optional(value.approval_type ?? value.approvalType) || 'tool',
    status,
    response_json: jsonText(value.response_json ?? value.response, {}),
    approved_by: optional(value.approved_by ?? value.approvedBy),
    created_at: optionalNonNegativeInteger(value.created_at ?? value.createdAt),
    expires_at: optionalNonNegativeInteger(value.expires_at ?? value.expiresAt),
    decided_at: optionalNonNegativeInteger(value.decided_at ?? value.decidedAt),
    metadata_json: jsonText(value.metadata_json ?? value.metadata, {}),
  });
}

/** Thin durable process-control receipt; full terminal transcripts stay elsewhere. */
export function createTerminalJobReceipt(value = {}) {
  const status = clean(value.status || 'queued').toLowerCase();
  if (!TERMINAL_STATUSES.has(status)) throw new RangeError(`unsupported terminal job status: ${status}`);
  return Object.freeze({
    schema_version: RUNTIME_RECEIPT_SCHEMA_VERSION,
    id: required(value.id, 'id'),
    account_id: required(value.account_id ?? value.accountId, 'account_id'),
    instance_id: required(value.instance_id ?? value.instanceId, 'instance_id'),
    connection_id: required(value.connection_id ?? value.connectionId, 'connection_id'),
    session_id: optional(value.session_id ?? value.sessionId),
    source_run_id: optional(value.source_run_id ?? value.sourceRunId),
    tool_call_id: optional(value.tool_call_id ?? value.toolCallId),
    execos_run_id: optional(value.execos_run_id ?? value.execosRunId),
    status,
    cwd: optional(value.cwd),
    timeout_ms: optionalNonNegativeInteger(value.timeout_ms ?? value.timeoutMs),
    exit_code: value.exit_code == null && value.exitCode == null ? null : Number(value.exit_code ?? value.exitCode),
    failure_code: optional(value.failure_code ?? value.failureCode),
    log_ref: optional(value.log_ref ?? value.logRef),
    output_artifact_ref: optional(value.output_artifact_ref ?? value.outputArtifactRef),
    artifact_refs_json: jsonText(value.artifact_refs_json ?? value.artifactRefs, []),
    idempotency_key: optional(value.idempotency_key ?? value.idempotencyKey),
    attempt: nonNegativeInteger(value.attempt),
    max_attempts: Math.max(1, nonNegativeInteger(value.max_attempts ?? value.maxAttempts, 1)),
    last_observed_at: optionalNonNegativeInteger(value.last_observed_at ?? value.lastObservedAt),
    created_at: optionalNonNegativeInteger(value.created_at ?? value.createdAt),
    started_at: optionalNonNegativeInteger(value.started_at ?? value.startedAt),
    finished_at: optionalNonNegativeInteger(value.finished_at ?? value.finishedAt),
    updated_at: optionalNonNegativeInteger(value.updated_at ?? value.updatedAt),
  });
}
