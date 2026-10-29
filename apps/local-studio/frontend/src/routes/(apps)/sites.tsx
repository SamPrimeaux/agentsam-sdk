import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';

/**
 * Compatibility entry only. The ecommerce CMS owns the store experience at
 * /admin/store across browser, local development, and desktop-hosted surfaces.
 */
function CanonicalSitesEntry() {
  useEffect(() => {
    window.location.replace('/admin/store' + window.location.search);
  }, []);
  return null;
}
export const Route = createFileRoute('/(apps)/sites')({ component: CanonicalSitesEntry });
