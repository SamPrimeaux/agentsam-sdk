/** Account linking contract surface — implementation in adapters + Identity Service. */
export function accountLinkingNotConfigured() {
  throw new Error('account_linking_requires_identity_service_adapter');
}
