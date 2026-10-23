import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { SitesStudioPage } from '@/components/sites/SitesStudioPage';

/**
 * /sites is the existing packaged Ecommerce Online Store, not the retired
 * standalone Sites manager. A document navigation hands the route to the
 * canonical Admin Console and retains the original editor/navigation.
 */
function CanonicalSitesEntry() {
  const desktop = typeof window !== 'undefined' &&
    Boolean((window as Window & { __AGENTSAM_DESKTOP__?: boolean }).__AGENTSAM_DESKTOP__);
  useEffect(() => {
    if (desktop) return;
    const local = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    window.location.replace(local ? '/admin/store.html' : '/sites');
  }, [desktop]);
  return desktop ? <SitesStudioPage /> : null;
}
export const Route = createFileRoute('/(apps)/sites')({ component: CanonicalSitesEntry });
