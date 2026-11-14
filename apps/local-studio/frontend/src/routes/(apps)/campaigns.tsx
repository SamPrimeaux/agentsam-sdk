import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';

/**
 * Backwards-compatible route alias. Growth's actual owner is the
 * ecommerce-cms-agentsam SPA, not the old standalone campaign draft studio.
 * Preserve the old implementation source; do not expose two competing UIs.
 */
const GROWTH_ROUTE = '/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fgrowth';
function CampaignsRedirect() {
  useEffect(() => { window.location.replace(GROWTH_ROUTE); }, []);
  return <main role="status" className="p-8 text-sm">Opening Growth in Commerce CMS…
    <a className="ml-2 underline" href={GROWTH_ROUTE}>Open Growth</a>
  </main>;
}
export const Route = createFileRoute('/(apps)/campaigns')({ component: CampaignsRedirect });
