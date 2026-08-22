const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

/** @param {string} accessToken */
export async function fetchGoogleProfile(accessToken) {
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
