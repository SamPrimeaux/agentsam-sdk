const CLOUDFLARE_USERINFO_URL = 'https://dash.cloudflare.com/oauth2/userinfo';
const CLOUDFLARE_API_USER_URL = 'https://api.cloudflare.com/client/v4/user';

/**
 * Fetch the authenticated Cloudflare user's identity.
 *
 * OIDC userinfo (`/oauth2/userinfo`) structurally returns `sub` only.
 * Email/name require `user-details.read` and a second call to `/client/v4/user`
 * (`data.result.*`, not top-level fields).
 *
 * @param {string} accessToken
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function fetchCloudflareProfile(accessToken, opts = {}) {
  const token = String(accessToken || '').trim();
  if (!token) return null;
  const fetchImpl = opts.fetchImpl || fetch;
  try {
    const userinfoRes = await fetchImpl(CLOUDFLARE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!userinfoRes.ok) return null;
    const userinfo = await userinfoRes.json().catch(() => null);
    if (!userinfo) return null;

    const sub = userinfo.sub || userinfo.id || userinfo.user_id || null;
    let email = typeof userinfo.email === 'string' ? userinfo.email : null;
    let name = typeof userinfo.name === 'string'
      ? userinfo.name
      : (typeof userinfo.display_name === 'string' ? userinfo.display_name : null);

    // Cloudflare userinfo does not return email/name — enrich from /v4/user.
    if (!email || !name) {
      try {
        const apiRes = await fetchImpl(CLOUDFLARE_API_USER_URL, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (apiRes.ok) {
          const body = await apiRes.json().catch(() => null);
          const result = body?.result && typeof body.result === 'object' ? body.result : null;
          if (result) {
            if (!email && typeof result.email === 'string') email = result.email;
            if (!name && typeof result.first_name === 'string' && typeof result.last_name === 'string') {
              name = `${result.first_name} ${result.last_name}`.trim() || null;
            }
            if (!name && typeof result.name === 'string') name = result.name;
          }
        }
      } catch {
        // Non-fatal: identity can proceed with sub alone.
      }
    }

    return {
      sub: sub || null,
      email,
      name,
      raw: userinfo,
    };
  } catch {
    return null;
  }
}
