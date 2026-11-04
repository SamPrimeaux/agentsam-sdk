import { createThemeProjectAdapter } from '/theme-editor/project.mjs';
import { createThemeEditorBridge } from '/theme-editor/bridge.mjs';
import { mountThemeEditor } from '/theme-editor/mount.mjs';

const errorNode = document.getElementById('theme-project-error');
const frame = document.getElementById('theme-project-editor-frame');
const parameters = new URLSearchParams(location.search);
let projectId = parameters.get('project');
let siteId = parameters.get('site_id');
const pageSlug = parameters.get('page');
const API = '/api/admin/cms/theme-projects';
const scoped = path => siteId ? path + (path.includes('?') ? '&' : '?') +
  'site_id=' + encodeURIComponent(siteId) : path;

function showError(error) {
  errorNode.hidden = false;
  errorNode.textContent = 'Your theme could not be opened. Please return to Online Store and try again.';
  console.error('theme_project_open_failed',error);
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
  if (!siteId || !/^[A-Za-z0-9_-]{1,160}$/.test(siteId)) {
    const overview=await jsonRequest('/api/admin/store/online');
    siteId=overview.selected_site_id;
  }
  if (!siteId) { location.replace('/admin/store'); return; }
  // List only this site's authorized projects before accepting a URL hint.
  const listing=await jsonRequest(scoped(API));
  const projects=Array.isArray(listing.projects)?listing.projects:[];
  const selected=projects.find(item=>item.id===projectId) || projects[0];
  if (!selected) { location.replace('/admin/store?site_id='+encodeURIComponent(siteId)); return; }
  projectId=selected.id;
  const canonical=new URL(location.href);
  canonical.searchParams.set('site_id',siteId);
  canonical.searchParams.set('project',projectId);
  history.replaceState(history.state,'',canonical.pathname+canonical.search);
  const project = await store.get(projectId);
  if (!project || project.id!==projectId) throw new Error('theme_project_identity_mismatch');
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
      siteId,
      projectId,
      initialSelection:{section:parameters.get('section'),block:parameters.get('block')},
      initialDevice:parameters.get('previewMode'),
      onSelectionChange(selection) {
        const next=new URL(location.href);
        for(const [key,value] of [['section',selection.section_key],['block',selection.block_id]])
          value?next.searchParams.set(key,value):next.searchParams.delete(key);
        history.replaceState(history.state,'',next.pathname+next.search);
      },
      onDeviceChange(device) {
        const next=new URL(location.href);
        next.searchParams.set('previewMode',device);
        history.replaceState(history.state,'',next.pathname+next.search);
      },
      onPageChange(nextPage) {
        const next=new URL(location.href);
        next.searchParams.set('page',nextPage);
        ['section','block'].forEach(key=>next.searchParams.delete(key));
        history.replaceState(history.state,'',next.pathname+next.search);
      },
      metadata: {
        name: project.name,
        version: project.sourcePackageVersion || project.version || null,
        developer: project.sourcePackage?.split('/')?.[0]?.replace(/^@/, '') || null,
      },

    }, { assetsBase: '/theme-editor/' }).catch(showError);
  }, { once: true });
  frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/theme-editor/editor.css"></head><body></body></html>';
}

boot().catch(showError);
