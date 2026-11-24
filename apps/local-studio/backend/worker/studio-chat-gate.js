/**
 * Identity decision for Nitro-bound inference routes (/api/chat, /api/llm/inventory).
 * The account is only ever the validated session user. A client-asserted X-User-Id is
 * honoured solely on the trusted machine lane (valid AGENTSAM_BRIDGE_KEY). No session and
 * no bridge key means no account credential resolution and no platform-funded inference.
 *
 * @param {{ sessionUserId?: string|null, bridgeOk?: boolean, headerUserId?: string|null }} input
 * @returns {{ action: 'pass'|'bind', userId: string } | { action: 'deny', status: number, error: string }}
 */
export function decideChatIdentity({ sessionUserId, bridgeOk, headerUserId }) {
  const header = String(headerUserId ?? '').trim();
  const session = String(sessionUserId ?? '').trim();
  if (session) return { action: header === session ? 'pass' : 'bind', userId: session };
  if (!bridgeOk) return { action: 'deny', status: 401, error: 'authentication_required' };
  if (header.length < 3) return { action: 'deny', status: 400, error: 'account_id required (X-User-Id)' };
  return { action: 'pass', userId: header };
}
