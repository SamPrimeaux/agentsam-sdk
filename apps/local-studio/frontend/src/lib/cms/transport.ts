import { invokeStudioService, isPackagedDesktop } from '@/lib/desktop/tauri';

/** Desktop changes only the authenticated transport. The CMS surface and adapter are shared. */
export const studioCmsFetch: typeof fetch = async (input, init = {}) => {
  if (!isPackagedDesktop()) return fetch(input, init);
  if (typeof input !== 'string' || !input.startsWith('/api/cms/')) throw new Error('cms_native_route_unsupported');
  const method = (init.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('cms_native_method_unsupported');
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
  const result = await invokeStudioService({ operation: 'cms', path: input, method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', body });
  return new Response(result.body, { status: result.status, headers: result.content_type ? { 'content-type': result.content_type } : {} });
};
