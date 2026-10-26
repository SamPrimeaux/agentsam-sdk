import { invokeStudioService } from '@/lib/desktop/tauri';
import { resolveEcommerceAdminPath } from './ecommerce-routing';
import { isStudioAdminPath } from '../../../../shared/studio-admin-routes.mjs';

export function consoleDestination(path: string): string | null {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\#]/.test(path)) return null;
  const url = new URL(path, 'https://console.invalid');
  if (url.origin !== 'https://console.invalid') return null;
  if (isStudioAdminPath(url.pathname) || /^\/(mail|settings|artifacts|tickets|collaborate|sites|chats)(\/|$)/.test(url.pathname)) return path;
  const product = resolveEcommerceAdminPath(path);
  return product ? '/apps/ecommerce-cms-agentsam?page=' + encodeURIComponent(product) : null;
}

/** Same-origin installed console adapter; native transport attaches the secured session. */
export function createDesktopConsoleHost(navigate: (path: string) => void) {
  return {
    navigate(path: string) {
      // The child already maps product destinations; validate its proposed route again.
      if (path.startsWith('/apps/ecommerce-cms-agentsam?')) {
        const page = new URL(path, 'https://console.invalid').searchParams.get('page');
        const resolved = page && resolveEcommerceAdminPath(page);
        if (resolved) navigate('/apps/ecommerce-cms-agentsam?page=' + encodeURIComponent(resolved));
      } else {
        const destination = consoleDestination(path);
        if (destination) navigate(destination);
      }
    },
    activateAssistant() { navigate('/admin/agentsam'); },
    async request(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/admin/')) throw new Error('Console request outside installed application');
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
      const result = await invokeStudioService({ operation: 'commerce', path: url.pathname + url.search, method, body, body_base64, content_type: contentType });
      if (result.status === 401) throw new Error('Sign in to AgentSam from Account settings, then retry.');
      return new Response(result.body, { status: result.status, headers: { 'content-type': result.content_type || 'application/json' } });
    },
  };
}

declare global {
  interface Window { agentsamConsoleHost?: ReturnType<typeof createDesktopConsoleHost>; }
}
