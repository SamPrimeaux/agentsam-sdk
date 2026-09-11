/**
 * Cloudflare connection ownership is derived from authenticated AgentSam session.
 * Browser-submitted account_id / user_id / owner_id / X-User-Id are never authority.
 */

const UNTRUSTED = new Set(['account_id', 'user_id', 'owner_id', 'workspace_id']);

export function extractSessionToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (/^bearer\s+/i.test(auth)) {
    const token = auth.replace(/^bearer\s+/i, '').trim();
    if (token && !token.startsWith('cf_') && token !== 'sillynotreal-secret') return token;
  }
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)agentsam_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]).trim() : '';
}

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
  const sessionToken = extractSessionToken(request);
  if (!sessionToken) {
    const err = new Error('unauthenticated');
    err.code = 'unauthenticated';
    throw err;
  }
  if (env?.sessions instanceof Map) {
    const owner = env.sessions.get(sessionToken);
    if (!owner) {
      const err = new Error('unauthenticated');
      err.code = 'unauthenticated';
      throw err;
    }
    return String(owner);
  }
  if (env?.DB?.prepare) {
    const tables = [
      ['agentsam_sessions', 'session_token', 'user_id'],
      ['sessions', 'id', 'user_id'],
      ['identity_sessions', 'session_token', 'user_id'],
    ];
    for (const [table, tokenCol, userCol] of tables) {
      try {
        const row = await env.DB.prepare(
          `SELECT ${userCol} AS user_id FROM ${table} WHERE ${tokenCol} = ? LIMIT 1`,
        )
          .bind(sessionToken)
          .first();
        if (row?.user_id) return String(row.user_id);
      } catch {
        // table may not exist yet
      }
    }
  }
  const err = new Error('unauthenticated');
  err.code = 'unauthenticated';
  throw err;
}
