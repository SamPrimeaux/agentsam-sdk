import { invokeStudioService, isPackagedDesktop } from '@/lib/desktop/tauri';
import { resolveEcommerceAdminPath, resolveEcommerceAssetPath } from './ecommerce-routing';
import { toast } from 'sonner';
import { isStudioAdminPath } from '../../../../shared/studio-admin-routes.mjs';

export function consoleDestination(path: string): string | null {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\#]/.test(path)) return null;
  const url = new URL(path, 'https://console.invalid');
  if (url.origin !== 'https://console.invalid') return null;
  if (isStudioAdminPath(url.pathname) || /^\/(mail|settings|artifacts|tickets|collaborate|sites|chats)(\/|$)/.test(url.pathname)) return path;
  const product = resolveEcommerceAdminPath(path);
  // The installed desktop must be able to render the destination, not merely
  // recognize its route. Never navigate into a known-unrenderable product page.
  if (!product || (isPackagedDesktop() && !resolveEcommerceAssetPath(product))) return null;
  return '/apps/ecommerce-cms-agentsam?page=' + encodeURIComponent(product);
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
      const operation = url.pathname.startsWith('/api/admin/') ? 'commerce'
        : url.pathname.startsWith('/api/work/') || url.pathname === '/api/projects' || url.pathname.startsWith('/api/projects/')
          ? 'work' : null;
      if (!operation) throw new Error('Console request route is not installed');
      // Browser/local-preview mode already has a same-origin Worker API. The
      // native service bridge carries the saved desktop session for Commerce
      // and Work APIs; the native side validates each route independently.
      if (!isPackagedDesktop()) return fetch(request);
      const method = request.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      const contentType = request.headers.get('content-type') || '';
      let body: unknown;
      let body_base64: string | undefined;
      if (method !== 'GET' && method !== 'DELETE' || request.body) {
        const bytes = new Uint8Array(await request.arrayBuffer());
        if (bytes.length > 24 * 1024 * 1024) throw new Error('Console upload exceeds 24 MiB');
        if (contentType.includes('application/json') && bytes.length) body = JSON.parse(new TextDecoder().decode(bytes));
        else if (bytes.length) {
          let binary = '';
          for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
          body_base64 = btoa(binary);
        }
      }
      const result = await invokeStudioService({ operation, path: url.pathname + url.search, method, body, body_base64, content_type: contentType });
      if (result.status === 401) throw new Error('Sign in to AgentSam from Account settings, then retry.');
      return new Response(result.body, { status: result.status, headers: { 'content-type': result.content_type || 'application/json' } });
    },
  };
}

declare global {
  interface Window { agentsamConsoleHost?: ReturnType<typeof createDesktopConsoleHost>; }
}
