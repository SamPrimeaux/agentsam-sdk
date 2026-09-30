/**
 * Provider-neutral auth/identity host contract for protecting /cms.
 * Local scaffolds may use a clearly identified local-development principal.
 * Consumers wire OAuth/OIDC/GitHub App/ChatGPT hosted identity without
 * rebuilding route protection.
 */

export type CmsPrincipal = {
  id: string;
  displayName?: string;
  email?: string;
  roles?: string[];
  /** True when this is an explicit local-dev principal, not production identity. */
  localDevelopment?: boolean;
  /** Stock provider id when known (cloudflare | google | inneranimalmedia | chatgpt). */
  provider?: string;
};

export type CmsAuthDecision = {
  allowed: boolean;
  principal?: CmsPrincipal | null;
  reason?: string;
  /** Optional redirect/login URL when denied. */
  challengeUrl?: string;
};

export type CmsAuthHost = {
  /**
   * Decide whether the current request/session may access a protected CMS surface.
   * Implementations must fail closed when unauthenticated in non-local modes.
   */
  authorizeCmsAccess(input: {
    path: string;
    method?: string;
    headers?: Record<string, string | undefined>;
    cookies?: Record<string, string | undefined>;
  }): Promise<CmsAuthDecision> | CmsAuthDecision;

  /** Optional login URL builder for the consumer's identity provider. */
  buildLoginUrl?(input: { returnTo: string }): string;
};

/** Explicit local-development principal — never silently treated as cloud identity. */
export const LOCAL_DEV_PRINCIPAL: CmsPrincipal = {
  id: 'local-dev',
  displayName: 'Local Developer',
  roles: ['cms_admin'],
  localDevelopment: true,
};

/**
 * Stock sign-in options offered during OAuth / CMS prebuild.
 * Keep ids aligned with `@inneranimalmedia/agentsam-sdk-identity` stock catalog.
 */
export const CMS_STOCK_SIGN_IN_OPTIONS = Object.freeze([
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    kind: 'oauth',
    description: 'Sign in with Cloudflare OAuth.',
  },
  {
    id: 'google',
    label: 'Google',
    kind: 'oauth',
    description: 'Sign in with Google OAuth.',
  },
  {
    id: 'inneranimalmedia',
    label: 'Inner Animal Media',
    kind: 'oidc',
    description: 'Sign in with Inner Animal Media platform identity.',
    aliases: ['iam'],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    kind: 'hosted_headers',
    description: 'Sign in via ChatGPT / OpenAI Apps SDK hosted identity headers.',
    aliases: ['openai'],
  },
] as const);

export type CmsStockSignInId = (typeof CMS_STOCK_SIGN_IN_OPTIONS)[number]['id'];

export function listCmsStockSignInOptions() {
  return [...CMS_STOCK_SIGN_IN_OPTIONS];
}

/** Default local auth host: allows /cms with the local-dev principal. */
export function createLocalDevAuthHost(): CmsAuthHost {
  return {
    authorizeCmsAccess() {
      return {
        allowed: true,
        principal: LOCAL_DEV_PRINCIPAL,
        reason: 'local_development_principal',
      };
    },
    buildLoginUrl({ returnTo }) {
      return `/cms/login?returnTo=${encodeURIComponent(returnTo)}`;
    },
  };
}

function headerValue(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (direct) return direct;
  const found = Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase());
  return found?.[1];
}

/**
 * ChatGPT hosted CmsAuthHost — reads OpenAI Apps SDK identity headers.
 * Does not invent success without headers.
 */
export function createChatGptCmsAuthHost(options: { cmsBase?: string } = {}): CmsAuthHost {
  const cmsBase = options.cmsBase || '/cms';
  const emailHeader = 'oai-authenticated-user-email';
  return {
    authorizeCmsAccess({ path, headers }) {
      const email = headerValue(headers, emailHeader)?.trim().toLowerCase();
      if (!email) {
        return {
          allowed: false,
          principal: null,
          reason: 'chatgpt_identity_required',
          challengeUrl: `/signin-with-chatgpt?return_to=${encodeURIComponent(path || cmsBase)}`,
        };
      }
      const name = headerValue(headers, 'oai-authenticated-user-full-name') || email;
      return {
        allowed: true,
        principal: {
          id: `chatgpt:${email}`,
          displayName: name,
          email,
          roles: ['cms_admin'],
          localDevelopment: false,
          provider: 'chatgpt',
        },
        reason: 'chatgpt_hosted_identity',
      };
    },
    buildLoginUrl({ returnTo }) {
      return `/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo || cmsBase)}`;
    },
  };
}

/**
 * OAuth-style challenge host for Cloudflare / Google / Inner Animal Media.
 * Allows when a session cookie matching the provider is present; otherwise
 * challenges to `/api/oauth/{provider}/start`.
 */
export function createOAuthChallengeCmsAuthHost(
  provider: Exclude<CmsStockSignInId, 'chatgpt'>,
  options: { cmsBase?: string; sessionCookie?: string } = {},
): CmsAuthHost {
  const cmsBase = options.cmsBase || '/cms';
  const cookieName = options.sessionCookie || `cms_session_${provider}`;
  const startPath =
    provider === 'inneranimalmedia'
      ? '/api/oauth/inneranimalmedia/start'
      : `/api/oauth/${provider}/start`;

  return {
    authorizeCmsAccess({ path, cookies }) {
      const token = cookies?.[cookieName];
      if (!token) {
        return {
          allowed: false,
          principal: null,
          reason: `${provider}_session_required`,
          challengeUrl: `${startPath}?returnTo=${encodeURIComponent(path || cmsBase)}`,
        };
      }
      return {
        allowed: true,
        principal: {
          id: `${provider}:session`,
          displayName: `${provider} user`,
          roles: ['cms_admin'],
          localDevelopment: false,
          provider,
        },
        reason: `${provider}_session`,
      };
    },
    buildLoginUrl({ returnTo }) {
      return `${startPath}?returnTo=${encodeURIComponent(returnTo || cmsBase)}`;
    },
  };
}

/**
 * Pick a prepackaged CMS auth host for first-run OAuth / identity setup.
 * `local` remains available for offline scaffolds.
 */
export function createStockCmsAuthHost(
  provider: CmsStockSignInId | 'local' | 'iam' | 'openai',
  options: { cmsBase?: string; sessionCookie?: string } = {},
): CmsAuthHost {
  const key = String(provider || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');

  if (key === 'local' || key === 'local_dev') return createLocalDevAuthHost();
  if (key === 'chatgpt' || key === 'openai') return createChatGptCmsAuthHost(options);
  if (key === 'cloudflare') return createOAuthChallengeCmsAuthHost('cloudflare', options);
  if (key === 'google') return createOAuthChallengeCmsAuthHost('google', options);
  if (key === 'inneranimalmedia' || key === 'iam') {
    return createOAuthChallengeCmsAuthHost('inneranimalmedia', options);
  }
  throw new Error(`unsupported_cms_sign_in_provider:${provider}`);
}

export function isCmsProtectedPath(pathname: string, cmsBase = '/cms'): boolean {
  const base = cmsBase.endsWith('/') ? cmsBase.slice(0, -1) : cmsBase;
  return pathname === base || pathname.startsWith(`${base}/`);
}
