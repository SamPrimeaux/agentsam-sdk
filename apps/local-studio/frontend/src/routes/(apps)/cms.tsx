import { createFileRoute, Navigate } from '@tanstack/react-router';

/**
 * Website management is owned by Ecommerce CMS AgentSam.
 * /cms remains a compatibility entry point only; never render the retired
 * parallel CMS editor here. Let the Ecommerce host choose an authorized
 * installed Worker rather than carrying a content-only site's query through.
 */
export const Route = createFileRoute('/(apps)/cms')({
  component: CanonicalWebsiteManagementRoute,
});

function CanonicalWebsiteManagementRoute() {
  return (
    <Navigate
      to="/apps/ecommerce-cms-agentsam"
      search={{ page: '/admin/store' }}
      replace
    />
  );
}
