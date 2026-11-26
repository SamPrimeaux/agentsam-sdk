/**
 * Session policy — three concerns stay separate:
 *   browser  = normal logged-in account session (cookie / auth_sessions)
 *   agent    = short-lived delegated/runtime grant (execution, terminal, sandbox)
 *
 * Product routing does not live here.
 */

/** auth_sessions.type values written by this package. */
export const SESSION_TYPES = Object.freeze({
  BROWSER: 'browser',
  DESKTOP: 'desktop',
});

/** Lifetime of the one-time code a native OAuth callback hands to the app. */
export const NATIVE_HANDOFF_TTL_SECONDS = 120;

export const SESSION_POLICY = Object.freeze({
  browser: Object.freeze({
    ttlSeconds: 30 * 24 * 60 * 60,
  }),
  /** Native app bearer session (OS keychain) — minted via the native OAuth handoff. */
  desktop: Object.freeze({
    ttlSeconds: 30 * 24 * 60 * 60,
    renewWindowSeconds: 7 * 24 * 60 * 60,
  }),
  /** Temporary execution authority — not the user's Local Studio login. */
  agent: Object.freeze({
    minTtlSeconds: 60,
    defaultTtlSeconds: 15 * 60,
    maxTtlSeconds: 24 * 60 * 60,
  }),
});

/**
 * Desktop sessions are durable/revocable AgentSam sessions, not provider tokens.
 * Renew only near expiry so normal app launches remain read-mostly.
 */
export function shouldRenewDesktopSession(session, nowSeconds) {
  const now = Number.isFinite(Number(nowSeconds))
    ? Math.floor(Number(nowSeconds))
    : Math.floor(Date.now() / 1000);
  const expiresAt = Number(session?.expires_at);
  return (
    session?.type === SESSION_TYPES.DESKTOP
    && Number.isFinite(expiresAt)
    && expiresAt > now
    && expiresAt - now <= SESSION_POLICY.desktop.renewWindowSeconds
  );
}

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
