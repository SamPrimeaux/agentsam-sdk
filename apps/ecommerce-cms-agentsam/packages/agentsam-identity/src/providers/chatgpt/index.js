import { createIdentityProvider } from '../../provider-contract.js';
import { normalizeChatGptIdentity } from './mapper.js';
import { readChatGptUserFromHeaders } from './headers.js';
import { chatGPTSignInPath, chatGPTSignOutPath, safeRelativeReturnPath } from './paths.js';

/**
 * ChatGPT hosted identity provider (OpenAI Apps SDK).
 *
 * Auth is header-based in the ChatGPT host — not classic OAuth client credentials.
 * `authorizeUrl` points at the hosted sign-in path; `exchangeCode` is unsupported.
 */
export const ChatGptProvider = createIdentityProvider({
  id: 'chatgpt',
  authorizeUrl: ({ redirectUri, state } = {}) => {
    const returnTo =
      typeof redirectUri === 'string' && redirectUri.startsWith('/')
        ? redirectUri
        : '/';
    const path = chatGPTSignInPath(returnTo);
    return state ? `${path}&state=${encodeURIComponent(state)}` : path;
  },
  exchangeCode: async () => null,
  getProfile: async () => null,
  normalizeIdentity: normalizeChatGptIdentity,
});

/**
 * Build a portable CmsAuthHost for ChatGPT-hosted apps.
 * Reads `oai-authenticated-*` headers; challenges to hosted sign-in when missing.
 *
 * @param {{ cmsBase?: string }} [options]
 */
export function createChatGptCmsAuthHost(options = {}) {
  const cmsBase = options.cmsBase || '/cms';
  return {
    async authorizeCmsAccess({ path, headers }) {
      const user = readChatGptUserFromHeaders(headers);
      if (!user) {
        return {
          allowed: false,
          principal: null,
          reason: 'chatgpt_identity_required',
          challengeUrl: chatGPTSignInPath(path || cmsBase),
        };
      }
      const identity = normalizeChatGptIdentity({
        email: user.email,
        name: user.fullName || user.displayName,
        sub: user.email,
      });
      return {
        allowed: true,
        principal: {
          id: `chatgpt:${identity.subject}`,
          displayName: identity.name || identity.email || identity.subject,
          email: identity.email || undefined,
          roles: ['cms_admin'],
          localDevelopment: false,
          provider: 'chatgpt',
        },
        reason: 'chatgpt_hosted_identity',
      };
    },
    buildLoginUrl({ returnTo }) {
      return chatGPTSignInPath(returnTo || cmsBase);
    },
  };
}

export {
  normalizeChatGptIdentity,
  readChatGptUserFromHeaders,
  chatGPTSignInPath,
  chatGPTSignOutPath,
  safeRelativeReturnPath,
};

export {
  CHATGPT_USER_EMAIL_HEADER,
  CHATGPT_USER_FULL_NAME_HEADER,
  CHATGPT_USER_FULL_NAME_ENCODING_HEADER,
  CHATGPT_PERCENT_ENCODED_UTF8,
  CHATGPT_SIGN_IN_PATH,
  CHATGPT_SIGN_OUT_PATH,
  CHATGPT_CALLBACK_PATH,
} from './headers.js';
