/**
 * CMS site catalogs come from the authenticated site authority, never a
 * compiled-in list of customer names or example domains.
 */
export async function loadAuthorizedCmsSiteCatalog(transport) {
  const response = await transport('/api/cms/websites', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(response.status === 401 ? 'cms_session_required' : 'cms_site_discovery_unavailable');
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.websites)) throw new Error('cms_site_catalog_invalid');
  const seen = new Set();
  return payload.websites
    .filter((site) => site && typeof site.slug === 'string' && /^[a-zA-Z0-9_-]+$/.test(site.slug) && !['__proto__', 'constructor', 'prototype'].includes(site.slug))
    .filter((site) => {
      if (seen.has(site.slug)) return false;
      seen.add(site.slug);
      return true;
    })
    .map((site) => ({
      id: site.slug,
      slug: site.slug,
      name: typeof site.name === 'string' && site.name.trim() ? site.name : site.slug,
      domain: typeof site.domain === 'string' && site.domain.trim() ? site.domain : null,
      page_count: Number(site.page_count || 0),
    }));
}

export function selectAuthorizedCmsSite(sites, requestedSlug) {
  const requested = String(requestedSlug || '').trim();
  return sites.find((site) => site.slug === requested) || sites[0] || null;
}
