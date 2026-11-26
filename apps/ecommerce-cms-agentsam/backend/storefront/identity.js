import { createPortableD1IdentityAdapter } from '@inneranimalmedia/agentsam-sdk/identity/adapters/portable-d1';
import { createRouteRegistry, defineRouteProjection } from '@inneranimalmedia/agentsam-sdk/identity/contracts/routes';
import { createIdentityService, handleIdentityWorkerRequest } from '@inneranimalmedia/agentsam-sdk/identity/server/worker-router';
import { createCredentialResolver } from '@inneranimalmedia/agentsam-vault/resolver';
import { openVaultRow } from '@inneranimalmedia/agentsam-vault/crypto';
import { getCompany } from '../lib/company.js';
import { loadStorePreferences } from '../admin/store.js';
import storefrontIdentityRoutes from './identity-routes.json' with { type: 'json' };

const CUSTOMER_SESSION_COOKIE = '__Host-iam-storefront-customer';
const PORTAL_ASSETS = Object.freeze({
  '/auth/login': '/identity-portal/pages/login.html',
  '/auth/signup': '/identity-portal/pages/signup.html',
  '/auth/reset': '/identity-portal/pages/reset.html',
});

const storefrontIdentityApp = Object.freeze({ id: storefrontIdentityRoutes.appId });
const storefrontIdentityRegistry = createRouteRegistry([
  defineRouteProjection({
    appId: storefrontIdentityRoutes.appId,
    routes: storefrontIdentityRoutes.routes,
  }),
]);

function objectValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function loadStorefrontIdentityContext(env, hostname) {
  const loaded = await loadStorePreferences(env, { hostname, allowCache: false });
  if (!loaded?.ok || !loaded.site) return null;

  let baseCompany = null;
  try {
    const companyTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'company' LIMIT 1",
    ).first();
    if (companyTable) baseCompany = await getCompany(env).catch(() => null);
  } catch {
    baseCompany = null;
  }
  const settings = loaded.settings || {};
  const baseMeta = objectValue(baseCompany?.meta);
  const publicMeta = {
    privacyUrl: baseMeta.privacyUrl || null,
    termsUrl: baseMeta.termsUrl || null,
    contactUrl: baseMeta.contactUrl || null,
  };
  const identityCompany = {
    id: loaded.site.id,
    name: loaded.site.name || baseCompany?.name || 'Store',
    logoUrl: settings.navLogoUrl || baseCompany?.logoUrl || null,
    faviconUrl: settings.faviconUrl || baseCompany?.faviconUrl || null,
    authBgColor: settings.authBgColor || baseCompany?.authBgColor || null,
    tagline: settings.tagline || baseCompany?.tagline || null,
    supportEmail: settings.supportEmail || baseCompany?.supportEmail || null,
    websiteUrl: loaded.site.primary_domain
      ? `https://${loaded.site.primary_domain}`
      : baseCompany?.websiteUrl || null,
    meta: baseMeta,
  };
  const publicCompany = {
    id: identityCompany.id,
    name: identityCompany.name,
    logoUrl: identityCompany.logoUrl,
    faviconUrl: identityCompany.faviconUrl,
    authBgColor: identityCompany.authBgColor,
    tagline: identityCompany.tagline,
    supportEmail: identityCompany.supportEmail,
    websiteUrl: identityCompany.websiteUrl,
    meta: publicMeta,
  };
  return { loaded, identityCompany, publicCompany };
}

function createStorefrontCredentialResolver(env, company) {
  const accountId = company?.meta?.credentials?.transactional_email?.vault_account_id
    || company?.meta?.credentials?.transactional_email?.account_id
    || null;
  const resolver = createCredentialResolver({
    env,
    envMap: { resend: 'RESEND_API_KEY' },
    async lookupVaultMeta({ provider }) {
      if (!accountId || !env?.DB || provider !== 'resend') return null;
      try {
        const row = await env.DB.prepare(
          `SELECT id, metadata_json FROM user_secrets
           WHERE account_id = ? AND service_name = ? AND is_active = 1
           ORDER BY updated_at DESC LIMIT 1`,
        ).bind(accountId, provider).first();
        if (!row?.id) return null;
        const metadata = objectValue(row.metadata_json);
        return { ref: row.id, last4: metadata.last4 || null };
      } catch {
        return null;
      }
    },
    async unwrap(ref) {
      if (!accountId || !env?.DB) return null;
      const row = await env.DB.prepare(
        `SELECT id, account_id, secret_name, service_name, secret_value_encrypted, metadata_json
         FROM user_secrets WHERE id = ? AND account_id = ? AND is_active = 1`,
      ).bind(ref, accountId).first();
      if (!row) return null;
      const value = await openVaultRow(
        env,
        row,
        `${row.account_id}:${row.service_name}:${row.secret_name}`,
      );
      await env.DB.prepare(
        `UPDATE user_secrets
         SET last_used_at = unixepoch(), usage_count = COALESCE(usage_count, 0) + 1
         WHERE id = ? AND account_id = ?`,
      ).bind(row.id, accountId).run();
      return value;
    },
  });
  return ({ provider, capability }) => resolver.resolve({ provider, capability });
}

function withStorefrontCompany(adapter, company) {
  const scoped = Object.create(null);
  for (const [property, value] of Object.entries(adapter)) {
    scoped[property] = typeof value === 'function' ? value.bind(adapter) : value;
  }
  scoped.getCompanyByHost = async () => company;
  scoped.getDefaultCompany = async () => company;
  return scoped;
}

export async function handleStorefrontIdentityCompanyApi(request, env, url = new URL(request.url)) {
  if (url.pathname !== '/api/storefront/identity/company' || request.method !== 'GET') return null;
  if (!env?.DB) return Response.json({ ok: false, error: 'storefront_identity_unavailable' }, { status: 503 });
  try {
    const context = await loadStorefrontIdentityContext(env, url.hostname);
    if (!context) return Response.json({ ok: false, error: 'store_not_found' }, { status: 404 });
    return Response.json(
      { ok: true, company: context.publicCompany },
      { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } },
    );
  } catch {
    return Response.json({ ok: false, error: 'storefront_identity_unavailable' }, { status: 503 });
  }
}

export async function handleStorefrontIdentityRequest(request, env, url = new URL(request.url)) {
  const path = url.pathname;
  const isIdentityRoute = path.startsWith('/auth/') || path.startsWith('/api/auth/') || path.startsWith('/api/oauth/');
  if (!isIdentityRoute) return null;
  if (!env?.DB) return Response.json({ ok: false, error: 'storefront_identity_unavailable' }, { status: 503 });

  try {
    const context = await loadStorefrontIdentityContext(env, url.hostname);
    if (!context) return Response.json({ ok: false, error: 'store_not_found' }, { status: 404 });

    const baseAdapter = createPortableD1IdentityAdapter(env.DB, {
      scopeId: context.loaded.site.id,
      mirrorAccounts: false,
    });
    const adapter = withStorefrontCompany(baseAdapter, context.identityCompany);
    const identity = createIdentityService({
      adapter,
      app: storefrontIdentityApp,
      routeRegistry: storefrontIdentityRegistry,
      cookieName: CUSTOMER_SESSION_COOKIE,
    });

    return await handleIdentityWorkerRequest(request, env, {
      adapter,
      identity,
      app: storefrontIdentityApp,
      routeRegistry: storefrontIdentityRegistry,
      cookieName: CUSTOMER_SESSION_COOKIE,
      kv: env.CMS_CACHE,
      resolveCredential: createStorefrontCredentialResolver(env, context.identityCompany),
      portalAssetPaths: PORTAL_ASSETS,
    });
  } catch (error) {
    console.error('storefront_identity_request_failed', error?.code || error?.message || 'unknown');
    return Response.json({ ok: false, error: 'storefront_identity_unavailable' }, { status: 503 });
  }
}
