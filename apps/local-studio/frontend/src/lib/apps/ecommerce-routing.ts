// Local Studio owns canonical Ecommerce admin paths and query validation.
// The Ecommerce package contributes only the packaged document/SPA assets.
// @ts-ignore Shared host route contract is plain ESM consumed by the Worker too.
import {
  LOCAL_STUDIO_ECOMMERCE_ADMIN_ROUTES,
  resolveLocalStudioEcommerceAdminRoute,
} from '../../../../shared/ecommerce-admin-routes.mjs';

type AdminRoute = { id: string; path: string; surface: string; handler: string; asset: string | null; page?: string | null };
const adminRoutes = LOCAL_STUDIO_ECOMMERCE_ADMIN_ROUTES as AdminRoute[];
const idParam = /^[a-zA-Z0-9_-]{1,160}$/;

/** Reject arbitrary URLs; the Local Studio route contract is the allowlist. */
export function resolveEcommerceAdminPath(candidate = '/admin/store') {
  if (!candidate.startsWith('/admin/') || candidate.startsWith('//') || /[\\#]/.test(candidate)) return null;
  let url: URL;
  try { url = new URL(candidate, 'https://ecommerce-route.invalid'); } catch { return null; }
  if (url.origin !== 'https://ecommerce-route.invalid' || !resolveLocalStudioEcommerceAdminRoute(url.pathname)) return null;
  const safe = new URLSearchParams();
  // Site identity is supplied by Local Studio. Query validation is retained at
  // this host boundary so packaged assets never become an open proxy.
  const recognized: Record<string, readonly string[]> = {
    '/admin/pages': ['site_id'],
    '/admin/theme-editor': ['slug', 'site', 'site_id', 'page_id', 'showcase', 'catalog', 'source'],
    '/admin/page-edit': ['slug', 'site_id', 'page_id'],
    '/admin/theme-project-editor': ['project','site_id','page','section','block','previewMode','new'],
    '/admin/product-edit': ['id','site_id'],
    '/admin/products': ['view','site_id','collection_id'],
    '/admin/collections': ['site_id'],
    '/admin/collections/new': ['site_id'],
    '/admin/inventory': ['site_id'],
    '/admin/store': ['site_id'],
    '/admin/onboarding-preview': ['site_id', 'preview_id'],
    '/admin/content': ['kind'],
    '/admin/email': ['folder'],
  };
  const studioProductRoute = /^\/admin\/products\/create\/[A-Za-z0-9_-]+$/.test(url.pathname);
  const allowed = recognized[url.pathname] || (studioProductRoute
    ? ['site_id', 'resume', 'collection_id']
    : url.pathname === '/admin/products/create'
      ? ['site_id', 'collection_id']
      : /^\/admin\/collections\/[A-Za-z0-9_-]+$/.test(url.pathname)
        ? ['site_id']
        : []);
  if ([...url.searchParams.keys()].some((name) => !allowed.includes(name) || url.searchParams.getAll(name).length !== 1)) return null;
  if (url.pathname === '/admin/theme-project-editor') {
    if (url.searchParams.has('new') &&
        (url.searchParams.get('new') !== '1' || !url.searchParams.has('site_id') || url.searchParams.has('project'))) return null;
    if (url.searchParams.has('previewMode') &&
        !['desktop', 'tablet', 'mobile'].includes(url.searchParams.get('previewMode') || '')) return null;
  }
  for (const [name, value] of url.searchParams) {
    if (!idParam.test(value)
      || (name === 'view' && !['store', 'collections', 'platform'].includes(value))
      || (name === 'kind' && !['image', 'video', 'model', 'file'].includes(value))
      || (name === 'folder' && !['sent', 'inbox'].includes(value))
      || (name === 'catalog' && value !== 'revise')) return null;
    safe.set(name, value);
  }
  return url.pathname + (safe.size ? '?' + safe.toString() : '');
}

/** Resolve packaged assets only after Local Studio has accepted the route. */
export function resolveEcommerceAssetPath(candidate: string): string | null {
  const safe = resolveEcommerceAdminPath(candidate);
  if (!safe) return null;
  const url = new URL(safe, 'https://console.invalid');
  const route = resolveLocalStudioEcommerceAdminRoute(url.pathname) as AdminRoute | null;
  if (!route?.asset) return null;
  // Host React routes may embed only their explicitly supported packaged page.
  if (route.surface === 'host' && !['admin.store', 'admin.home'].includes(route.id)) return null;
  if (route.handler === 'admin-spa') return '/ecommerce-cms-agentsam/admin/_spa/index.html?__route=' + encodeURIComponent(url.pathname.slice('/admin'.length) + url.search);
  if (route.handler === 'admin-html') return '/ecommerce-cms-agentsam/admin/' + route.asset + url.search;
  return null;
}
