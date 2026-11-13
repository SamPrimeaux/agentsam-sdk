import { createFileRoute, Navigate } from '@tanstack/react-router';

/**
 * Website management is owned by Ecommerce CMS AgentSam.
 * /cms remains a compatibility entry point only; never render the retired
 * parallel CMS editor here. Let the Ecommerce host choose an authorized
 * installed Worker through the canonical /admin/store entry.
 */
export const Route = createFileRoute('/(apps)/cms')({
  component: CanonicalWebsiteManagementRoute,
});

function CanonicalWebsiteManagementRoute() {
  return (
    <Navigate
      to="/admin/store"
      replace
    />
  );
}
