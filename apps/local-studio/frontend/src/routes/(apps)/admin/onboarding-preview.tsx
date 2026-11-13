import { createFileRoute } from '@tanstack/react-router';
import { EcommerceAppView } from '../apps/ecommerce-cms-agentsam';

/**
 * First customer journey is owned by the existing Ecommerce CMS product.
 * The account/site session remains in its D1 preview table, not in purchases.
 */
export const Route = createFileRoute('/(apps)/admin/onboarding-preview')({
  validateSearch: (params: Record<string, unknown>) => ({
    site_id: typeof params.site_id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(params.site_id)
      ? params.site_id : undefined,
    preview_id: typeof params.preview_id === 'string' && /^cprev_[a-f0-9]{24}$/.test(params.preview_id)
      ? params.preview_id : undefined,
  }),
  component: function CheckoutExperiencePreview() {
    const search=Route.useSearch();
    return <EcommerceAppView search={{...search,page:'/admin/onboarding-preview'}} forcePackagedAsset />;
  },
});
