/** ChatGPT Apps SDK / OpenAI hosted identity header constants. */

export const CHATGPT_USER_EMAIL_HEADER = 'oai-authenticated-user-email';
export const CHATGPT_USER_FULL_NAME_HEADER = 'oai-authenticated-user-full-name';
export const CHATGPT_USER_FULL_NAME_ENCODING_HEADER =
  'oai-authenticated-user-full-name-encoding';
export const CHATGPT_PERCENT_ENCODED_UTF8 = 'percent-encoded-utf-8';

export const CHATGPT_SIGN_IN_PATH = '/signin-with-chatgpt';
export const CHATGPT_SIGN_OUT_PATH = '/signout-with-chatgpt';
export const CHATGPT_CALLBACK_PATH = '/callback';

/**
 * @param {Headers | Record<string, string | string[] | undefined> | null | undefined} headers
 * @param {string} name
 */
export function readHeader(headers, name) {
  if (!headers) return null;
  const key = String(name).toLowerCase();
  if (typeof headers.get === 'function') {
    const value = headers.get(name) ?? headers.get(key);
    return value == null ? null : String(value);
  }
  const raw =
    headers[name] ??
    headers[key] ??
    Object.entries(headers).find(([k]) => k.toLowerCase() === key)?.[1];
  if (Array.isArray(raw)) return raw[0] == null ? null : String(raw[0]);
  return raw == null ? null : String(raw);
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Extract ChatGPT hosted user profile from request headers (Apps SDK).
 * Does not leak transport headers into NormalizedExternalIdentity.raw beyond a redacted snapshot.
 *
 * @param {Headers | Record<string, string | string[] | undefined> | null | undefined} headers
 * @returns {{ email: string, fullName: string | null, displayName: string } | null}
 */
export function readChatGptUserFromHeaders(headers) {
  const email = readHeader(headers, CHATGPT_USER_EMAIL_HEADER);
  if (!email) return null;

  const encodedFullName = readHeader(headers, CHATGPT_USER_FULL_NAME_HEADER);
  const encoding = readHeader(headers, CHATGPT_USER_FULL_NAME_ENCODING_HEADER);
  const fullName =
    encodedFullName && encoding === CHATGPT_PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : encodedFullName && encoding !== CHATGPT_PERCENT_ENCODED_UTF8
        ? encodedFullName
        : null;

  return {
    email: email.trim().toLowerCase(),
    fullName,
    displayName: (fullName || email).trim(),
  };
}
