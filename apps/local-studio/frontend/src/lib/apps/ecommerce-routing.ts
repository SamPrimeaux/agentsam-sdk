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
  const recognized = url.pathname === '/admin/theme-editor' ? 'slug'
    : url.pathname === '/admin/product-edit' ? 'id'
    : url.pathname === '/admin/products' ? 'view'
    : url.pathname === '/admin/email' ? 'folder' : null;
  if ([...url.searchParams.keys()].some((name) => name !== recognized)) return null;
  if (recognized && url.searchParams.has(recognized)) {
    const value = url.searchParams.get(recognized) || '';
    if (!idParam.test(value) || (recognized === 'view' && !['collections', 'platform'].includes(value)) || (recognized === 'folder' && !['sent', 'inbox'].includes(value))) return null;
    safe.set(recognized, value);
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
