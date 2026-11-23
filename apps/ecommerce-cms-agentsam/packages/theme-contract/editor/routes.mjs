const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,160}$/;
const VIEW_KEYS = ['section', 'block', 'previewMode', 'stock', 'marketplace_kind', 'marketplace_key', 'showcase'];

function decodeSegment(value) {
  try { return decodeURIComponent(value); } catch { return ''; }
}

function validSegment(value) {
  return typeof value === 'string' && SAFE_SEGMENT.test(value);
}

export function parseThemeEditorLocation(input) {
  const url = input instanceof URL ? input : new URL(input?.href || String(input), 'https://agentsam.invalid');
  const embeddedRoute = url.searchParams.get('editor_route');
  if (embeddedRoute) {
    const nested = new URL(embeddedRoute, url.origin);
    if (nested.origin !== url.origin || !nested.pathname.startsWith('/admin/')) throw new Error('theme_editor_route_invalid');
    for (const key of VIEW_KEYS) {
      const value = url.searchParams.get(key);
      if (value && !nested.searchParams.has(key)) nested.searchParams.set(key, value);
    }
    return parseThemeEditorLocation(nested);
  }
  const parts = url.pathname.split('/').filter(Boolean).map(decodeSegment);
  const query = url.searchParams;

  if (parts[0] === 'admin' && parts[1] === 'sites' && validSegment(parts[2]) && parts[3] === 'themes' && parts[4] === 'new' && parts[5] === 'editor' && parts.length === 6) {
    return { mode: 'new', siteId: parts[2], legacy: false };
  }

  if (parts[0] === 'admin' && parts[1] === 'sites' && parts[2] && parts[3] === 'themes' && parts[4] && parts[5] === 'editor') {
    const [, , siteId, , projectId] = parts;
    const pageSlug = parts[6] || 'home';
    if (!validSegment(siteId) || !validSegment(projectId) || !validSegment(pageSlug))
      throw new Error('theme_editor_route_invalid');
    return { mode: 'project', siteId, projectId, pageSlug, legacy: false };
  }

  if (parts[0] === 'admin' && parts[1] === 'sites' && parts[2] && parts[3] === 'pages' && parts[4] && parts[5] === 'editor') {
    const [, , siteId, , pageId] = parts;
    if (!validSegment(siteId) || !validSegment(pageId)) throw new Error('theme_editor_route_invalid');
    return { mode: 'page', siteId, pageId, pageSlug: query.get('slug') || null, legacy: false };
  }

  if (parts[0] === 'admin' && parts[1] === 'sites' && parts[2] && parts[3] === 'settings' && parts[4] === 'editor') {
    const [, , siteId] = parts;
    if (!validSegment(siteId)) throw new Error('theme_editor_route_invalid');
    return { mode: 'page', siteId, pageId: null, pageSlug: 'site', legacy: false };
  }

  if (url.pathname === '/admin/theme-project-editor') {
    const siteId = query.get('site_id');
    const projectId = query.get('project') || query.get('project_id');
    if (query.get('new') === '1') return { mode: 'new', siteId, legacy: true };
    if (!validSegment(siteId) || !validSegment(projectId)) throw new Error('theme_project_route_identity_required');
    const pageSlug = query.get('page') || 'home';
    if (!validSegment(pageSlug)) throw new Error('theme_editor_page_invalid');
    return { mode: 'project', siteId, projectId, pageSlug, legacy: true };
  }

  if (url.pathname === '/admin/theme-editor') {
    const projectId = query.get('project') || query.get('project_id');
    const siteId = query.get('site_id');
    if (query.get('new') === '1') {
      if (siteId && !validSegment(siteId)) throw new Error('theme_editor_site_invalid');
      return { mode: 'new', siteId, legacy: true };
    }
    if (projectId) {
      if (!validSegment(siteId) || !validSegment(projectId)) throw new Error('theme_project_route_identity_required');
      const pageSlug = query.get('page') || query.get('slug') || 'home';
      if (!validSegment(pageSlug)) throw new Error('theme_editor_page_invalid');
      return { mode: 'project', siteId, projectId, pageSlug, legacy: true };
    }
    const pageId = query.get('page_id');
    const pageSlug = query.get('slug') || null;
    if (siteId && !validSegment(siteId)) throw new Error('theme_editor_site_invalid');
    if (pageId && !validSegment(pageId)) throw new Error('theme_editor_page_invalid');
    if (pageSlug && !validSegment(pageSlug)) throw new Error('theme_editor_page_invalid');
    return { mode: 'page', siteId, pageId, pageSlug, legacy: true };
  }

  throw new Error('theme_editor_route_not_found');
}

export function themeProjectEditorPath(siteId, projectId, pageSlug = 'home') {
  if (!validSegment(siteId) || !validSegment(projectId) || !validSegment(pageSlug))
    throw new Error('theme_editor_route_invalid');
  return `/admin/sites/${encodeURIComponent(siteId)}/themes/${encodeURIComponent(projectId)}/editor/${encodeURIComponent(pageSlug)}`;
}

export function cmsPageEditorPath(siteId, pageId, pageSlug = null) {
  if (!validSegment(siteId)) throw new Error('theme_editor_route_invalid');
  if (pageSlug === 'site') return `/admin/sites/${encodeURIComponent(siteId)}/settings/editor`;
  if (!validSegment(pageId)) throw new Error('theme_editor_route_invalid');
  return `/admin/sites/${encodeURIComponent(siteId)}/pages/${encodeURIComponent(pageId)}/editor`;
}

export function themeEditorViewSearch(search) {
  const source = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  const target = new URLSearchParams();
  for (const key of VIEW_KEYS) {
    const value = source.get(key);
    if (value && value.length <= 180) target.set(key, value);
  }
  return target.toString();
}
