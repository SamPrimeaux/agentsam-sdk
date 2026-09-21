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

import { createIdentityService, createCloudflareD1Adapter } from '../../../identity/src/server/worker-router.js';
import { fetchIamProfile } from '../../../identity/src/providers/iam/profile.js';
import { normalizeIamIdentity } from '../../../identity/src/providers/iam/mapper.js';
import { resolveIamIssuer } from '../../../identity/src/contracts/auth-config.js';

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
  // Test/portable adapters may expose an in-memory session map. Keep this
  // compatibility lane deliberately opt-in; production authority is D1.
  const fixtureToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const fixtureCookie = (request.headers.get('cookie') || '').match(/(?:^|;\s*)agentsam_session=([^;]+)/)?.[1] || '';
  if (env?.fixtureSessions instanceof Map) {
    const fixtureOwner = env.fixtureSessions.get(fixtureToken || fixtureCookie);
    if (fixtureOwner) return String(fixtureOwner);
  }
  if (!env?.DB) {
    const err = new Error('unauthenticated');
    err.code = 'unauthenticated';
    throw err;
  }
  const adapter = createCloudflareD1Adapter(env.DB);
  const identity = createIdentityService({ adapter, env });
  const ctx = await identity.sessionFromRequest(request);
  if (ctx?.user?.id) return String(ctx.user.id);

  // Native CLI OAuth returns a bearer access token rather than a browser
  // cookie. Resolve that token through IAM userinfo, then map the verified
  // IAM subject to the local auth user. No caller-supplied owner id is used.
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) {
    const profile = await fetchIamProfile({
      issuer: resolveIamIssuer(env),
      accessToken: bearer,
    });
    const identityProfile = profile ? normalizeIamIdentity(profile) : null;
    if (identityProfile?.subject) {
      const user = await adapter.findUserByProvider('iam', identityProfile.subject);
      if (user?.id) return String(user.id);
    }
  }

  const err = new Error('unauthenticated');
  err.code = 'unauthenticated';
  throw err;
}
