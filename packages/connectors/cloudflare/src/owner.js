/**
 * Cloudflare connection ownership is derived from the REAL AgentSam identity
 * session (packages/identity — the same `session` cookie set by
 * /api/auth/login and every OAuth login callback). This previously
 * hand-rolled its own cookie name (`agentsam_session`) and session table
 * names (`agentsam_sessions`/`sessions`/`identity_sessions`) that never
 * matched the actual identity system (cookie name `session`, sessions
 * resolved via identity.sessionFromRequest against the real adapter) — so
 * this connector could never actually authenticate anyone. Fixed to call
 * the real identity service instead of guessing at its storage shape.
 *
 * Browser-submitted account_id / user_id / owner_id / X-User-Id are never authority.
 */

import { createIdentityService, createCloudflareD1Adapter } from '../../identity/src/server/worker-router.js';

const UNTRUSTED = new Set(['account_id', 'user_id', 'owner_id', 'workspace_id']);

export function rejectUntrustedOwnerHints(request, url, body = {}) {
  const headerUser = (request.headers.get('x-user-id') || '').trim();
  for (const key of UNTRUSTED) {
    if (url.searchParams.get(key)) {
      const err = new Error('untrusted_owner_hint');
      err.code = 'untrusted_owner_hint';
      throw err;
    }
    if (body && body[key]) {
      const err = new Error('untrusted_owner_hint');
      err.code = 'untrusted_owner_hint';
      throw err;
    }
  }
  // X-User-Id is vault v1 compatibility only and is never connector authority.
  return { ignoredXUserId: Boolean(headerUser) };
}

export async function resolveAuthenticatedOwner(request, env, url, body) {
  rejectUntrustedOwnerHints(request, url, body);
  if (!env?.DB) {
    const err = new Error('unauthenticated');
    err.code = 'unauthenticated';
    throw err;
  }
  const adapter = createCloudflareD1Adapter(env.DB);
  const identity = createIdentityService({ adapter, env });
  const ctx = await identity.sessionFromRequest(request);
  if (!ctx?.user?.id) {
    const err = new Error('unauthenticated');
    err.code = 'unauthenticated';
    throw err;
  }
  return String(ctx.user.id);
}
