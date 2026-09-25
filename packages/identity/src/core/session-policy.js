/**
 * Session policy — three concerns stay separate:
 *   browser  = normal logged-in account session (cookie / auth_sessions)
 *   agent    = short-lived delegated/runtime grant (execution, terminal, sandbox)
 *
 * Product routing does not live here.
 */

export const SESSION_POLICY = Object.freeze({
  browser: Object.freeze({
    ttlSeconds: 30 * 24 * 60 * 60,
  }),
  /** Temporary execution authority — not the user's Local Studio login. */
  agent: Object.freeze({
    minTtlSeconds: 60,
    defaultTtlSeconds: 15 * 60,
    maxTtlSeconds: 24 * 60 * 60,
  }),
});

/**
 * Clamp a requested agent/runtime grant TTL into policy bounds.
 * @param {number|null|undefined} requestedSeconds
 */
export function clampAgentSessionTtl(requestedSeconds) {
  const n = Number(requestedSeconds);
  if (!Number.isFinite(n) || n <= 0) return SESSION_POLICY.agent.defaultTtlSeconds;
  return Math.min(
    SESSION_POLICY.agent.maxTtlSeconds,
    Math.max(SESSION_POLICY.agent.minTtlSeconds, Math.floor(n)),
  );
}
