import { isPackagedDesktop } from '@/lib/desktop/tauri';
import { isEcommerceAdminPath, resolveEcommerceAdminPath, resolveEcommerceAssetPath } from './ecommerce-routing';
import { toast } from 'sonner';
import { isStudioAdminPath } from '../../../../shared/studio-admin-routes.mjs';

export function consoleDestination(path: string): string | null {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\#]/.test(path)) return null;
  const url = new URL(path, 'https://console.invalid');
  if (url.origin !== 'https://console.invalid') return null;
  // Ecommerce routes must win before the broad /admin shell route matcher:
  // Theme Studio and Product Studio are hosted under /admin but render from
  // the installed Ecommerce package, not the Local Studio shell fallback.
  const product = resolveEcommerceAdminPath(path);
  if (product) {
    if (isPackagedDesktop() && !resolveEcommerceAssetPath(product)) return null;
    return '/apps/ecommerce-cms-agentsam?page=' + encodeURIComponent(product);
  }
  if (isEcommerceAdminPath(url.pathname)) return null;
  if (isStudioAdminPath(url.pathname) || /^\/(mail|settings|artifacts|tickets|collaborate|sites|chats)(\/|$)/.test(url.pathname)) return path;
  return null;
}

/** Same-origin installed console adapter; native transport attaches the secured session. */
export function createDesktopConsoleHost(navigate: (path: string) => void) {
  return {
    navigate(path: string) {
      // Validate before leaving the current screen. A rejected/stale destination
      // is a contextual failure, not an empty page or a silent no-op.
      let destination: string | null = null;
      if (path.startsWith('/apps/ecommerce-cms-agentsam?')) {
        const url = new URL(path, 'https://console.invalid');
        const page = url.searchParams.get('page');
        const resolved = page && resolveEcommerceAdminPath(page);
        if (resolved && (!isPackagedDesktop() || resolveEcommerceAssetPath(resolved))) {
          destination = '/apps/ecommerce-cms-agentsam?page=' + encodeURIComponent(resolved);
        }
      } else {
        destination = consoleDestination(path);
      }
      if (destination) {
        navigate(destination);
      } else {
        toast.error('This page cannot open in the current desktop app.', {
          description: 'You are still on your previous screen. Check for an app update or try another destination.',
        });
      }
    },
    activateAssistant() { navigate('/admin/agentsam'); },
    async request(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.origin !== window.location.origin) throw new Error('Console request outside installed application');
      if (!url.pathname.startsWith('/api/')) throw new Error('Console request route is not an application API');
      // The shared desktop fetch adapter transports the authenticated request.
      // The Worker remains authoritative for route handling and authorization.
      return fetch(request);
    },
  };
}

declare global {
  interface Window { agentsamConsoleHost?: ReturnType<typeof createDesktopConsoleHost>; }
}
