import { ensureHookRuntime } from '../runtime.js';
import { resolveHookPermission } from '../policy.js';

const HOOKED_PROVIDER_ADAPTER = Symbol.for('agentsam.hooks.provider-adapter');
const PROTECTED_REQUEST_KEYS = new Set(['emit', 'provider', 'hookRuntime', 'hooks']);

function portable(value) {
  if (value == null) return value;
  try { return structuredClone(value); }
  catch {
    if (Array.isArray(value)) return value.map(portable);
    if (typeof value === 'object') {
      return Object.fromEntries(Object.entries(value)
        .filter(([, row]) => typeof row !== 'function')
        .map(([key, row]) => [key, portable(row)]));
    }
    return String(value);
  }
}

function requestForHook(params) {
  return Object.fromEntries(Object.entries(params || {})
    .filter(([key, value]) => !PROTECTED_REQUEST_KEYS.has(key) && typeof value !== 'function')
    .map(([key, value]) => [key, portable(value)]));
}

function serializedError(error) {
  return Object.freeze({
    name: error?.name || 'Error',
    code: error?.code || null,
    message: String(error?.message || error),
    status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
    provider: error?.provider || null,
  });
}

export function createHookedProviderAdapter(baseProvider, options = {}) {
  if (!baseProvider?.create || !baseProvider?.continueWithToolOutputs) throw new TypeError('base_provider_adapter_required');
  if (baseProvider[HOOKED_PROVIDER_ADAPTER]) return baseProvider;
  const hooks = ensureHookRuntime(options.hooks || options.hookRuntime);
  const invocation = options.invocation || {};
  const maxRetries = Number.isInteger(options.maxRetries) ? Math.max(0, Math.min(options.maxRetries, 10)) : 3;

  async function execute(operation, params = {}) {
    const providerName = String(baseProvider.provider || params.modelRecord?.provider || 'provider');
    const originalRequest = requestForHook(params);
    const pre = await hooks.dispatch('pre_model_use', {
      operation,
      provider: providerName,
      model: params.model || params.modelRecord?.provider_model_id || null,
      request: originalRequest,
    }, invocation, { cwd: options.cwd });
    await resolveHookPermission({
      output: pre.output,
      kind: 'model',
      name: `${providerName}:${operation}`,
      requestPermission: options.requestPermission,
      envelope: pre,
    });
    const modified = pre.input.request || originalRequest;
    const request = { ...params, ...modified };
    for (const key of PROTECTED_REQUEST_KEYS) if (params[key] !== undefined) request[key] = params[key];
    if (pre.output.additional_context) {
      request.instructions = [request.instructions, pre.output.additional_context].filter(Boolean).join('\n\n');
    }
    let retriesRemaining = maxRetries;

    let result;
    while (true) {
      try {
        result = await baseProvider[operation](request);
        break;
      } catch (error) {
        const occurred = await hooks.dispatch('error_occurred', {
          error: String(error?.message || error),
          error_detail: serializedError(error),
          error_context: 'model_call',
          recoverable: error?.recoverable !== false,
          provider: providerName,
          operation,
        }, invocation, { cwd: options.cwd });
        if (occurred.output.error_handling === 'retry' && retriesRemaining > 0 && Number(occurred.output.retry_count || 1) > 0) {
          retriesRemaining -= 1;
          continue;
        }
        if (occurred.output.error_handling === 'skip') {
          return Object.freeze({
            provider: providerName,
            model: request.model || request.modelRecord?.provider_model_id || null,
            response_id: null,
            output_text: '',
            tool_calls: Object.freeze([]),
            provider_state: request.providerState || null,
            skipped_by_hook: true,
            error: serializedError(error),
          });
        }
        if (occurred.output.additional_context) error.hook_context = occurred.output.additional_context;
        if (occurred.output.user_notification) error.user_notification = occurred.output.user_notification;
        if (occurred.output.suppress_output === true) error.suppress_output = true;
        throw error;
      }
    }

    // A completed provider request can have cost or durable continuation state.
    // Post-hook failures must not accidentally replay it through retry policy.
    const post = await hooks.dispatch('post_model_use', {
      operation,
      provider: providerName,
      model: request.model || request.modelRecord?.provider_model_id || null,
      model_result: portable(result),
    }, invocation, { cwd: options.cwd });
    const finalResult = post.input.model_result;
    if (post.output.suppress_output === true && finalResult && typeof finalResult === 'object') {
      return Object.freeze({ ...finalResult, output_text: '', suppressed_by_hook: true });
    }
    return finalResult;
  }

  const adapter = {
    ...baseProvider,
    [HOOKED_PROVIDER_ADAPTER]: true,
    provider: baseProvider.provider,
    create: (params) => execute('create', params),
    continueWithToolOutputs: (params) => execute('continueWithToolOutputs', params),
    ...(typeof baseProvider.compact === 'function' ? { compact: (params) => execute('compact', params) } : {}),
  };
  return Object.freeze(adapter);
}
