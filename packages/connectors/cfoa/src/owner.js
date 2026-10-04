/**
 * Cloudflare connection ownership is derived from the REAL AgentSam identity
 * session (packages/identity — the same `session` cookie set by
 * /api/auth/login and every OAuth login callback).
 *
 * Host MUST pass `app` + `routeRegistry` (APP contract). createIdentityService
 * is fail-closed without them (AUTH_APP_UNRESOLVED).
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

/**
 * @param {Request} request
 * @param {object} env
 * @param {URL} url
 * @param {object} body
 * @param {{ app?: { id: string }, routeRegistry?: object }} [options]
 */
export async function resolveAuthenticatedOwner(request, env, url, body, options = {}) {
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

  const app = options.app || null;
  const routeRegistry = options.routeRegistry || null;
  if (!app?.id || !routeRegistry) {
    const err = new Error('AUTH_APP_UNRESOLVED');
    err.code = 'AUTH_APP_UNRESOLVED';
    err.message = 'Cloudflare connection owner resolution requires host app + routeRegistry';
    throw err;
  }

  const adapter = createCloudflareD1Adapter(env.DB);
  const identity = createIdentityService({ adapter, env, app, routeRegistry });
  const ctx = await identity.sessionFromRequest(request);
  if (ctx?.user?.id) return String(ctx.user.id);

  // Native CLI OAuth / platform access token — resolve via IAM userinfo, then
  // map verified IAM subject to the local auth user. No caller-supplied owner.
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) {
    // Reusable aak_* account API keys are verified by hash in D1 (same table as whoami).
    if (bearer.startsWith('aak_')) {
      try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bearer));
        const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
        const row = await env.DB.prepare(
          `SELECT account_id FROM agentsam_api_credentials
            WHERE credential_hash = ?
              AND revoked_at_unix IS NULL
              AND (expires_at_unix IS NULL OR expires_at_unix > ?)
            LIMIT 1`,
        ).bind(hash, Math.floor(Date.now() / 1000)).first();
        if (row?.account_id) return String(row.account_id);
      } catch {
        /* fall through to IAM profile */
      }
    }
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
