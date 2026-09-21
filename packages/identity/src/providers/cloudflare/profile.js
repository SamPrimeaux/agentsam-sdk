const CLOUDFLARE_USERINFO_URL = 'https://dash.cloudflare.com/oauth2/userinfo';

/**
 * Fetch the authenticated Cloudflare user's identity.
 * Response shape not fully verified against a live token yet — this reads
 * defensively (sub/id/user_id, email, name) rather than assuming Cloudflare's
 * exact OIDC field names. Confirm the real shape on first live login and
 * tighten this if fields differ.
 * @param {string} accessToken
 */
export async function fetchCloudflareProfile(accessToken) {
  try {
    const res = await fetch(CLOUDFLARE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;
    return {
      sub: data.sub || data.id || data.user_id || data.account_id || null,
      email: data.email || null,
      name: data.name || data.display_name || null,
      raw: data,
    };
  } catch {
    return null;
  }
}
