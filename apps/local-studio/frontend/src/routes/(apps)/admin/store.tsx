import { createFileRoute } from '@tanstack/react-router';
import { EcommerceAppView } from '../apps/ecommerce-cms-agentsam';

/**
 * Online Store is the existing installed Ecommerce CMS, mounted at a clean
 * account-admin address. The iframe uses the packaged product asset to avoid
 * recursively loading this shell at /admin/store.
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
    return <EcommerceAppView search={{ ...search, page: '/admin/store' }} forcePackagedAsset />;
  },
});
