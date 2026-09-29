/**
 * Provider-neutral auth/identity host contract for protecting /cms.
 * Local scaffolds may use a clearly identified local-development principal.
 * Consumers wire OAuth/OIDC/GitHub App/their identity service later without
 * rebuilding route protection.
 */
export type CmsPrincipal = {
  id: string;
  displayName?: string;
  email?: string;
  roles?: string[];
  /** True when this is an explicit local-dev principal, not production identity. */
  localDevelopment?: boolean;
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
 * Default local auth host: allows /cms with the local-dev principal.
 * Replace with a real OAuth/OIDC host before production deploy.
 */
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

export function isCmsProtectedPath(pathname: string, cmsBase = '/cms'): boolean {
  const base = cmsBase.endsWith('/') ? cmsBase.slice(0, -1) : cmsBase;
  return pathname === base || pathname.startsWith(`${base}/`);
}
