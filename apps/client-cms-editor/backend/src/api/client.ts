import { mapCmsEditorBlock, mapCmsEditorBootstrap, mapCmsEditorPage, mapCmsEditorSection } from '../model';
import type { CmsEditorBlock, CmsEditorPage, CmsEditorSection } from '@inneranimalmedia/agentsam-cms-shared';
import { buildDemoCmsBootstrap } from '../demo-bootstrap';

type Json = Record<string, any>;
type ApiInit = Omit<RequestInit, 'body'> & { body?: any };

function useDemoBootstrap(projectSlug?: string) {
  const slug = String(projectSlug || '').trim().toLowerCase();
  if (slug === 'demo' || slug === 'scaffold' || slug === 'preview' || slug === '') return true;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1' || params.get('preview') === '1') return true;
  }
  return false;
}

/** Offline first-run: never hit Worker APIs (avoids "Not Found" toasts). */
function demoOk<T extends Json = Json>(payload: T = {} as T): Promise<T> {
  return Promise.resolve(payload);
}

async function api<T = Json>(path: string, init: ApiInit = {}): Promise<T> {
  if (useDemoBootstrap()) {
    return demoOk<T>({} as T);
  }
  const headers = new Headers(init.headers);
  let body = init.body;
  if (body != null && !(body instanceof FormData) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(path, { ...init, body, headers, credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || payload?.error || response.statusText || 'Request failed';
    throw Object.assign(new Error(String(message)), { status: response.status, payload });
  }
  return payload as T;
}

export async function getCmsEditorBootstrap(projectSlug: string, focusPageId?: string | null) {
  if (useDemoBootstrap(projectSlug)) {
    return mapCmsEditorBootstrap(buildDemoCmsBootstrap(projectSlug || 'demo'), projectSlug || 'demo');
  }
  try {
    const params = new URLSearchParams({ project_slug: projectSlug, site: projectSlug });
    if (focusPageId) params.set('page_id', focusPageId);
    return mapCmsEditorBootstrap(await api<Json>(`/api/cms/bootstrap?${params}`), projectSlug);
  } catch (error) {
    // Local first-run: fall back to the real editor shell with demo content.
    if (typeof window !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      return mapCmsEditorBootstrap(buildDemoCmsBootstrap(projectSlug || 'demo'), projectSlug || 'demo');
    }
    throw error;
  }
}

export async function getCmsEditorPagePreview(pageId: string, mode: 'draft' | 'published' = 'draft') {
  if (useDemoBootstrap()) {
    return demoOk({ id: pageId, preview: mode, html: null, _demo: true });
  }
  return api<Json>(`/api/cms/pages/${encodeURIComponent(pageId)}?preview=${encodeURIComponent(mode)}`);
}

export const saveCmsEditorSection = (sectionId: string, fields: Record<string, any>, css?: Record<string, any>) =>
  api(`/api/cms/sections/${encodeURIComponent(sectionId)}`, { method: 'PUT', body: { section_data: { ...fields, ...(css && Object.keys(css).length ? { css_override: css } : {}) } } });
export const renameCmsEditorSection = (sectionId: string, sectionName: string) => api(`/api/cms/sections/${encodeURIComponent(sectionId)}`, { method: 'PUT', body: { section_name: sectionName } });
export const reorderCmsEditorSections = (pageId: string, sections: CmsEditorSection[]) => api('/api/cms/sections/reorder', { method: 'POST', body: { page_id: pageId, order: sections.map((section, index) => ({ id: section.id, sort_order: (index + 1) * 10 })) } });
export const setCmsEditorSectionVisibility = (sectionId: string, visible: boolean) => api(`/api/cms/sections/${encodeURIComponent(sectionId)}/visibility`, { method: 'POST', body: { is_visible: visible ? 1 : 0 } });
export async function createCmsEditorSection(pageId: string, name: string, fields: Record<string, any>, sortOrder: number) {
  if (useDemoBootstrap()) {
    return mapCmsEditorSection({
      id: `sec_local_${Date.now()}`,
      section_name: name,
      section_type: name.toLowerCase().replace(/\s+/g, '-'),
      section_data: fields,
      is_visible: 1,
      sort_order: sortOrder,
    });
  }
  const result = await api<Json>('/api/cms/sections', { method: 'POST', body: { page_id: pageId, section_type: name.toLowerCase().replace(/\s+/g, '-'), section_name: name, section_data: fields, sort_order: sortOrder } });
  return mapCmsEditorSection(result.section || { id: result.id, section_name: name, section_type: name, section_data: fields, is_visible: 1 });
}

export async function listCmsEditorBlocks(sectionId: string) {
  if (useDemoBootstrap()) return [];
  const result = await api<Json>(`/api/cms/blocks?section_id=${encodeURIComponent(sectionId)}`);
  return (result.blocks || result.components || []).map((row: Json) => mapCmsEditorBlock(row, sectionId));
}
export async function createCmsEditorBlock(sectionId: string, type: string, data: Record<string, any>, sortOrder = 10) {
  const blockType = String(type || 'text').trim() || 'text';
  if (useDemoBootstrap()) {
    return mapCmsEditorBlock({
      id: `blk_local_${Date.now()}`,
      section_id: sectionId,
      type: blockType,
      block_type: blockType,
      data,
      sort_order: sortOrder,
      is_visible: 1,
    }, sectionId);
  }
  const result = await api<Json>('/api/cms/blocks', {
    method: 'POST',
    body: {
      section_id: sectionId,
      type: blockType,
      block_type: blockType,
      component_type: blockType,
      data,
      sort_order: sortOrder,
    },
  });
  return mapCmsEditorBlock(result.block || result.component || { id: result.id, section_id: sectionId, type: blockType, data }, sectionId);
}
export const saveCmsEditorBlock = (block: CmsEditorBlock) => api(`/api/cms/blocks/${encodeURIComponent(block.id)}`, { method: 'PUT', body: { block_data: block.data, block_type: block.type, type: block.type, component_type: block.type } });
export const setCmsEditorBlockVisibility = (blockId: string, visible: boolean) => api(`/api/cms/blocks/${encodeURIComponent(blockId)}/visibility`, { method: 'POST', body: { is_visible: visible ? 1 : 0 } });
export const reorderCmsEditorBlocks = (blocks: CmsEditorBlock[]) => api('/api/cms/blocks/reorder', { method: 'POST', body: { order: blocks.map((block, index) => ({ id: block.id, sort_order: (index + 1) * 10 })) } });

export async function createCmsEditorPage(projectSlug: string, input: { title: string; slug: string; type: string }) {
  const slug = input.slug.replace(/^\/+/, '') || 'untitled';
  if (useDemoBootstrap(projectSlug)) {
    return mapCmsEditorPage({
      id: `page_local_${Date.now()}`,
      title: input.title || 'Untitled',
      slug,
      route_path: `/${slug}`,
      page_type: input.type,
      status: 'draft',
    });
  }
  const result = await api<Json>('/api/cms/pages', { method: 'POST', body: { project_id: projectSlug, title: input.title || 'Untitled', slug, route_path: `/${slug}`, page_type: input.type, status: 'draft', content: '' } });
  return mapCmsEditorPage({ ...result, id: result.id, title: input.title, slug, route_path: result.route_path || `/${slug}`, page_type: input.type, status: 'draft' });
}
export const saveCmsEditorPageMeta = (page: CmsEditorPage) => {
  if (useDemoBootstrap()) return demoOk({ ok: true, id: page.id });
  const route = page.slug.startsWith('/') ? page.slug : `/${String(page.slug || '').replace(/^\/+/, '')}`;
  const normalizedRoute = route.length > 1 ? route.replace(/\/+$/, '') : route || '/';
  const slug = normalizedRoute === '/' ? 'home' : normalizedRoute.replace(/^\/+/, '') || 'untitled';
  return api(`/api/cms/pages/${encodeURIComponent(page.id)}`, {
    method: 'PUT',
    body: {
      title: page.title,
      route_path: normalizedRoute,
      slug,
      page_type: page.type,
      seo_title: page.metaTitle,
      meta_description: page.metaDescription,
    },
  });
};
export const publishCmsEditorPage = (pageId: string) => api(`/api/cms/pages/${encodeURIComponent(pageId)}/publish`, { method: 'POST', body: {} });
export const saveCmsEditorThemeVars = (projectSlug: string, vars: Record<string, string>) => api('/api/cms/theme-vars', { method: 'PATCH', body: { project_slug: projectSlug, vars } });

export async function getCmsEditorAssets() {
  if (useDemoBootstrap()) return [];
  const result = await api<Json>('/api/cms/assets');
  return (result.assets || []).map((asset: Json, index: number) => ({ id: asset.id || index, name: asset.original_filename || asset.filename || asset.label || 'Asset', type: String(asset.mime_type || '').startsWith('video/') ? 'Video' : String(asset.mime_type || '').includes('font') ? 'Font' : String(asset.mime_type || '').includes('pdf') ? 'Document' : 'Image', size: asset.content_size_bytes ? `${(Number(asset.content_size_bytes) / 1e6).toFixed(1)} MB` : '—', color: ['#5346db', '#d2e9df', '#ebc59d', '#25302b', '#705cf0', '#e6e0d3'][index % 6], previewUrl: asset.thumbnail_url || asset.cdn_url || asset.public_url || null }));
}
export async function getCmsEditorTemplates() {
  if (useDemoBootstrap()) {
    return [
      { id: 'tpl_baseline_landing', name: 'Landing page', type: 'page', category: 'Marketing', slug: 'landing', previewImageUrl: null, hasHtml: false },
      { id: 'tpl_baseline_hero', name: 'Editorial hero', type: 'section', category: 'Portfolio', slug: 'hero', previewImageUrl: null, hasHtml: false },
      { id: 'tpl_baseline_footer', name: 'Utility footer', type: 'section', category: 'Agency', slug: 'footer', previewImageUrl: null, hasHtml: false },
    ];
  }
  const result = await api<Json>('/api/cms/templates');
  return (result.templates || []).map((row: Json) => ({
    id: String(row.id || ''),
    name: String(row.template_name || row.iam_label || row.slug || 'Template'),
    type: String(row.template_type || 'section'),
    category: String(row.category || 'General'),
    slug: row.slug ? String(row.slug) : null,
    previewImageUrl: row.preview_image_url ? String(row.preview_image_url) : null,
    hasHtml: Boolean(row.source_html_r2_key),
  })).filter((row: { id: string }) => row.id);
}

export async function applyCmsEditorTemplate(templateId: string, input: { pageId?: string | null; projectSlug?: string | null } = {}) {
  if (useDemoBootstrap(input.projectSlug || undefined)) {
    return demoOk({ ok: true, template_id: templateId, page_id: input.pageId, _demo: true });
  }
  return api<Json>(`/api/cms/templates/${encodeURIComponent(templateId)}/apply`, {
    method: 'POST',
    body: {
      page_id: input.pageId || undefined,
      project_slug: input.projectSlug || undefined,
    },
  });
}
export async function getCmsEditorContacts() {
  if (useDemoBootstrap()) return [];
  const result = await api<Json>('/api/user/contacts');
  return (result.contacts || []).map((row: Json, index: number) => ({ id:index,name:String(row.name||row.display_name||row.email||'Contact'),email:String(row.email||''),source:String(row.source||'Contact form'),date:String(row.updated_at||row.created_at||'Recently'),tag:Array.isArray(row.tags)?row.tags[0]||'Lead':row.tag||'Lead' }));
}
export const activateCmsEditorTheme = (themeSlug: string, accent?: string) => api('/api/cms/themes/activate', { method: 'POST', body: { slug: themeSlug, accent } });
