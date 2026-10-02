export function createCallbackHookAdapter(handler) {
  if (typeof handler !== 'function') throw new TypeError('callback_hook_handler_required');
  return async (envelope) => handler(envelope.input, envelope.invocation, envelope);
}
