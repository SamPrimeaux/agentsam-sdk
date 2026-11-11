// Site-owned public URL resolver shared by CMS page editors. Never use the AgentSam admin origin.
(function (scope) {
  function cmsPublicSiteOrigin(site) {
    const value = typeof site?.primary_domain === 'string' && site.primary_domain.trim()
      ? site.primary_domain : site?.domain;
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const address = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value);
      if (address.protocol !== 'https:' || address.username || address.password ||
          address.port || address.pathname !== '/' || address.search || address.hash ||
          !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(address.hostname) ||
          !address.hostname.includes('.')) return null;
      return address.origin;
    } catch { return null; }
  }
  function cmsPublicPageUrl(site, routePath) {
    const origin = cmsPublicSiteOrigin(site);
    if (!origin || typeof routePath !== 'string') return null;
    const valid = routePath === '/' || /^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/?$/i.test(routePath);
    return valid ? origin + routePath : null;
  }
  scope.cmsPublicSiteOrigin = cmsPublicSiteOrigin;
  scope.cmsPublicPageUrl = cmsPublicPageUrl;
})(window);
