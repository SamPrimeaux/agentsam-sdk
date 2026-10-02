import { ensureHookRuntime } from '../runtime.js';
import { resolveHookPermission } from '../policy.js';

const HOOKED_CAPABILITY_ADAPTER = Symbol.for('agentsam.hooks.capability-adapter');

function serializedError(error) {
  return Object.freeze({
    name: error?.name || 'Error',
    code: error?.code || null,
    message: String(error?.message || error),
    status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
  });
}

export function createHookedCapabilityAdapter(baseAdapter, options = {}) {
  if (!baseAdapter?.toolDescriptors || !baseAdapter?.invoke) throw new TypeError('base_capability_adapter_required');
  if (baseAdapter[HOOKED_CAPABILITY_ADAPTER]) return baseAdapter;
  const hooks = ensureHookRuntime(options.hooks || options.hookRuntime);
  const invocation = options.invocation || {};
  const cwd = options.cwd;
  const maxRetries = Number.isInteger(options.maxRetries) ? Math.max(0, Math.min(options.maxRetries, 10)) : 3;

  const adapter = {
    ...baseAdapter,
    [HOOKED_CAPABILITY_ADAPTER]: true,
    toolDescriptors(descriptorOptions = {}) { return baseAdapter.toolDescriptors(descriptorOptions); },
    canInvoke(id) { return typeof baseAdapter.canInvoke === 'function' ? baseAdapter.canInvoke(id) : true; },
    describe(id) { return typeof baseAdapter.describe === 'function' ? baseAdapter.describe(id) : undefined; },
    list(listOptions = {}) { return typeof baseAdapter.list === 'function' ? baseAdapter.list(listOptions) : this.toolDescriptors(listOptions); },
    async invoke(id, input = {}, context = {}) {
      const toolName = String(id);
      const pre = await hooks.dispatch('pre_tool_use', {
        tool_name: toolName,
        tool_args: input,
        cwd: cwd || context.cwd,
      }, invocation, { cwd: cwd || context.cwd });
      await resolveHookPermission({
        output: pre.output,
        kind: 'tool',
        name: toolName,
        requestPermission: options.requestPermission,
        envelope: pre,
      });
      const args = pre.input.tool_args;
      const hookContext = pre.output.additional_context;
      let retriesRemaining = maxRetries;

      let value;
      while (true) {
        try {
          value = await baseAdapter.invoke(toolName, args, {
            ...context,
            ...(hookContext ? { hook_context: hookContext } : {}),
          });
          break;
        } catch (error) {
          const failed = await hooks.dispatch('post_tool_use_failure', {
            tool_name: toolName,
            tool_args: args,
            error: serializedError(error),
            cwd: cwd || context.cwd,
          }, invocation, { cwd: cwd || context.cwd });
          if (failed.output.additional_context) error.hook_context = failed.output.additional_context;
          const occurred = await hooks.dispatch('error_occurred', {
            error: String(error?.message || error),
            error_context: 'tool_execution',
            recoverable: error?.recoverable !== false,
            tool_name: toolName,
            cwd: cwd || context.cwd,
          }, invocation, { cwd: cwd || context.cwd });
          const handling = occurred.output.error_handling;
          const requestedRetries = Math.min(Number(occurred.output.retry_count || 1), maxRetries);
          if (handling === 'retry' && retriesRemaining > 0 && requestedRetries > 0) {
            retriesRemaining -= 1;
            continue;
          }
          if (handling === 'skip') {
            return Object.freeze({
              schema: 'agentsam.hook.skipped.v1',
              skipped: true,
              kind: 'tool_error',
              tool_name: toolName,
              error: serializedError(error),
              notification: occurred.output.user_notification || null,
            });
          }
          if (occurred.output.additional_context) error.hook_context = [error.hook_context, occurred.output.additional_context].filter(Boolean).join('\n\n');
          if (occurred.output.user_notification) error.user_notification = occurred.output.user_notification;
          if (occurred.output.suppress_output === true) error.suppress_output = true;
          throw error;
        }
      }

      // Post-hook failures happen after the tool may have produced side effects.
      // Never feed those failures into the tool retry policy.
      const post = await hooks.dispatch('post_tool_use', {
        tool_name: toolName,
        tool_args: args,
        tool_result: value,
        cwd: cwd || context.cwd,
      }, invocation, { cwd: cwd || context.cwd });
      if (post.output.suppress_output === true) {
        return Object.freeze({
          schema: 'agentsam.hook.suppressed.v1',
          suppressed: true,
          kind: 'tool_result',
          tool_name: toolName,
        });
      }
      const contexts = [hookContext, post.output.additional_context].filter(Boolean);
      if (contexts.length) {
        return Object.freeze({
          schema: 'agentsam.hook.contextualized-tool-result.v1',
          result: post.input.tool_result,
          additional_context: contexts.join('\n\n'),
        });
      }
      return post.input.tool_result;
    },
  };
  return Object.freeze(adapter);
}
