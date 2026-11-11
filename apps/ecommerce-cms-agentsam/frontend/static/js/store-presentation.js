/* Resolve one account-scoped Online Store preview authority.
 * A published CMS site always outranks an unrelated starter/installed draft.
 */
(function(scope) {
  'use strict';
  function chooseStorePresentation(data) {
    const selected = String(data?.selected_site_id || '');
    const preview = data?.site_preview;
    const publishedSite = selected && preview?.site_id === selected &&
      preview?.status === 'published' &&
      typeof preview?.url === 'string' &&
      /^https:\/\/[^\s<>"']+$/.test(preview.url);
    if (publishedSite) return {kind:'site',record:preview};
    const theme = data?.active_theme || data?.preview_theme;
    return theme ? {kind:'theme',record:theme} : {kind:'empty',record:null};
  }
  scope.cmsStorePresentation = {chooseStorePresentation};
})(window);
