/**
 * Serialize Theme Studio selection for the mini AgentSam transport.
 *
 * This is untrusted UI context, not a login/session or publication authority.
 * packages/identity authenticates the actor on the server; the host resolves
 * site ownership and cms_page_sections identity before invoking any tools.
 */
export function buildThemeStudioAssistantContext(resource) {
  if (!resource?.sectionKey || !resource?.page) throw new Error('Choose a CMS section first.');
  const siteId = typeof resource.siteId === 'string' ? resource.siteId.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(siteId)) {
    throw new Error('Choose an authorized CMS site first.');
  }
  const sectionKey = String(resource.sectionKey);
  const page = String(resource.page);
  const field = resource.fieldKey || null;
  const context = {
    page: '/admin/theme-editor',
    surface: 'theme-studio',
    site_id: siteId,
    slug: resource.ownerSlug,
    workflow_key: 'cms_section_review',
    ...(resource.linked && resource.ownerSlug !== 'site'
      ? { selected_resource: {
        type: 'section', id: sectionKey, label: resource.label,
        page, site_id: siteId, surface: 'theme-studio'
      } }
      : { annotation: {
        id: sectionKey, label: resource.label, page, surface: 'theme-studio',
        text: resource.currentValue ?? ''
      } }),
  };
  const selectionInfo = {
    section: sectionKey,
    field,
    current_value: typeof resource.currentValue === 'string'
      ? resource.currentValue.slice(0, 2000) : null,
    request_type: field ? 'review selected field' : 'review selected section',
  };
  return {
    context,
    selectionInfo,
    conversationKey: JSON.stringify([siteId, page, sectionKey]),
  };
}
