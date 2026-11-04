import { createThemeProjectAdapter } from '/theme-editor/project.mjs';
import { createThemeEditorBridge } from '/theme-editor/bridge.mjs';
import { mountThemeEditor } from '/theme-editor/mount.mjs';

const errorNode = document.getElementById('theme-project-error');
const frame = document.getElementById('theme-project-editor-frame');
const parameters = new URLSearchParams(location.search);
const projectId = parameters.get('project');
const siteId = parameters.get('site_id');
const pageSlug = parameters.get('page');
const API = '/api/admin/cms/theme-projects';
const scoped = path => siteId ? path + (path.includes('?') ? '&' : '?') +
  'site_id=' + encodeURIComponent(siteId) : path;

function showError(error) {
  errorNode.hidden = false;
  errorNode.textContent = error instanceof Error ? error.message : String(error);
}

async function jsonRequest(path, init = {}) {
  const response = await fetch(path, { credentials: 'include', ...init });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data || {};
}

async function listMedia() {
  const assets = [];
  let page = 1;
  let pages = 1;
  do {
    const data = await jsonRequest(`/api/admin/media?view=all&page_size=100&sort=newest&page=${page}`);
    assets.push(...(data.assets || data.media || []));
    pages = Number(data.pagination?.pages || 1);
    page += 1;
  } while (page <= pages && page <= 50);
  return assets;
}

async function uploadMedia(files) {
  const form = new FormData();
  [...(files || [])].forEach((file) => form.append('files', file));
  form.append('prefix', 'uploads/theme-editor/');
  const data = await jsonRequest('/api/admin/media', { method: 'POST', body: form });
  return data.assets || [];
}

const store = {
  async get(id) {
    const data = await jsonRequest(scoped(`${API}/${encodeURIComponent(id)}`));
    return data.project;
  },
  async save(project, options = {}) {
    const expectedVersion = Number(options.expectedVersion || 0);
    const updating = expectedVersion > 0;
    const data = await jsonRequest(scoped(updating ? `${API}/${encodeURIComponent(project.id)}` : API), {
      method: updating ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updating ?
        { project, expected_version: expectedVersion, site_id:siteId } :
        { project, site_id:siteId }),
    });
    return data.project;
  },
};

async function boot() {
  // Private installed drafts cannot be addressed by project ID alone:
  // another site may contain an independent copy with the same project ID.
  if (!siteId || !/^[A-Za-z0-9_-]{1,160}$/.test(siteId)) throw new Error('theme_project_site_required');
  if (!projectId || !/^[A-Za-z0-9_-]{1,160}$/.test(projectId)) throw new Error('theme_project_id_invalid');
  if (pageSlug && !/^[a-z][a-z0-9-]{0,63}$/.test(pageSlug)) throw new Error('theme_project_page_invalid');
  const project = (await store.get(projectId));
  if (!project) throw new Error('theme_project_not_found');
  if (pageSlug && !project.pages.some(page=>page.slug===pageSlug))
    throw new Error('theme_project_page_not_in_site');
  const initialPage=pageSlug ||
    project.pages.find(page=>page.slug==='home')?.slug || project.pages[0]?.slug;
  if (!initialPage) throw new Error('theme_project_empty');
  const adapter = createThemeProjectAdapter(project, store, {
    resolveAssetBase: (base) => new URL(base, location.href).href,
    listMedia,
    uploadMedia,
  });
  const bridge = createThemeEditorBridge(adapter);
  frame.addEventListener('load', () => {
    mountThemeEditor(frame, {
      adapter: bridge,
      page: initialPage,
    }, { assetsBase: '/theme-editor/' }).catch(showError);
  }, { once: true });
  frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/theme-editor/editor.css"></head><body></body></html>';
}

boot().catch(showError);
