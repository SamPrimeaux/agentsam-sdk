import { normalizeExternalIdentity } from '../../contracts/external-identity.js';

/**
 * Normalize ChatGPT / OpenAI Apps SDK identity into portable external identity.
 * Provider id is always `chatgpt` — never leak `oai-authenticated-*` header names into contracts.
 *
 * @param {Record<string, unknown> | null | undefined} profile
 */
export function normalizeChatGptIdentity(profile) {
  const raw = profile && typeof profile === 'object' ? profile : {};
  const email =
    typeof raw.email === 'string' && raw.email.trim()
      ? raw.email.trim().toLowerCase()
      : null;
  const subject = String(raw.sub || raw.id || raw.subject || email || '').trim();
  if (!subject) {
    throw new Error('chatgpt_identity_requires_subject');
  }

  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : typeof raw.displayName === 'string' && raw.displayName.trim()
        ? raw.displayName.trim()
        : typeof raw.fullName === 'string' && raw.fullName.trim()
          ? raw.fullName.trim()
          : null;

  return normalizeExternalIdentity({
    provider: 'chatgpt',
    subject,
    email,
    emailVerified: Boolean(email),
    name,
    avatar: null,
    username: null,
    raw: {
      source: 'chatgpt_hosted',
      email,
      name,
    },
  });
}
