const ACCESS_TOKEN_VERSION = 2;
const DEFAULT_ACCESS_SECONDS = 7 * 24 * 60 * 60;
const MAX_ACCESS_SECONDS = 30 * 24 * 60 * 60;
const SIGNING_CONTEXT = 'agentsam.storefront-password-gate.v2';
const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function normalizeSigningSecret(value) {
  const secret = String(value || '');
  if (encoder.encode(secret).byteLength < 32) {
    throw new Error('identity_password_gate_signing_secret_required');
  }
  return secret;
}

async function signingKey(signingSecret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(normalizeSigningSecret(signingSecret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function credentialVersion(passwordHash, passwordSalt) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`${passwordSalt}:${passwordHash}`),
  );
  return toBase64Url(new Uint8Array(digest));
}

function signingMessage(payload) {
  return `${SIGNING_CONTEXT}:${payload}`;
}

/**
 * Issue a stateless, site-bound grant for a merchant's shared storefront password.
 * The signing secret is host-owned and never derived from the stored password hash.
 * A credential fingerprint invalidates grants when the merchant changes the password.
 *
 * @param {{siteId:string,passwordHash:string,passwordSalt:string,signingSecret:string,now?:number,maxAge?:number}} input
 */
export async function createPasswordGateToken({
  siteId,
  passwordHash,
  passwordSalt,
  signingSecret,
  now = Date.now(),
  maxAge = DEFAULT_ACCESS_SECONDS,
} = {}) {
  if (!siteId || !passwordHash || !passwordSalt) {
    throw new Error('identity_password_gate_credentials_missing');
  }
  if (!Number.isFinite(maxAge) || maxAge <= 0 || maxAge > MAX_ACCESS_SECONDS) {
    throw new Error('identity_password_gate_lifetime_invalid');
  }
  const secret = normalizeSigningSecret(signingSecret);
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    v: ACCESS_TOKEN_VERSION,
    site: String(siteId),
    credential: await credentialVersion(passwordHash, passwordSalt),
    exp: Math.floor(now / 1000) + Math.floor(maxAge),
  })));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(secret),
    encoder.encode(signingMessage(payload)),
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Verify expiry, site binding, credential rotation and host-secret signature. */
export async function verifyPasswordGateToken(token, {
  siteId,
  passwordHash,
  passwordSalt,
  signingSecret,
  now = Date.now(),
} = {}) {
  if (!token || !siteId || !passwordHash || !passwordSalt || !signingSecret) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  try {
    const secret = normalizeSigningSecret(signingSecret);
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
    if (
      payload?.v !== ACCESS_TOKEN_VERSION ||
      payload.site !== String(siteId) ||
      payload.credential !== await credentialVersion(passwordHash, passwordSalt) ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(now / 1000)
    ) return false;
    return await crypto.subtle.verify(
      'HMAC',
      await signingKey(secret),
      fromBase64Url(parts[1]),
      encoder.encode(signingMessage(parts[0])),
    );
  } catch {
    return false;
  }
}
