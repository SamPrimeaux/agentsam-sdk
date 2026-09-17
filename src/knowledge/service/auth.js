import { timingSafeEqual } from 'node:crypto';

export function createBearerTokenVerifier(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) {
    throw new Error('Service token must be 32..256 characters.');
  }
  const secret = Buffer.from(token);
  return authorization => {
    const raw = typeof authorization === 'string' ? authorization : '';
    const provided = Buffer.from(raw.replace(/^Bearer /, ''));
    return provided.length === secret.length && timingSafeEqual(provided, secret);
  };
}
