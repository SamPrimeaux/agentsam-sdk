/**
 * OAuth inbound finalize contract.
 * IAM reference: inneranimalmedia/src/core/auth/oauth-finalize.js — do not rewrite behavior.
 */
export { isInboundOAuthSuccess } from '../core/sessions.js';

/**
 * Customer adapters implement this server-side (D1, Postgres, etc.).
 * SDK does not ship secrets or storage bindings.
 *
 * @typedef {import('../core/sessions.js').InboundOAuthInput} InboundOAuthInput
 * @typedef {import('../core/sessions.js').InboundOAuthSuccess} InboundOAuthSuccess
 * @typedef {import('../core/sessions.js').InboundOAuthFailure} InboundOAuthFailure
 */

/**
 * @param {unknown} env
 * @param {Request} request
 * @param {InboundOAuthInput} input
 * @returns {Promise<InboundOAuthSuccess|InboundOAuthFailure>}
 */
export async function finalizeInboundOAuth(_env, _request, _input) {
  throw new Error('finalizeInboundOAuth_requires_identity_service_adapter');
}
