const ACCESS_TOKEN_VERSION = 1;
const DEFAULT_ACCESS_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(passwordHash, passwordSalt) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(passwordHash + ":" + passwordSalt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Issue a stateless, site-bound access grant for a merchant's shared storefront password.
 * The password credential is part of the signing key, so changing/removing the password
 * immediately invalidates previously issued grants without a session-table sweep.
 *
 * @param {{siteId:string,passwordHash:string,passwordSalt:string,now?:number,maxAge?:number}} input
 */
export async function createPasswordGateToken({
  siteId,
  passwordHash,
  passwordSalt,
  now = Date.now(),
  maxAge = DEFAULT_ACCESS_SECONDS,
} = {}) {
  if (!siteId || !passwordHash || !passwordSalt) throw new Error("identity_password_gate_credentials_missing");
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    v: ACCESS_TOKEN_VERSION,
    site: String(siteId),
    exp: Math.floor(now / 1000) + maxAge,
  })));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(passwordHash, passwordSalt),
    encoder.encode(payload),
  );
  return payload + "." + toBase64Url(new Uint8Array(signature));
}

/** Verify expiry, site binding and signature for a shared storefront-password grant. */
export async function verifyPasswordGateToken(token, {
  siteId,
  passwordHash,
  passwordSalt,
  now = Date.now(),
} = {}) {
  if (!token || !siteId || !passwordHash || !passwordSalt) return false;
  const parts = String(token).split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
    if (
      payload?.v !== ACCESS_TOKEN_VERSION ||
      payload.site !== String(siteId) ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(now / 1000)
    ) return false;
    return await crypto.subtle.verify(
      "HMAC",
      await signingKey(passwordHash, passwordSalt),
      fromBase64Url(parts[1]),
      encoder.encode(parts[0]),
    );
  } catch {
    return false;
  }
}
