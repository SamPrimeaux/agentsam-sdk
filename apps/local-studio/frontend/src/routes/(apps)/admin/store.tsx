import { createFileRoute, Navigate } from '@tanstack/react-router';
import { EcommerceAppView } from './apps/ecommerce-cms-agentsam';
import { themeStoreTrySelection } from '@/lib/apps/theme-store-selection';
import { OnlineStorePage } from '@/components/store/OnlineStorePage';

/**
 * Online Store is a native page in the global shell. Only a Theme Store
 * Try/install hand-off (theme_sku, action, stock) still goes through the
 * installed Ecommerce receiver, which validates release readiness.
 */
export const Route = createFileRoute('/(apps)/admin/store')({
  validateSearch: (params: Record<string, unknown>) => ({
    site_id: typeof params.site_id === 'string' ? params.site_id : undefined,
    theme_sku: typeof params.theme_sku === 'string' ? params.theme_sku : undefined,
    theme_version: typeof params.theme_version === 'string' ? params.theme_version : undefined,
    action: params.action === 'try' ? 'try' as const : undefined,
    stock: typeof params.stock === 'string' && /^platform\/[a-z0-9-]{1,70}$/.test(params.stock)
      ? params.stock : undefined,
  }),
  component: function InstalledOnlineStore() {
    const search = Route.useSearch();
    if (search.theme_sku || search.action || search.stock || search.theme_version)
      return <EcommerceAppView search={{ ...search, page: '/admin/store' }} />;
    return <OnlineStorePage siteId={search.site_id} />;
  },
});
