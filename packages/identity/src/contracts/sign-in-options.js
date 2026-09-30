/**
 * Stock sign-in options for OAuth / CMS editor first-run setup.
 * user123 picks from these prepackaged providers when wiring auth.
 */

/** @typedef {'oauth' | 'oidc' | 'hosted_headers' | 'local'} StockSignInKind */

/**
 * @typedef {object} StockSignInOption
 * @property {string} id
 * @property {string} label
 * @property {string} [shortLabel]
 * @property {StockSignInKind} kind
 * @property {'ready' | 'scaffold'} status
 * @property {string} description
 * @property {string[]} [aliases]
 * @property {string[]} [requiredEnv]
 * @property {string[]} [optionalEnv]
 * @property {string} [implementation]
 * @property {boolean} [cmsDefault]
 */

/** @type {readonly StockSignInOption[]} */
export const STOCK_SIGN_IN_OPTIONS = Object.freeze([
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    shortLabel: 'Cloudflare',
    kind: 'oauth',
    status: 'ready',
    description: 'Sign in with Cloudflare account OAuth (PKCE-capable).',
    requiredEnv: ['CLOUDFLARE_OAUTH_CLIENT_ID'],
    optionalEnv: ['CLOUDFLARE_OAUTH_CLIENT_SECRET'],
    implementation: 'src/providers/cloudflare',
  },
  {
    id: 'google',
    label: 'Google',
    shortLabel: 'Google',
    kind: 'oauth',
    status: 'ready',
    description: 'Sign in with Google (browser OAuth confidential client).',
    requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    implementation: 'src/providers/google',
  },
  {
    id: 'inneranimalmedia',
    label: 'Inner Animal Media',
    shortLabel: 'IAM',
    kind: 'oidc',
    status: 'ready',
    description: 'Sign in with Inner Animal Media platform identity (OIDC).',
    aliases: ['iam'],
    requiredEnv: ['IAM_CLIENT_ID', 'IAM_CLIENT_SECRET'],
    optionalEnv: ['IAM_OAUTH_ISSUER', 'IAM_ORIGIN'],
    implementation: 'src/providers/iam',
    cmsDefault: true,
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    shortLabel: 'ChatGPT',
    kind: 'hosted_headers',
    status: 'ready',
    description:
      'Sign in via ChatGPT / OpenAI Apps SDK hosted identity (oai-authenticated headers → NormalizedExternalIdentity).',
    aliases: ['openai', 'chatgpt-hosted'],
    requiredEnv: [],
    implementation: 'src/providers/chatgpt',
  },
]);

/** Canonical ids offered on CMS / OAuth prebuild pickers. */
export const CMS_STOCK_SIGN_IN_IDS = Object.freeze(
  STOCK_SIGN_IN_OPTIONS.map((row) => row.id),
);

/**
 * @param {string} id
 * @returns {StockSignInOption | null}
 */
export function getStockSignInOption(id) {
  const key = String(id || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (!key) return null;
  if (key === 'iam') {
    return STOCK_SIGN_IN_OPTIONS.find((row) => row.id === 'inneranimalmedia') || null;
  }
  if (key === 'openai' || key === 'chatgpt_hosted') {
    return STOCK_SIGN_IN_OPTIONS.find((row) => row.id === 'chatgpt') || null;
  }
  return (
    STOCK_SIGN_IN_OPTIONS.find((row) => row.id === key) ||
    STOCK_SIGN_IN_OPTIONS.find((row) => (row.aliases || []).includes(String(id || '').trim().toLowerCase())) ||
    null
  );
}

/** @returns {StockSignInOption[]} */
export function listStockSignInOptions() {
  return [...STOCK_SIGN_IN_OPTIONS];
}
