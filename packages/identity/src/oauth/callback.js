/**
 * OAuth inbound finalize contract.
 * IAM reference: inneranimalmedia/src/core/auth/oauth-finalize.js — register via registerFinalizeInboundOAuth.
 */
export { isInboundOAuthSuccess } from '../core/sessions.js';

/** @type {import('../core/sessions.js').InboundOAuthFinalizeFn|null} */
let registeredFinalize = null;

/**
 * IAM (or customer adapter) registers the production finalize implementation at Worker boot.
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
