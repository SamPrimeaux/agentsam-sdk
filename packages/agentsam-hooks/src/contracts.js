export const HOOK_PROTOCOL_SCHEMA = 'agentsam.hook.v1';
export const HOOK_CONFIG_SCHEMA = 'agentsam.hooks.config.v1';
export const HOOK_RECEIPT_SCHEMA = 'agentsam.hook.receipt.v1';

export const HOOK_EVENTS = Object.freeze([
  'session_start',
  'session_end',
  'user_prompt_submitted',
  'user_prompt_transformed',
  'pre_model_use',
  'post_model_use',
  'pre_tool_use',
  'post_tool_use',
  'post_tool_use_failure',
  'error_occurred',
  'agent_stop',
  'subagent_start',
  'subagent_stop',
]);

export const PERMISSION_DECISIONS = Object.freeze(['allow', 'deny', 'ask']);
export const ERROR_HANDLING_DECISIONS = Object.freeze(['retry', 'skip', 'abort']);
export const STOP_DECISIONS = Object.freeze(['allow', 'block']);
export const HOOK_FAILURE_MODES = Object.freeze(['open', 'closed', 'error']);

const EVENT_SET = new Set(HOOK_EVENTS);
const PERMISSION_SET = new Set(PERMISSION_DECISIONS);
const ERROR_HANDLING_SET = new Set(ERROR_HANDLING_DECISIONS);
const STOP_SET = new Set(STOP_DECISIONS);
const FAILURE_MODE_SET = new Set(HOOK_FAILURE_MODES);

const EVENT_ALIASES = Object.freeze(Object.fromEntries(HOOK_EVENTS.flatMap((event) => {
  const camel = event.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  const pascal = camel[0].toUpperCase() + camel.slice(1);
  return [[event, event], [camel, event], [`on${pascal}`, event]];
})));

const OUTPUT_ALIASES = Object.freeze({
  permissionDecision: 'permission_decision',
  permissionDecisionReason: 'permission_decision_reason',
  modifiedArgs: 'modified_args',
  modifiedResult: 'modified_result',
  modifiedRequest: 'modified_request',
  modifiedPrompt: 'modified_prompt',
  modifiedTransformedPrompt: 'modified_transformed_prompt',
  modifiedConfig: 'modified_config',
  additionalContext: 'additional_context',
  suppressOutput: 'suppress_output',
  errorHandling: 'error_handling',
  retryCount: 'retry_count',
  userNotification: 'user_notification',
  cleanupActions: 'cleanup_actions',
  sessionSummary: 'session_summary',
});
const OUTPUT_FIELDS = new Set([
  'permission_decision', 'permission_decision_reason', 'modified_args', 'modified_result',
  'modified_request', 'modified_prompt', 'modified_transformed_prompt', 'modified_config', 'additional_context',
  'suppress_output', 'error_handling', 'retry_count', 'user_notification', 'decision',
  'reason', 'cleanup_actions', 'session_summary', 'metadata',
]);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function matchValue(expected, actual) {
  if (expected == null || typeof expected !== 'object') return Object.is(expected, actual);
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item) => actual.some((candidate) => matchValue(item, candidate)));
  }
  if ('$exists' in expected) return Boolean(expected.$exists) === (actual !== undefined && actual !== null);
  if ('$eq' in expected) return matchValue(expected.$eq, actual);
  if ('$in' in expected) {
    if (!Array.isArray(expected.$in)) throw new TypeError('hook_match_$in_must_be_array');
    return expected.$in.some((candidate) => matchValue(candidate, actual));
  }
  if ('$contains' in expected) {
    if (typeof actual === 'string') return actual.includes(String(expected.$contains));
    if (Array.isArray(actual)) return actual.some((candidate) => matchValue(expected.$contains, candidate));
    return false;
  }
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
  const entries = Object.entries(expected);
  const unsupported = entries.find(([key]) => key.startsWith('$'));
  if (unsupported) throw new Error(`unsupported_hook_match_operator:${unsupported[0]}`);
  return entries.every(([key, value]) => matchValue(value, actual[key]));
}

/** Portable partial JSON matcher shared by config and stored hooks. */
export function matchesHookInput(match = {}, input = {}) {
  if (!isObject(match)) throw new TypeError('hook_match_must_be_object');
  return matchValue(match, input);
}

function asOptionalString(value, field = 'value') {
  if (value == null) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${field}_must_be_string`);
  const normalized = value.trim();
  return normalized || undefined;
}

export function normalizeHookEvent(value) {
  const source = clean(value);
  const normalized = EVENT_ALIASES[source] || EVENT_ALIASES[source.replace(/^on_/, '')];
  if (!normalized || !EVENT_SET.has(normalized)) throw new RangeError(`unsupported_hook_event:${source || '<missing>'}`);
  return normalized;
}

export function normalizeHookFailureMode(value, hook) {
  const fallback = hook === 'pre_tool_use' || hook === 'pre_model_use' ? 'closed' : 'open';
  const normalized = clean(value || fallback).toLowerCase();
  if (!FAILURE_MODE_SET.has(normalized)) throw new RangeError(`invalid_hook_failure_mode:${normalized}`);
  return normalized;
}

export function createHookInvocation(value = {}) {
  if (!isObject(value)) throw new TypeError('hook_invocation_must_be_object');
  const output = {};
  const stringFields = ['session_id', 'run_id', 'turn_id', 'message_id', 'agent_id', 'parent_agent_id', 'source'];
  for (const [key, raw] of Object.entries(value)) {
    if (!stringFields.includes(key) && key !== 'metadata') throw new Error(`unsupported_hook_invocation_field:${key}`);
    if (raw == null) continue;
    if (stringFields.includes(key)) {
      if (typeof raw !== 'string') throw new TypeError(`${key}_must_be_string`);
      const normalized = raw.trim();
      if (normalized) output[key] = normalized;
    } else {
      if (!isObject(raw)) throw new TypeError('hook_invocation_metadata_must_be_object');
      output.metadata = clone(raw);
    }
  }
  return Object.freeze(output);
}

export function createHookEnvelope(event, input = {}, invocation = {}, options = {}) {
  const hook = normalizeHookEvent(event);
  if (!isObject(input)) throw new TypeError('hook_input_must_be_object');
  const timestamp = Number(options.timestamp ?? Date.now());
  if (!Number.isFinite(timestamp) || timestamp < 0) throw new TypeError('hook_timestamp_must_be_non_negative_number');
  return Object.freeze({
    schema: HOOK_PROTOCOL_SCHEMA,
    hook,
    timestamp,
    cwd: clean(options.cwd || input.cwd || (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '')),
    invocation: createHookInvocation(invocation),
    input: Object.freeze(clone(input)),
  });
}

function withAliases(value) {
  const source = isObject(value) ? value : {};
  const output = {};
  for (const [key, raw] of Object.entries(source)) {
    const normalized = OUTPUT_ALIASES[key] || key;
    if (!OUTPUT_FIELDS.has(normalized)) throw new Error(`unsupported_hook_output_field:${key}`);
    output[normalized] = raw;
  }
  return output;
}

export function normalizeHookOutput(event, value) {
  const hook = normalizeHookEvent(event);
  if (value == null) return Object.freeze({});
  if (!isObject(value)) throw new TypeError(`hook_output_must_be_object:${hook}`);
  const source = withAliases(value);
  const output = {};

  const permission = asOptionalString(source.permission_decision, 'permission_decision')?.toLowerCase();
  if (permission) {
    if (!['pre_tool_use', 'pre_model_use'].includes(hook)) throw new Error(`permission_decision_not_supported:${hook}`);
    if (!PERMISSION_SET.has(permission)) throw new RangeError(`invalid_permission_decision:${permission}`);
    output.permission_decision = permission;
  }
  const permissionReason = asOptionalString(source.permission_decision_reason, 'permission_decision_reason');
  if (permissionReason) output.permission_decision_reason = permissionReason;

  if (source.modified_args !== undefined) {
    if (hook !== 'pre_tool_use') throw new Error(`modified_args_not_supported:${hook}`);
    if (!isObject(source.modified_args)) throw new TypeError('modified_args_must_be_object');
    output.modified_args = clone(source.modified_args);
  }
  if (source.modified_request !== undefined) {
    if (hook !== 'pre_model_use') throw new Error(`modified_request_not_supported:${hook}`);
    if (!isObject(source.modified_request)) throw new TypeError('modified_request_must_be_object');
    output.modified_request = clone(source.modified_request);
  }
  if (source.modified_result !== undefined) {
    if (!['post_tool_use', 'post_model_use'].includes(hook)) throw new Error(`modified_result_not_supported:${hook}`);
    output.modified_result = clone(source.modified_result);
  }
  if (source.modified_prompt !== undefined) {
    if (hook !== 'user_prompt_submitted') throw new Error(`modified_prompt_not_supported:${hook}`);
    if (typeof source.modified_prompt !== 'string') throw new TypeError('modified_prompt_must_be_string');
    output.modified_prompt = source.modified_prompt;
  }
  if (source.modified_transformed_prompt !== undefined) {
    if (hook !== 'user_prompt_transformed') throw new Error(`modified_transformed_prompt_not_supported:${hook}`);
    if (typeof source.modified_transformed_prompt !== 'string') throw new TypeError('modified_transformed_prompt_must_be_string');
    output.modified_transformed_prompt = source.modified_transformed_prompt;
  }
  if (source.modified_config !== undefined) {
    if (hook !== 'session_start') throw new Error(`modified_config_not_supported:${hook}`);
    if (!isObject(source.modified_config)) throw new TypeError('modified_config_must_be_object');
    output.modified_config = clone(source.modified_config);
  }

  const context = asOptionalString(source.additional_context, 'additional_context');
  if (context) output.additional_context = context;
  if (source.suppress_output !== undefined) {
    if (typeof source.suppress_output !== 'boolean') throw new TypeError('suppress_output_must_be_boolean');
    output.suppress_output = source.suppress_output;
  }

  const handling = asOptionalString(source.error_handling, 'error_handling')?.toLowerCase();
  if (handling) {
    if (hook !== 'error_occurred') throw new Error(`error_handling_not_supported:${hook}`);
    if (!ERROR_HANDLING_SET.has(handling)) throw new RangeError(`invalid_error_handling:${handling}`);
    output.error_handling = handling;
  }
  if (source.retry_count !== undefined) {
    const count = Number(source.retry_count);
    if (!Number.isInteger(count) || count < 0 || count > 10) throw new TypeError('retry_count_must_be_integer_between_0_and_10');
    output.retry_count = count;
  }
  const notification = asOptionalString(source.user_notification, 'user_notification');
  if (notification) output.user_notification = notification;

  const decision = asOptionalString(source.decision, 'decision')?.toLowerCase();
  if (decision) {
    if (hook !== 'agent_stop') throw new Error(`stop_decision_not_supported:${hook}`);
    if (!STOP_SET.has(decision)) throw new RangeError(`invalid_stop_decision:${decision}`);
    output.decision = decision;
  }
  const reason = asOptionalString(source.reason, 'reason');
  if (reason) output.reason = reason;

  if (source.cleanup_actions !== undefined) {
    if (hook !== 'session_end' || !Array.isArray(source.cleanup_actions) || source.cleanup_actions.some((row) => typeof row !== 'string')) {
      throw new TypeError('cleanup_actions_must_be_session_end_string_array');
    }
    output.cleanup_actions = [...source.cleanup_actions];
  }
  const summary = asOptionalString(source.session_summary, 'session_summary');
  if (summary) output.session_summary = summary;
  if (source.metadata !== undefined) {
    if (!isObject(source.metadata)) throw new TypeError('metadata_must_be_object');
    output.metadata = clone(source.metadata);
  }

  return Object.freeze(output);
}

export function normalizeHookDefinition(event, value, index = 0) {
  const hook = normalizeHookEvent(event);
  const source = typeof value === 'function' ? { handler: value } : value;
  if (!isObject(source)) throw new TypeError(`hook_definition_must_be_object:${hook}`);
  if (typeof source.handler !== 'function') throw new TypeError(`hook_handler_required:${hook}`);
  if (source.matches != null && typeof source.matches !== 'function') throw new TypeError(`hook_matches_must_be_function:${hook}`);
  const id = clean(source.id || `${hook}:${index + 1}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new Error(`invalid_hook_id:${id}`);
  const timeoutMs = Number(source.timeout_ms ?? source.timeoutMs ?? 10_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new RangeError(`invalid_hook_timeout_ms:${timeoutMs}`);
  const priority = Number(source.priority ?? 100);
  if (!Number.isFinite(priority)) throw new TypeError(`invalid_hook_priority:${priority}`);
  return Object.freeze({
    id,
    hook,
    handler: source.handler,
    matches: source.matches,
    priority,
    timeout_ms: timeoutMs,
    failure_mode: normalizeHookFailureMode(source.failure_mode ?? source.failureMode, hook),
    enabled: source.enabled !== false,
    metadata: Object.freeze(isObject(source.metadata) ? clone(source.metadata) : {}),
  });
}
