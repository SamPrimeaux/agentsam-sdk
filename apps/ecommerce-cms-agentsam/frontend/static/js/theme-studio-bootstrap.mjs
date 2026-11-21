import { createThemeProjectAdapter, repairEmptyThemeBlockControls } from '/theme-editor/project.mjs';
import { createThemeEditorBridge } from '/theme-editor/bridge.mjs';
import { mountThemeEditor } from '/theme-editor/mount.mjs';
import { blankThemeProject, inheritDefaultTemplates } from '/theme-editor/starter-project.mjs';
import { fillMissingThemeChrome } from '/theme-editor/starter-chrome.mjs';
import { createCmsPageThemeEditorAdapter } from '/ecommerce-cms-agentsam/theme-editor/cms-page-adapter.mjs';
import { chooseThemeEditorSite, planThemeEditorEntry, selectableThemeEditorSites } from './theme-editor-entry-resolution.mjs';
import {
  parseThemeEditorLocation,
  themeProjectEditorPath,
  cmsPageEditorPath,
  themeEditorViewSearch,
} from '/ecommerce-cms-agentsam/theme-editor/routes.mjs';

const errorNode = document.getElementById('theme-project-error');
const frame = document.getElementById('theme-project-editor-frame');
const loading = document.getElementById('theme-project-loading');
const API = '/api/admin/cms/theme-projects';
const LEGACY_SITE_SELECTION_KEY = 'agentsam.cms.selected-site.v1';

function showError(error) {
  if (loading) loading.hidden = true;
  if (errorNode) {
    errorNode.hidden = false;
    errorNode.textContent = `Theme Studio could not open this workspace. ${error?.message || String(error)}`;
  }
  console.error('theme_studio_open_failed', error?.stack || error?.message || error);
}

async function jsonRequest(path, init = {}) {
  const response = await fetch(path, { credentials: 'include', ...init });
  let data = null;
  try { data = await response.json(); } catch { /* The HTTP status remains authoritative. */ }
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error || data?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.error || null;
    throw error;
  }
  return data || {};
}

function preserveViewState() {
  return themeEditorViewSearch(new URLSearchParams(location.search));
}

function replaceEditorUrl(path, { clearSelection = false } = {}) {
  const params = new URLSearchParams(location.search);
  if (clearSelection) { params.delete('section'); params.delete('block'); }
  const search = themeEditorViewSearch(params);
  history.replaceState(history.state, '', path + (search ? `?${search}` : ''));
}

function publishRoute(type, identity) {
  if (window.parent === window) return;
  window.parent.postMessage({
    type,
    ...identity,
    href: location.pathname + location.search,
  }, location.origin);
}

function mount(adapter, host) {
  frame.addEventListener('load', () => {
    mountThemeEditor(frame, host, { assetsBase: '/theme-editor/' })
      .then(() => { if (host.openAssistantOnStart) frame.contentWindow?.openAgentsamDrawer?.(); })
      .catch(showError);
  }, { once: true });
  frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/theme-editor/editor.css"></head><body></body></html>';
}

async function listMedia() {
  const assets = [];
  let page = 1;
  let pageCount = 1;
  do {
    const result = await jsonRequest(`/api/admin/media?view=all&page_size=100&sort=newest&page=${page}`);
    assets.push(...(result.assets || result.media || []));
    pageCount = Number(result.pagination?.pages || 1);
    page += 1;
  } while (page <= pageCount && page <= 50);
  return assets;
}

async function uploadMedia(files) {
  const form = new FormData();
  [...(files || [])].forEach(file => form.append('files', file));
  form.append('prefix', 'uploads/theme-editor/');
  const result = await jsonRequest('/api/admin/media', { method: 'POST', body: form });
  return result.assets || [];
}

function projectStore(siteId) {
  const scoped = path => path + (path.includes('?') ? '&' : '?') + 'site_id=' + encodeURIComponent(siteId);
  return {
    async get(id) {
      const result = await jsonRequest(scoped(`${API}/${encodeURIComponent(id)}`));
      return result.project;
    },
    async save(project, options = {}) {
      const expectedVersion = Number(options.expectedVersion || 0);
      const updating = expectedVersion > 0;
      const result = await jsonRequest(scoped(updating ? `${API}/${encodeURIComponent(project.id)}` : API), {
        method: updating ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(updating
          ? { site_id: siteId, project, expected_version: expectedVersion }
          : { site_id: siteId, project }),
      });
      return result.project;
    },
  };
}

async function bootProject(route) {
  const { siteId, projectId } = route;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(siteId || '')) throw new Error('theme_project_site_required');
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(projectId || '')) throw new Error('theme_project_id_invalid');

  const scoped = `${API}?site_id=${encodeURIComponent(siteId)}`;
  const listing = await jsonRequest(scoped);
  const projects = Array.isArray(listing.projects) ? listing.projects : [];
  const selected = projects.find(item => item.id === projectId);
  if (!selected) throw new Error('theme_project_not_found_for_site');

  const store = projectStore(siteId);
  let project = await store.get(projectId);
  if (!project || project.id !== projectId) throw new Error('theme_project_identity_mismatch');

  const repaired = repairEmptyThemeBlockControls(project);
  const inherited = inheritDefaultTemplates(repaired.project);
  if (repaired.changed || inherited.changed) {
    project = await store.save(inherited.project, { expectedVersion: project.revision });
  }

  const requestedPage = route.pageSlug || 'home';
  if (!project.pages.some(page => page.slug === requestedPage)) throw new Error('theme_project_page_not_found');
  const initialPage = requestedPage;
  const openAssistantOnStart = new URLSearchParams(location.search).get('assistant') === 'theme';
  const adapter = createThemeProjectAdapter(project, store, {
    resolveAssetBase: base => new URL(base, location.href).href,
    listMedia,
    uploadMedia,
  });
  const bridge = createThemeEditorBridge(adapter);
  const pageRoutes = Object.fromEntries(project.pages.filter(page =>
    /^\/(?!\/)(?:[a-z0-9_-]+\/)*$/.test(page.route || '')).map(page => [page.slug, page.route]));
  const canonicalPath = themeProjectEditorPath(siteId, projectId, initialPage);
  replaceEditorUrl(canonicalPath);

  const routeIdentity = { siteId, projectId };
  const host = {
    adapter: bridge,
    page: initialPage,
    openAssistantOnStart,
    pageRoutes,
    siteId,
    projectId,
    initialSelection: {
      section: new URLSearchParams(location.search).get('section'),
      block: new URLSearchParams(location.search).get('block'),
    },
    initialDevice: new URLSearchParams(location.search).get('previewMode'),
    initialStock: /^platform\/[a-z0-9-]{1,70}$/.test(new URLSearchParams(location.search).get('stock') || '')
      ? new URLSearchParams(location.search).get('stock') : null,
    metadata: {
      name: project.name,
      version: project.sourcePackageVersion || project.version || null,
      developer: project.sourcePackage?.split('/')?.[0]?.replace(/^@/, '') || null,
    },
    marketplace: {
      kind: new URLSearchParams(location.search).get('marketplace_kind'),
      key: new URLSearchParams(location.search).get('marketplace_key'),
    },
    showcase: new URLSearchParams(location.search).has('showcase'),
    onSelectionChange(selection) {
      const next = new URL(location.href);
      for (const [key, value] of [['section', selection.section_key], ['block', selection.block_id]])
        value ? next.searchParams.set(key, value) : next.searchParams.delete(key);
      history.replaceState(history.state, '', next.pathname + next.search);
      publishRoute('agentsam:cms-canvas:route', routeIdentity);
    },
    onDeviceChange(device) {
      const next = new URL(location.href);
      next.searchParams.set('previewMode', device);
      history.replaceState(history.state, '', next.pathname + next.search);
      publishRoute('agentsam:cms-canvas:route', routeIdentity);
    },
    onPageChange(nextPage) {
      host.page = nextPage;
      const nextPath = themeProjectEditorPath(siteId, projectId, nextPage);
      replaceEditorUrl(nextPath, { clearSelection: true });
      publishRoute('agentsam:cms-canvas:route', routeIdentity);
    },
    async onDuplicate() {
      try {
        const result = await jsonRequest(scopedProjectPath(projectId, siteId, 'duplicate'), {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
        });
        if (!result.ok || !/^[A-Za-z0-9_-]{1,160}$/.test(result.project?.id || '')) throw new Error('theme_duplicate_failed');
        location.assign(themeProjectEditorPath(siteId, result.project.id, 'home'));
      } catch (error) { showError(error); }
    },
    async onDelete() {
      try {
        const current = await store.get(projectId);
        if (!current || !Number.isInteger(current.revision)) throw new Error('theme_delete_version_missing');
        const result = await jsonRequest(`${API}/${encodeURIComponent(projectId)}?site_id=${encodeURIComponent(siteId)}`, {
          method: 'DELETE', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expected_version: current.revision }),
        });
        if (result.archived !== true) throw new Error('theme_archive_failed');
        location.assign('/admin/store');
      } catch (error) { showError(error); }
    },
    onEditCode() {
      const codeParams = new URLSearchParams({ page: '/admin/theme-code-editor', project: projectId, site_id: siteId });
      const target = window.top || window;
      const destination = '/apps/ecommerce-cms-agentsam?' + codeParams.toString();
      if (target.__AGENTSAM_DESKTOP__ || target.__TAURI_INTERNALS__) target.location.hash = '#' + destination;
      else target.location.assign(destination);
    },
  };
  publishRoute('agentsam:cms-canvas:route', routeIdentity);
  mount(adapter, host);
}

function scopedProjectPath(projectId, siteId, suffix = '') {
  return `${API}/${encodeURIComponent(projectId)}${suffix ? `/${suffix}` : ''}?site_id=${encodeURIComponent(siteId)}`;
}

async function bootCmsPage(route) {
  if (route.siteId && !/^[A-Za-z0-9_-]{1,160}$/.test(route.siteId)) throw new Error('cms_site_invalid');
  const listPath = '/api/admin/cms/pages' + (route.siteId ? `?site_id=${encodeURIComponent(route.siteId)}` : '');
  const listing = await jsonRequest(listPath);
  const site = listing.site || null;
  const siteId = route.siteId || site?.id;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(siteId || '')) throw new Error('cms_site_required');
  if (site?.id && site.id !== siteId) throw new Error('cms_site_scope_mismatch');

  const pages = (Array.isArray(listing.pages) ? listing.pages : []).filter(page => page.slug !== 'site');
  let selectedPage = route.pageId
    ? pages.find(page => page.id === route.pageId)
    : pages.find(page => page.slug === route.pageSlug);
  if (route.pageSlug === 'site') selectedPage = { id: null, slug: 'site', title: 'Website settings', route_path: '/' };
  if (!selectedPage && !route.pageId && !route.pageSlug) selectedPage = pages.find(page => page.slug === 'home') || pages[0];
  if (!selectedPage && route.pageSlug) selectedPage = pages.find(page => page.slug === route.pageSlug);
  if (!selectedPage && route.pageId === null && route.pageSlug === 'site')
    selectedPage = { id: null, slug: 'site', title: 'Website settings', route_path: '/' };
  if (!selectedPage) throw new Error('cms_page_not_found_for_site');

  const canonicalPath = cmsPageEditorPath(siteId, selectedPage.id, selectedPage.slug);
  replaceEditorUrl(canonicalPath);
  const adapter = createCmsPageThemeEditorAdapter({
    siteId,
    pagesPayload: listing,
    publicUrlResolver: window.cmsEditorStorefrontUrl,
  });
  const pageRoutes = Object.fromEntries(pages.filter(page => page.route_path || page.route || page.live_route)
    .map(page => [page.slug, page.route_path || page.route || page.live_route]));
  const routeIdentity = { siteId, pageId: selectedPage.id || null };
  const host = {
    adapter,
    page: selectedPage.slug,
    pageRoutes,
    siteId,
    capabilities: { publish: true },
    metadata: { name: site?.name || 'Website' },
    marketplace: {
      kind: new URLSearchParams(location.search).get('marketplace_kind'),
      key: new URLSearchParams(location.search).get('marketplace_key'),
    },
    showcase: new URLSearchParams(location.search).has('showcase'),
    initialSelection: {
      section: new URLSearchParams(location.search).get('section'),
      block: new URLSearchParams(location.search).get('block'),
    },
    initialDevice: new URLSearchParams(location.search).get('previewMode'),
    initialStock: /^platform\/[a-z0-9-]{1,70}$/.test(new URLSearchParams(location.search).get('stock') || '')
      ? new URLSearchParams(location.search).get('stock') : null,
    onSelectionChange(selection) {
      const next = new URL(location.href);
      for (const [key, value] of [['section', selection.section_key], ['block', selection.block_id]])
        value ? next.searchParams.set(key, value) : next.searchParams.delete(key);
      history.replaceState(history.state, '', next.pathname + next.search);
      publishRoute('agentsam:cms-page-editor:route', routeIdentity);
    },
    onDeviceChange(device) {
      const next = new URL(location.href);
      next.searchParams.set('previewMode', device);
      history.replaceState(history.state, '', next.pathname + next.search);
      publishRoute('agentsam:cms-page-editor:route', routeIdentity);
    },
    onPageChange(nextSlug) {
      const nextPage = pages.find(page => page.slug === nextSlug);
      if (!nextPage?.id) { showError(new Error('cms_page_not_found_for_site')); return; }
      host.page = nextPage.slug;
      routeIdentity.pageId = nextPage.id;
      replaceEditorUrl(cmsPageEditorPath(siteId, nextPage.id, nextPage.slug), { clearSelection: true });
      publishRoute('agentsam:cms-page-editor:route', routeIdentity);
    },
  };
  publishRoute('agentsam:cms-page-editor:route', routeIdentity);
  mount(adapter, host);
}

/** A missing site is a normal entry state, not an editor crash. */
async function chooseSiteForEntry(route, { marketplace = false } = {}) {
  const data = await jsonRequest('/api/admin/cms/sites');
  const sites = selectableThemeEditorSites(data.sites);
  const rememberedSiteId = (() => { try { return sessionStorage.getItem(LEGACY_SITE_SELECTION_KEY); } catch { return null; } })();
  const choice = chooseThemeEditorSite({sites, requestedSiteId:route.siteId||null,
    rememberedSiteId, requireSelection:marketplace && !route.siteId});
  if (choice.site) return choice.site;
  if (!['site_selection_required','no_sites'].includes(choice.reason)) throw new Error(choice.reason);
  const picker = document.getElementById('theme-project-site-picker');
  if (!picker) throw new Error('theme_editor_site_picker_missing');
  if (loading) loading.hidden = true;
  if (errorNode) errorNode.hidden = true;
  frame.hidden = true;
  picker.hidden = false;
  picker.querySelector('h1').focus();
  const list = picker.querySelector('[data-site-list]');
  list.replaceChildren();
  if (!sites.length) {
    picker.querySelector('[data-site-description]').textContent = 'Create a website before configuring an app embed.';
    const link = document.createElement('a');
    link.href = '/admin/pages';
    link.textContent = 'Go to Pages';
    list.append(link);
    return null;
  }
  return new Promise(resolve => {
    for (const site of sites) {
      const button = document.createElement('button');
      button.type = 'button';
      const name = document.createElement('strong');
      name.textContent = site.name || site.slug || 'Website';
      const detail = document.createElement('span');
      detail.textContent = [site.primary_domain || site.slug,site.status === 'draft' ? 'Draft' : ''].filter(Boolean).join(' · ');
      button.append(name,detail);
      button.addEventListener('click',()=>{
        picker.hidden = true;
        frame.hidden = false;
        if (loading) loading.hidden = false;
        resolve(site);
      },{once:true});
      list.append(button);
    }
  });
}

async function bootLegacyPage(route) {
  const marketplace = new URLSearchParams(location.search).get('marketplace_kind') === 'cms_embed';
  const site = await chooseSiteForEntry(route,{marketplace});
  if (!site) return;
  const siteId = site.id;
  const listing = await jsonRequest(`/api/admin/cms/pages?site_id=${encodeURIComponent(siteId)}`);
  const projectsResult = marketplace ? {projects:[]} : await jsonRequest(`${API}?site_id=${encodeURIComponent(siteId)}`);
  const slug = route.pageSlug || 'home';
  if (slug === 'site') return bootCmsPage({ mode: 'page', siteId, pageId: null, pageSlug: 'site' });
  try { sessionStorage.setItem(LEGACY_SITE_SELECTION_KEY, siteId); } catch { /* Selection is still explicit in the canonical route. */ }
  const plan = planThemeEditorEntry({
    site,
    location: location.href,
    projects: projectsResult.projects || [],
    pages: listing.pages || [],
  });
  if (plan.kind === 'unavailable') throw new Error(plan.reason || 'theme_editor_target_not_found');
  if (plan.resource === 'empty-site') {
    location.replace(plan.to);
    return;
  }
  const target = parseThemeEditorLocation(new URL(plan.to, location.origin));
  if (target.mode === 'theme-project') return bootProject(target);
  if (target.mode === 'project') return bootProject(target);
  if (target.mode === 'page') return bootCmsPage(target);
  throw new Error('theme_editor_target_not_found');
}

async function bootNewTheme(route) {
  const site = await chooseSiteForEntry(route);
  if (!site) return;
  const siteId = site.id;
  const siteName = String(site.name || 'My website').trim() || 'My website';
  // A new theme is an account-owned editable project, not a prewritten
  // merchant website. Reuse the existing stock chrome and system templates;
  // AgentSam opens to author the design after the draft has been created.
  const draft = blankThemeProject({ name: 'New theme', purpose: '', audience: '', siteName });
  const scopedDraft = fillMissingThemeChrome(draft, siteName);
  const { project } = inheritDefaultTemplates(scopedDraft);
  const created = await jsonRequest(API + '?site_id=' + encodeURIComponent(siteId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ site_id: siteId, project }),
  });
  if (!created.project?.id) throw new Error(created.error || 'theme_project_create_failed');
  try { sessionStorage.setItem(LEGACY_SITE_SELECTION_KEY, siteId); } catch { /* Route remains site-scoped. */ }
  location.replace(themeProjectEditorPath(siteId, created.project.id, 'home') + '?assistant=theme');
}

async function boot() {
  if (!frame) throw new Error('theme_editor_frame_missing');
  const route = parseThemeEditorLocation(location);
  if (route.mode === 'new') return bootNewTheme(route);
  if (route.mode === 'project') return bootProject(route);
  if (route.mode === 'page' && route.legacy) return bootLegacyPage(route);
  if (route.mode === 'page') return bootCmsPage(route);
  throw new Error('theme_editor_mode_invalid');
}

boot().catch(showError);
