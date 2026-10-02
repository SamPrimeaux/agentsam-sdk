import {
  HOOK_RECEIPT_SCHEMA,
  createHookEnvelope,
  normalizeHookDefinition,
  normalizeHookEvent,
  normalizeHookOutput,
} from './contracts.js';
import {
  generatedErrorPolicy,
  normalizeGeneratedErrorReason,
} from './errors-generated.js';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

const SKIPPED_MATCH = Symbol('agentsam_hook_skipped_match');

function nowMs(clock) {
  const value = Number(clock());
  if (!Number.isFinite(value) || value < 0) throw new TypeError('hook_clock_must_return_non_negative_number');
  return value;
}

function errorMessage(error) {
  return String(error?.message || error || 'unknown_hook_error')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|password|secret|token)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .slice(0, 512);
}

function fingerprint(fields) {
  const text = fields.map((value) => String(value || '').trim()).join('\u001f');
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `err_${hash.toString(16).padStart(16, '0')}`;
}

function adapterFacts(reason, definition, error) {
  const inferred = ['http', 'mcp', 'lsp', 'command'].find((name) => reason.startsWith(`hook_${name}_`)) || null;
  const adapter = String(error?.adapter || definition.metadata?.adapter_type || inferred || '').trim() || null;
  const protocol = String(error?.protocol || (adapter === 'command' ? 'agentsam.hook.v1' : adapter || '')).trim() || null;
  const transport = String(error?.transport || (adapter === 'command' ? 'process' : '')).trim() || null;
  return { adapter, protocol, transport };
}

function failureBehavior(definition) {
  if (definition.failure_mode === 'closed') return 'fail_closed';
  if (definition.failure_mode === 'open') return 'fail_open';
  if (['post_tool_use', 'post_model_use'].includes(definition.hook)) return 'no_replay';
  return 'abort';
}

function sideEffectState(hook) {
  if (['post_tool_use', 'post_model_use'].includes(hook)) return 'confirmed_applied';
  if (hook === 'post_tool_use_failure') return 'unknown';
  return 'not_started';
}

function canonicalHookFailure(definition, error) {
  let reason = normalizeGeneratedErrorReason(error?.reason, error?.message, error?.code);
  if (/^(mcp|lsp)_/.test(reason)) {
    const hookSpecific = normalizeGeneratedErrorReason(`hook_${reason}`);
    if (hookSpecific !== 'hook_handler_failed') reason = hookSpecific;
  }
  const policy = generatedErrorPolicy(reason);
  const behavior = failureBehavior(definition);
  const sideEffect = sideEffectState(definition.hook);
  const facts = adapterFacts(reason, definition, error);
  const message = errorMessage(error);
  const feature = `hooks.${definition.hook}`;
  const canonical = {
    error_code: policy.code,
    reason,
    domain: policy.domain,
    failure_class: policy.failure_class,
    stage: policy.default_stage,
    feature,
    failure_behavior: behavior,
    retryable: sideEffect === 'confirmed_applied' || behavior === 'fail_closed' ? false : policy.retryable,
    side_effect_state: sideEffect,
    adapter: facts.adapter,
    protocol: facts.protocol,
    transport: facts.transport,
    fingerprint: fingerprint([policy.code, reason, policy.domain, policy.failure_class, policy.default_stage, feature, behavior, sideEffect, facts.adapter, facts.protocol, facts.transport, definition.id]),
    message,
  };
  return Object.freeze({
    error: Object.freeze(canonical),
    native_evidence: Object.freeze({
      code: error?.code ? String(error.code).slice(0, 128) : null,
      exception_type: error?.name ? String(error.name).slice(0, 128) : null,
      message,
    }),
  });
}

function withTimeout(promise, timeoutMs, hookId) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`hook_timeout:${hookId}:${timeoutMs}`);
      error.code = 'AGENTSAM_HOOK_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function receiptFor({ definition, envelope, startedAt, completedAt, status, output, error }) {
  const failure = error ? canonicalHookFailure(definition, error) : null;
  return Object.freeze({
    schema: HOOK_RECEIPT_SCHEMA,
    hook_id: definition.id,
    hook: definition.hook,
    invocation: envelope.invocation,
    status,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: Math.max(0, completedAt - startedAt),
    input_keys: Object.freeze(Object.keys(envelope.input).sort()),
    output_keys: Object.freeze(Object.keys(output || {}).sort()),
    ...(failure || {}),
  });
}

function updateWorkingInput(hook, input, output) {
  const next = clone(input);
  if (output.modified_args !== undefined) next.tool_args = clone(output.modified_args);
  if (output.modified_request !== undefined) next.request = clone(output.modified_request);
  if (output.modified_result !== undefined) {
    if (hook === 'post_tool_use') next.tool_result = clone(output.modified_result);
    else next.model_result = clone(output.modified_result);
  }
  if (output.modified_prompt !== undefined) next.prompt = output.modified_prompt;
  if (output.modified_transformed_prompt !== undefined) next.transformed_prompt = output.modified_transformed_prompt;
  if (output.modified_config !== undefined) next.config = {
    ...(next.config && typeof next.config === 'object' && !Array.isArray(next.config) ? next.config : {}),
    ...clone(output.modified_config),
  };
  return next;
}

function mergeOutput(current, output) {
  const next = { ...current };
  for (const [key, value] of Object.entries(output)) {
    if (key === 'additional_context') continue;
    if (key === 'suppress_output') next.suppress_output = next.suppress_output === true || value === true;
    else if (key === 'retry_count') next.retry_count = Math.max(Number(next.retry_count || 0), Number(value || 0));
    else if (key === 'cleanup_actions') next.cleanup_actions = [...(next.cleanup_actions || []), ...value];
    else if (key === 'modified_config') next.modified_config = { ...(next.modified_config || {}), ...clone(value) };
    else next[key] = clone(value);
  }
  return next;
}

function isTerminalDecision(hook, output) {
  if (['pre_tool_use', 'pre_model_use'].includes(hook)) {
    return output.permission_decision === 'deny' || output.permission_decision === 'ask';
  }
  return hook === 'agent_stop' && output.decision === 'block';
}

export class HookExecutionError extends Error {
  constructor(definition, cause) {
    super(`hook_execution_failed:${definition.id}:${errorMessage(cause)}`, { cause });
    this.name = 'HookExecutionError';
    this.code = 'AGENTSAM_HOOK_EXECUTION_FAILED';
    this.reason = normalizeGeneratedErrorReason(cause?.reason, cause?.message, cause?.code);
    this.error_code = generatedErrorPolicy(this.reason).code;
    this.hook = definition.hook;
    this.hook_id = definition.id;
  }
}

export function isHookRuntime(value) {
  return Boolean(value && typeof value.dispatch === 'function' && typeof value.register === 'function');
}

export function createHookRuntime(options = {}) {
  const clock = typeof options.clock === 'function' ? options.clock : Date.now;
  const onReceipt = options.onReceipt;
  const registry = new Map();
  let sequence = 0;

  function register(event, definition) {
    const hook = normalizeHookEvent(event);
    const normalized = normalizeHookDefinition(hook, definition, sequence++);
    const current = registry.get(hook) || [];
    if (current.some((row) => row.id === normalized.id)) throw new Error(`duplicate_hook_id:${normalized.id}`);
    current.push(normalized);
    current.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    registry.set(hook, current);
    return runtime;
  }

  function unregister(event, id) {
    const hook = normalizeHookEvent(event);
    const before = registry.get(hook) || [];
    const after = before.filter((row) => row.id !== String(id));
    registry.set(hook, after);
    return after.length !== before.length;
  }

  function list(event) {
    if (event == null) return Object.freeze([...registry.values()].flat().map((row) => Object.freeze({ ...row, handler: undefined, matches: undefined })));
    const hook = normalizeHookEvent(event);
    return Object.freeze((registry.get(hook) || []).map((row) => Object.freeze({ ...row, handler: undefined, matches: undefined })));
  }

  async function dispatch(event, input = {}, invocation = {}, dispatchOptions = {}) {
    const hook = normalizeHookEvent(event);
    let workingInput = clone(input);
    let combinedOutput = {};
    const contexts = [];
    const receipts = [];
    const errors = [];

    for (const definition of registry.get(hook) || []) {
      if (!definition.enabled) continue;
      const envelope = createHookEnvelope(hook, workingInput, invocation, {
        timestamp: nowMs(clock),
        cwd: dispatchOptions.cwd,
      });
      const startedAt = nowMs(clock);
      let output;
      let receipt;
      try {
        const raw = await withTimeout(Promise.resolve().then(async () => {
          if (definition.matches && !await definition.matches(envelope)) return SKIPPED_MATCH;
          return definition.handler(envelope);
        }), definition.timeout_ms, definition.id);
        if (raw === SKIPPED_MATCH) continue;
        output = normalizeHookOutput(hook, raw);
        workingInput = updateWorkingInput(hook, workingInput, output);
        combinedOutput = mergeOutput(combinedOutput, output);
        if (output.additional_context) contexts.push(output.additional_context);
        const completedAt = nowMs(clock);
        receipt = receiptFor({ definition, envelope, startedAt, completedAt, status: 'completed', output });
      } catch (error) {
        const completedAt = nowMs(clock);
        receipt = receiptFor({ definition, envelope, startedAt, completedAt, status: 'failed', error });
        errors.push(Object.freeze({ hook_id: definition.id, hook, ...receipt.error, native_evidence: receipt.native_evidence }));
        receipts.push(receipt);
        if (typeof onReceipt === 'function') {
          try { await onReceipt(receipt); } catch { /* Observer failures never replace hook policy. */ }
        }
        if (definition.failure_mode === 'error') throw new HookExecutionError(definition, error);
        if (definition.failure_mode === 'closed') {
          combinedOutput = mergeOutput(combinedOutput, {
            permission_decision: 'deny',
            permission_decision_reason: `Hook '${definition.id}' failed closed: ${errorMessage(error)}`,
          });
          break;
        }
        continue;
      }

      receipts.push(receipt);
      if (typeof onReceipt === 'function') {
        try { await onReceipt(receipt); } catch { /* Receipts are observable without becoming execution authority. */ }
      }
      if (isTerminalDecision(hook, output)) break;
    }

    if (contexts.length) combinedOutput.additional_context = contexts.join('\n\n');
    return Object.freeze({
      schema: 'agentsam.hook.dispatch.v1',
      hook,
      input: Object.freeze(workingInput),
      output: Object.freeze(combinedOutput),
      receipts: Object.freeze(receipts),
      errors: Object.freeze(errors),
    });
  }

  const runtime = Object.freeze({ register, unregister, list, dispatch });
  for (const [event, definitions] of Object.entries(options.hooks || {})) {
    for (const definition of Array.isArray(definitions) ? definitions : [definitions]) register(event, definition);
  }
  return runtime;
}

export class AgentSamHooks {
  #runtime;

  constructor(options = {}) {
    this.#runtime = createHookRuntime(options);
  }

  register(event, definition) {
    this.#runtime.register(event, definition);
    return this;
  }

  unregister(event, id) { return this.#runtime.unregister(event, id); }
  list(event) { return this.#runtime.list(event); }
  dispatch(event, input = {}, invocation = {}, options = {}) {
    return this.#runtime.dispatch(event, input, invocation, options);
  }
}

export function ensureHookRuntime(value, options = {}) {
  if (!value) return createHookRuntime(options);
  if (isHookRuntime(value)) return value;
  if (value.hooks && typeof value === 'object') return createHookRuntime({ ...options, ...value });
  if (typeof value === 'object') return createHookRuntime({ ...options, hooks: value });
  throw new TypeError('invalid_hook_runtime');
}
