import { IAM_IDENTITY_USERINFO_PATH } from './oauth.js';

function normalizeIssuer(issuer) {
  return String(issuer || '').replace(/\/+$/, '');
}

/**
 * @param {{ issuer: string, accessToken: string }} input
 */
export async function fetchIamProfile({ issuer, accessToken }) {
  try {
    const base = normalizeIssuer(issuer);
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
