import { createFileRoute, Navigate } from '@tanstack/react-router';

/**
 * Compatibility entry only. Route inside Local Studio instead of navigating
 * the Tauri webview to /admin/store (which is not a desktop SPA route).
 * Ecommerce CMS owns the actual Online Store, Pages and Theme Editor.
 */
function CanonicalSitesEntry() {
  return <Navigate to="/apps/ecommerce-cms-agentsam" search={{ page: '/admin/store' }} replace />;
}
export const Route = createFileRoute('/(apps)/sites')({ component: CanonicalSitesEntry });
