import { ERROR_REASON_POLICY, normalizeError } from '../errors/index.js';
import { receiptPayload, redactToolValue } from './redact.js';

function defaultId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function reasonForError(error) {
  const status = Number(error?.status || error?.http_status || 0);
  if (status === 401) return 'provider_credential_invalid';
  if (status === 403) return 'provider_scope_insufficient';
  if (status === 409) return 'conflict';
  if (status === 429) return 'provider_rate_limited';
  if (status === 408 || status === 504) return 'transport_timeout';
  if (status >= 500) return 'provider_unavailable';
  if (status === 400 || status === 422) return 'provider_request_invalid';
  if (error?.code === 'completeful_idempotency_required') return 'input_invalid';
  if (error instanceof TypeError) return 'input_invalid';
  return 'execution_failed';
}

function normalizeToolError(error, definition) {
  const reason = reasonForError(error);
  const policy = ERROR_REASON_POLICY[reason] || ERROR_REASON_POLICY.execution_failed;
  return normalizeError(error, {
    code: policy.code,
    reason,
    source: definition.provider
      ? { kind: 'provider', name: definition.provider, service: definition.provider }
      : { kind: 'runtime', name: 'agentsam-tool-runtime' },
    domain: 'tool',
    tool: definition.toolKey,
    provider: definition.provider || null,
    provider_code: error?.code || null,
    request_id: error?.requestId || null,
    details: {
      path: error?.path || null,
      remediation: error?.remediation || null,
    },
  });
}

function invocationFromRequest(definition, request, makeId, now) {
  const id = String(request.id || makeId('inv'));
  const requestedAt = Number(request.requestedAt || now());
  const explicitIdempotencyKey = String(request.idempotencyKey || '').trim();
  const idempotencyKey =
    explicitIdempotencyKey ||
    (definition.idempotencyMode === 'required' ? id : undefined);

  return {
    id,
    toolKey: definition.toolKey,
    input: request.input ?? {},
    requestedAt,
    accountId: request.accountId,
    correlationId: request.correlationId,
    causationId: request.causationId,
    idempotencyKey,
    metadata: request.metadata,
  };
}

async function resolveExecutionTarget(registry, definition) {
  const handler = definition.handler?.ref ? registry.getHandler(definition.handler.ref) : null;
  if (handler) {
    return async (invocation, context) => handler(invocation, context, definition);
  }

  if (definition.provider) {
    const adapter = registry.getAdapter(definition.provider);
    if (!adapter) throw new Error(`provider adapter not registered: ${definition.provider}`);
    return (invocation, context) => adapter.invoke(invocation, context);
  }

  throw new Error(`tool has no registered execution target: ${definition.toolKey}`);
}

async function observe(callback, value, label) {
  if (typeof callback !== 'function') return null;
  try {
    await callback(value);
    return null;
  } catch (error) {
    return {
      observer: label,
      message: String(error?.message || error),
    };
  }
}

export function createToolExecutor({
  registry,
  resolveAuthority,
  recordReceipt,
  onEvent,
  now = () => Date.now(),
  makeId = defaultId,
} = {}) {
  if (!registry?.getTool) throw new TypeError('tool executor requires a registry');

  async function execute(request = {}) {
    const definition = registry.getTool(request.toolKey);
    if (!definition) throw new Error(`tool not registered: ${request.toolKey || '<missing>'}`);
    if (definition.active === false) throw new Error(`tool is inactive: ${definition.toolKey}`);

    const invocation = invocationFromRequest(definition, request, makeId, now);
    const startedAt = now();
    const safeInput = receiptPayload(invocation.input, {
      mode: definition.receiptMode || 'full',
      sensitivePaths: definition.sensitiveInputPaths || [],
    });

    let authority;
    if (typeof resolveAuthority === 'function' && definition.authority?.length) {
      authority = await resolveAuthority(definition.authority, { definition, invocation });
    }

    const context = {
      authority,
      accountId: invocation.accountId,
      deadlineAt: definition.timeoutMs ? startedAt + definition.timeoutMs : undefined,
      metadata: {
        toolKey: definition.toolKey,
        capabilityKey: definition.capabilityKey,
        riskLevel: definition.riskLevel,
        sideEffectLevel: definition.sideEffectLevel,
      },
    };

    let invoke;
    try {
      invoke = await resolveExecutionTarget(registry, definition);
    } catch (error) {
      const normalized = normalizeToolError(error, definition);
      const completedAt = now();
      const receipt = {
        invocationId: invocation.id,
        toolKey: definition.toolKey,
        status: 'failed',
        ok: false,
        attempt: 1,
        startedAt,
        completedAt,
        durationMs: Math.max(0, completedAt - startedAt),
        provider: definition.provider,
        input: safeInput,
        error: normalized,
      };
      const observerErrors = [];
      const receiptObserverError = await observe(recordReceipt, receipt, 'recordReceipt');
      if (receiptObserverError) observerErrors.push(receiptObserverError);
      return { ok: false, definition, invocation, error: normalized, receipt, events: [], observerErrors };
    }

    try {
      const result = (await invoke(invocation, context)) || {};
      const completedAt = now();
      const mode = definition.receiptMode || 'full';
      const safeOutput = receiptPayload(result.output, {
        mode,
        sensitivePaths: definition.sensitiveOutputPaths || [],
      });
      const safeMetadata = redactToolValue(result.metadata || {});

      const events = (definition.emitsEvents || []).map((eventKey) => ({
        id: makeId('evt'),
        eventKey,
        occurredAt: completedAt,
        source: {
          kind: 'tool',
          provider: definition.provider || undefined,
          ref: invocation.id,
          metadata: {
            tool_key: definition.toolKey,
            capability_key: definition.capabilityKey,
          },
        },
        payload: {
          tool_key: definition.toolKey,
          output: safeOutput,
          provider_request_id: result.providerRequestId || null,
        },
        accountId: invocation.accountId,
        correlationId: invocation.correlationId,
        causationId: invocation.id,
      }));

      const receipt = {
        invocationId: invocation.id,
        toolKey: definition.toolKey,
        status: 'completed',
        ok: true,
        attempt: 1,
        startedAt,
        completedAt,
        durationMs: Math.max(0, completedAt - startedAt),
        provider: definition.provider,
        input: safeInput,
        output: safeOutput,
        emittedEventIds: events.map((event) => event.id),
        providerRequestId: result.providerRequestId,
        usage: redactToolValue(result.usage || {}),
        metadata: safeMetadata,
      };

      const observerErrors = [];
      const receiptObserverError = await observe(recordReceipt, receipt, 'recordReceipt');
      if (receiptObserverError) observerErrors.push(receiptObserverError);
      for (const event of events) {
        const eventObserverError = await observe(onEvent, event, 'onEvent');
        if (eventObserverError) observerErrors.push(eventObserverError);
      }

      return {
        ok: true,
        definition,
        invocation,
        output: result.output,
        receipt,
        events,
        observerErrors,
      };
    } catch (error) {
      const completedAt = now();
      const normalized = normalizeToolError(error, definition);
      const receipt = {
        invocationId: invocation.id,
        toolKey: definition.toolKey,
        status: 'failed',
        ok: false,
        attempt: 1,
        startedAt,
        completedAt,
        durationMs: Math.max(0, completedAt - startedAt),
        provider: definition.provider,
        input: safeInput,
        error: normalized,
      };
      const observerErrors = [];
      const receiptObserverError = await observe(recordReceipt, receipt, 'recordReceipt');
      if (receiptObserverError) observerErrors.push(receiptObserverError);

      return {
        ok: false,
        definition,
        invocation,
        error: normalized,
        receipt,
        events: [],
        observerErrors,
      };
    }
  }

  return Object.freeze({ execute });
}
