/**
 * OAuth inbound finalize — SDK orchestration + boot registry for host adapters.
 */
export { isInboundOAuthSuccess } from '../core/sessions.js';
export { createFinalizeInboundOAuth } from './finalize-inbound.js';
export { createOAuthRedirectHelpers } from './redirect-paths.js';

/** @type {import('../core/sessions.js').InboundOAuthFinalizeFn|null} */
let registeredFinalize = null;

/**
 * Host (IAM) registers production finalize at Worker boot — typically
 * createFinalizeInboundOAuth(hostPorts) from adapters/inneranimalmedia.
 * @param {import('../core/sessions.js').InboundOAuthFinalizeFn} fn
 */
export function registerFinalizeInboundOAuth(fn) {
  if (typeof fn !== 'function') {
    throw new Error('registerFinalizeInboundOAuth_requires_function');
  }
  registeredFinalize = fn;
}

/**
 * @param {unknown} env
 * @param {Request} request
 * @param {import('../core/sessions.js').InboundOAuthInput} input
 */
export async function finalizeInboundOAuth(env, request, input) {
  if (!registeredFinalize) {
    throw new Error('finalizeInboundOAuth_requires_identity_service_adapter');
  }
  return registeredFinalize(env, request, input);
}
