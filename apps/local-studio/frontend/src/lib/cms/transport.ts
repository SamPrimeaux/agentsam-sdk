/**
 * CMS data stays owned by the CMS Worker. Desktop only changes how same-origin
 * /api requests reach the configured service; it does not implement CMS routes.
 */
export const studioCmsFetch: typeof fetch = async (input, init = {}) => {
  if (typeof input !== 'string' || !input.startsWith('/api/cms/') || input.startsWith('//')) {
    throw new Error('cms_route_invalid');
  }
  return fetch(input, { credentials: 'same-origin', ...init });
};
