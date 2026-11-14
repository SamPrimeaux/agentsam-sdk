import { createFileRoute, Navigate, useLocation } from '@tanstack/react-router';

/**
 * Compatibility entry only. /admin/store is the canonical installed Studio
 * app entry on web and desktop; Ecommerce CMS still owns its pages, theme
 * editor and site-scoped data APIs. No duplicate storefront is created.
 */
function CanonicalSitesEntry() {
  const location = useLocation();
  const params = new URLSearchParams(location.searchStr);
  const sku = params.get('theme_sku') || '';
  const version = params.get('theme_version') || '';
  const action: 'try' | undefined = params.get('action') === 'try' ? 'try' : undefined;
  const siteId = params.get('site_id') || '';
  // Keep the public Theme Store's chosen package when following the Sites
  // compatibility route. The authenticated receiver checks release readiness.
  const validTheme = /^iam\.theme\.[a-z][a-z0-9-]{0,63}$/.test(sku);
  const selected = {
    site_id: validTheme && /^[A-Za-z0-9_-]{1,160}$/.test(siteId) ? siteId : undefined,
    theme_sku: validTheme ? sku : undefined,
    theme_version: validTheme && /^\d+\.\d+\.\d+$/.test(version) ? version : undefined,
    action: validTheme && action === 'try' ? 'try' as const : undefined,
    stock: undefined,
  };
  return <Navigate to="/admin/store" search={selected} replace />;
}
export const Route = createFileRoute('/(apps)/sites')({ component: CanonicalSitesEntry });
