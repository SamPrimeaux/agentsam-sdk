import { IAM_IDENTITY_USERINFO_PATH } from './oauth.js';

function normalizeOrigin(origin, issuer) {
  return String(origin || issuer || '').replace(/\/+$/, '');
}

/**
 * @param {{ origin?: string, issuer?: string, accessToken: string }} input
 */
export async function fetchIamProfile({ origin, issuer, accessToken }) {
  try {
    const base = normalizeOrigin(origin, issuer);
    const res = await fetch(`${base}${IAM_IDENTITY_USERINFO_PATH}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** @param {string} accessToken @param {string} [issuer] */
export async function fetchIamProfileWithIssuer(accessToken, issuer) {
  return fetchIamProfile({ issuer: issuer || '', accessToken });
}
