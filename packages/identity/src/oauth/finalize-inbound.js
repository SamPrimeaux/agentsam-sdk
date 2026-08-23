/**
 * Portable inbound OAuth finalize orchestration (Google/GitHub → session).
 * Storage and IAM-specific D1 effects are injected via ports — see adapters in the host app.
 */

/**
 * @typedef {import('../core/sessions.js').InboundOAuthInput} InboundOAuthInput
 * @typedef {import('../core/sessions.js').InboundOAuthSuccess} InboundOAuthSuccess
 * @typedef {import('../core/sessions.js').InboundOAuthFailure} InboundOAuthFailure
 */

/**
 * @typedef {object} InboundOAuthFinalizePorts
 * @property {(env: unknown) => boolean} hasDatabase
 * @property {(env: unknown, profile: object, opts: { allowCreate: boolean }) => Promise<{ authUserId?: string, created?: boolean, row?: object }>} ensureAppUser
 * @property {(env: unknown, authUserId: string, name: string) => Promise<void>} updateUserNameIfEmpty
 * @property {(env: unknown, request: Request, ctx: object) => Promise<{ ok: boolean, reason?: string }>} ensureIdentityPlaneBeforeSession
 * @property {(request: Request, env: unknown) => Promise<void>} revokeIncomingCookieSession
 * @property {(request: Request, env: unknown, authUserId: string, sessionProvider: string, opts: object) => Promise<unknown>} createLoginSession
 * @property {(loginSession: unknown) => { sessionId: string, sessionToken: string, tenantId?: string|null, workspaceId?: string|null, d1SessionPersisted?: boolean }} normalizeLoginSessionResult
 * @property {(env: unknown, authUserId: string) => Promise<string|null>} resolveTenantAtLogin
 * @property {(env: unknown, authUserId: string) => Promise<string|null>} resolveCanonicalWorkspace
 * @property {(env: unknown) => string|null|undefined} getPlatformWorkspaceEnvId
 * @property {(env: unknown, ctx: object) => Promise<void>} runPostLoginD1Effects
 * @property {(tag: string, message: string, meta?: unknown) => void} [logWarn]
 * @property {(tag: string, message: string, meta?: unknown) => void} [logError]
 */

/**
 * @param {InboundOAuthFinalizePorts} ports
 * @returns {import('../core/sessions.js').InboundOAuthFinalizeFn}
 */
export function createFinalizeInboundOAuth(ports) {
  if (!ports || typeof ports.ensureAppUser !== 'function') {
    throw new Error('createFinalizeInboundOAuth_requires_ports');
  }

  const logWarn = ports.logWarn ?? (() => {});
  const logError = ports.logError ?? (() => {});

  return async function finalizeInboundOAuth(env, request, input) {
    const provider = String(input?.provider || '').trim();
    const sessionProvider = String(input?.sessionProvider || provider).trim() || provider;
    const oauthEmail = String(input?.email || '')
      .toLowerCase()
      .trim();
    const name = String(input?.name || oauthEmail.split('@')[0] || 'User').trim();
    const providerUid = String(input?.providerUid || '').trim();
    const supabaseUserId =
      input?.supabaseUserId != null && String(input.supabaseUserId).trim()
        ? String(input.supabaseUserId).trim()
        : null;
    const source = String(input?.source || `${provider}_oauth`).trim();
    const pageContext = String(input?.pageContext || '/dashboard/agent').trim();

    if (!ports.hasDatabase(env) || !oauthEmail || !provider || !providerUid) {
      return /** @type {InboundOAuthFailure} */ ({ ok: false, error: 'provision_failed' });
    }

    const ensured = await ports.ensureAppUser(
      env,
      {
        email: oauthEmail,
        name,
        supabaseUserId,
        provider,
        provider_uid: providerUid,
        source,
      },
      { allowCreate: true },
    );
    if (!ensured?.authUserId) {
      return { ok: false, error: 'provision_failed' };
    }
    const authUserId = String(ensured.authUserId).trim();

    try {
      await ports.updateUserNameIfEmpty(env, authUserId, name);
    } catch (e) {
      logWarn(`finalizeInboundOAuth/${provider}`, 'name update', e?.message ?? e);
    }

    const identityOk = await ports.ensureIdentityPlaneBeforeSession(env, request, {
      authUserId,
      email: oauthEmail,
      name,
      source,
      provider,
      providerSubject: providerUid,
      supabaseUserId: supabaseUserId || undefined,
    });
    if (!identityOk?.ok) {
      if (ensured.created) {
        return { ok: false, error: 'provision_failed' };
      }
      logWarn(
        `finalizeInboundOAuth/${provider}`,
        'identity plane skipped for existing user',
        identityOk?.reason ?? 'unknown',
      );
    }

    await ports.revokeIncomingCookieSession(request, env);

    let loginSession;
    try {
      loginSession = await ports.createLoginSession(request, env, authUserId, sessionProvider, {
        providerSubject: providerUid,
        fallbackUserRow: {
          ...(ensured.row && typeof ensured.row === 'object' ? ensured.row : {}),
          email: oauthEmail,
          name: ensured.row?.name ?? name,
        },
      });
    } catch (e) {
      logError(`finalizeInboundOAuth/${provider}`, 'createLoginSession failed', e?.message ?? e);
      return { ok: false, error: 'session_failed' };
    }

    const {
      sessionId,
      sessionToken,
      tenantId: sessionTenantId,
      workspaceId: sessionWorkspaceId,
      d1SessionPersisted,
    } = ports.normalizeLoginSessionResult(loginSession);

    const ensuredRow = ensured.row && typeof ensured.row === 'object' ? ensured.row : {};
    const tenantId =
      sessionTenantId ??
      (await ports.resolveTenantAtLogin(env, authUserId).catch(() => null)) ??
      (ensuredRow.active_tenant_id || ensuredRow.tenant_id || null);
    const workspaceId =
      sessionWorkspaceId ??
      (await ports.resolveCanonicalWorkspace(env, authUserId)) ??
      ports.getPlatformWorkspaceEnvId(env) ??
      (ensuredRow.active_workspace_id || ensuredRow.default_workspace_id || null);

    if (!d1SessionPersisted) {
      logWarn(
        `finalizeInboundOAuth/${provider}`,
        'post-login D1 side effects skipped during overload',
      );
    } else {
      await ports.runPostLoginD1Effects(env, {
        provider,
        authUserId,
        sessionId,
        tenantId,
        workspaceId,
        pageContext,
      });
    }

    return /** @type {InboundOAuthSuccess} */ ({
      ok: true,
      authUserId,
      sessionId,
      sessionToken,
      tenantId,
    });
  };
}
