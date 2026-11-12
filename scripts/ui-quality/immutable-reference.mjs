/**
 * Frozen third-party/editor-authored source imports are data fixtures, not
 * application-authored HTML. Their inline styles and template bindings must
 * remain verbatim for source fidelity. All actual product React, CSS, app
 * entrypoints, and authored reference wrappers still pass the UI source gate.
 */
export function isImmutableDesignReference(file) {
  return /^apps\/design-canvas\/public\/sources\/(?:agentsam|onboarding|onboarding-exports)\/(?:[A-Za-z0-9_-]+\.dc\.html|OnboardingOffersCollection\.html)$/.test(file);
}
