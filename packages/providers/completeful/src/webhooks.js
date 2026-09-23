export const COMPLETEFUL_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function parseSignatureHeader(signatureHeader) {
  const parts = String(signatureHeader || '').split(',').map((part) => part.trim());
  const timestamp = (parts.find((part) => part.startsWith('t=')) || '').slice(2).trim();
  const signature = (parts.find((part) => part.startsWith('v1=')) || '').slice(3).trim();
  return { timestamp, signature };
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function computeCompletefulWebhookSignature(secret, timestamp, rawBody) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const payload = `${timestamp}.${rawBody}`;
  const buffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyCompletefulWebhook({
  rawBody,
  signatureHeader,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = COMPLETEFUL_WEBHOOK_TOLERANCE_SECONDS,
} = {}) {
  if (!secret) return { ok: false, reason: 'secret_missing' };

  const { timestamp, signature } = parseSignatureHeader(signatureHeader);
  if (!timestamp || !signature) return { ok: false, reason: 'missing_signature' };

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return { ok: false, reason: 'invalid_timestamp' };
  if (Math.abs(Number(nowSeconds) - timestampNumber) > toleranceSeconds) {
    return { ok: false, reason: 'stale_signature', timestamp: timestampNumber };
  }

  const expected = await computeCompletefulWebhookSignature(secret, timestamp, String(rawBody || ''));
  const ok = timingSafeEqualHex(signature.toLowerCase(), expected.toLowerCase());
  return {
    ok,
    reason: ok ? null : 'signature_mismatch',
    timestamp: timestampNumber,
  };
}
