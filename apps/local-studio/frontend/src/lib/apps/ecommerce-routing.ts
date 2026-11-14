// The Ecommerce product owns its admin routes. This file only enforces which
// of those product routes may be launched through the Local Studio app host.
// @ts-ignore The product exposes a JavaScript route manifest as a public entry.
import { ADMIN_ROUTE_MANIFEST } from '@inneranimalmedia/ecommerce-cms-agentsam/backend/routes';

type AdminRoute = { id: string; path: string; surface?: string; handler?: string; page?: string; asset?: string };
const adminRoutes = ADMIN_ROUTE_MANIFEST as AdminRoute[];
const excluded = new Set(['admin.scaffold', 'admin.agentsam', 'admin.login']);
const idParam = /^[a-zA-Z0-9_-]{1,160}$/;

function isRoute(pathname: string, template: string) {
  const a = pathname.split('/');
  const b = template.split('/');
  return a.length === b.length && a.every((value, index) =>
    b[index].startsWith(':') ? idParam.test(value) : value === b[index]);
}

/** Reject arbitrary URLs; treat this as an app route, not a proxy allow-all. */
export function resolveEcommerceAdminPath(candidate = '/admin/store') {
  if (!candidate.startsWith('/admin/') || candidate.startsWith('//') || /[\\#]/.test(candidate)) return null;
  let url: URL;
  try { url = new URL(candidate, 'https://ecommerce-route.invalid'); } catch { return null; }
  if (url.origin !== 'https://ecommerce-route.invalid' || !adminRoutes.some((route) =>
    !excluded.has(route.id) && isRoute(url.pathname, route.path))) return null;
  const safe = new URLSearchParams();
  // Keep query validation on the product-owned routes, not the UI shell.
  // The actual Page Editor uses ?slug=..., while the Theme Editor accepts
  // ?slug=...&showcase=... (the catalog's generated preview link) and
  // ?slug=...&catalog=revise (its section-library entry).
  const recognized: Record<string, readonly string[]> = {
    '/admin/pages': ['site_id'],
    '/admin/theme-editor': ['slug', 'site', 'site_id', 'page_id', 'showcase', 'catalog', 'source'],
    '/admin/page-edit': ['slug', 'site_id', 'page_id'],
    '/admin/theme-project-editor': ['project','site_id','page','section','block','previewMode','new','scope'],
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
    // Site-bound + New remains a site-owned creation intent. Theme Studio is
    // a separate account-owned scope and must never carry a site_id.
    if (url.searchParams.has('new') &&
        (url.searchParams.get('new') !== '1' ||
         !url.searchParams.has('site_id') || url.searchParams.has('project') || url.searchParams.has('scope'))) return null;
    if (url.searchParams.has('scope') &&
        (url.searchParams.get('scope') !== 'studio' || !url.searchParams.has('project') ||
         url.searchParams.has('site_id') || url.searchParams.has('new'))) return null;
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

/** Resolve bundled files from the same product manifest used by the hosted Worker. */
export function resolveEcommerceAssetPath(candidate: string): string | null {
  const safe = resolveEcommerceAdminPath(candidate);
  if (!safe) return null;
  const url = new URL(safe, 'https://console.invalid');
  const route = adminRoutes.find(route => isRoute(url.pathname, route.path));
  if (route?.handler === 'admin-spa') return '/ecommerce-cms-agentsam/admin/_spa/index.html?__route=' + encodeURIComponent(url.pathname.slice('/admin'.length) + url.search);
  if (route?.handler === 'admin-html' && route.page) return '/ecommerce-cms-agentsam/admin/' + route.page + '.html' + url.search;
  return null;
}
