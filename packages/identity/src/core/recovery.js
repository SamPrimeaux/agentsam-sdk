/** Password reset / recovery — client routes only; tokens verified server-side. */
export function recoveryNotConfigured() {
  throw new Error('recovery_requires_identity_service_adapter');
}
