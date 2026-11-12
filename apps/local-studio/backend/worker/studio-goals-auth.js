import { resolveIamIssuer } from '../../../../packages/identity/src/contracts/auth-config.js';

// CLI tokens use the same platform authority as agentsam whoami. Studio
// browser and desktop sessions resolve through Studio Identity first.
export async function resolveStudioGoalsCliAccount(request, env, fetchImpl = fetch) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization) || !env.DB || !env.IAM_OAUTH_ISSUER) return null;
  const url = new URL('/api/sdk/context',resolveIamIssuer(env));
  const response = await fetchImpl(url,{
    headers: { authorization, accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('account_authority_unavailable');
  const context = await response.json();
  if (context.auth_type !== 'agentsam_browser_oauth' || !context.owner_account_id) return null;
  const account = await env.DB.prepare("SELECT id FROM accounts WHERE id=? AND status='active'")
    .bind(context.owner_account_id).first();
  return account?.id || null;
}
