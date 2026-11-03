import { createFileRoute, Navigate, useLocation } from '@tanstack/react-router';

/**
 * Compatibility entry only. Route inside Local Studio instead of navigating
 * the Tauri webview to /admin/store (which is not a desktop SPA route).
 * Ecommerce CMS owns the actual Online Store, Pages and Theme Editor.
 */
function CanonicalSitesEntry() {
  const location = useLocation();
  const params = new URLSearchParams(location.searchStr);
  const sku = params.get('theme_sku') || '';
  const version = params.get('theme_version') || '';
  // Keep the public Theme Store's chosen package when following the Sites
  // compatibility route. The authenticated receiver checks release readiness.
  const selected = /^iam\.theme\.[a-z][a-z0-9-]{0,63}$/.test(sku)
    ? { theme_sku: sku, ...(/^\d+\.\d+\.\d+$/.test(version) ? { theme_version: version } : {}) }
    : {};
  return <Navigate to="/apps/ecommerce-cms-agentsam" search={{ page: '/admin/store', ...selected }} replace />;
}
export const Route = createFileRoute('/(apps)/sites')({ component: CanonicalSitesEntry });
