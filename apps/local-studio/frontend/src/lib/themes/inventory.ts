import bundled from 'virtual:agentsam-theme-inventory';
import type { SettingsTheme } from '@inneranimalmedia/agentsam-settings/contracts';
import { THEME_PROJECTS_CHANGED } from './projects';
// @ts-ignore Public portable JavaScript theme authoring contract.
import { THEME_PROJECT_SCHEMA, extractThemePage, validateThemeProject, renderThemePage } from '@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/project';
import { getActiveThemeId, setActiveThemeId, themeProjectStore } from './projects';

const draftPreviews = new Map<string, { stamp: string; url: string }>();
function draftPreview(project: any) {
  const cached = draftPreviews.get(project.id);
  if (cached && cached.stamp === project.updatedAt) return cached.url;
  if (cached) URL.revokeObjectURL(cached.url);
  const url = URL.createObjectURL(new Blob([renderThemePage(project.pages[0], project.tokens, {
    baseUrl: project.pages[0].assetBase ? new URL(project.pages[0].assetBase, location.href).href : undefined,
  })], { type: 'text/html' }));
  draftPreviews.set(project.id, { stamp: project.updatedAt, url });
  return url;
}

export type BundledTheme = SettingsTheme & { pages: { slug: string; title: string; url: string }[] };
async function registryRequest(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(String(payload?.error || `theme_request_failed_${response.status}`));
  }
  return payload;
}

const activeThemeVariableNames = new Set<string>();

function applyThemeVariables(theme: SettingsTheme | undefined) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const key of activeThemeVariableNames) root.style.removeProperty(key);
  activeThemeVariableNames.clear();
  if (theme?.cssVars) {
    for (const [key, value] of Object.entries(theme.cssVars)) {
      if (/^--[a-zA-Z0-9_-]{1,78}$/.test(key) && typeof value === 'string' && value.length <= 120) {
        root.style.setProperty(key, value);
        activeThemeVariableNames.add(key);
      }
    }
  }
  window.dispatchEvent(new CustomEvent('iam:invalidate-active-theme-fetch'));
}

function apiTheme(value: any): SettingsTheme {
  return {
    ...value,
    id: String(value.id),
    name: String(value.name || 'Untitled theme'),
    packageName: String(value.packageName || 'Theme library'),
    category: String(value.category || value.themeFamily || 'Theme'),
    swatches: Array.isArray(value.swatches) ? value.swatches : [],
    cssVars: value.cssVars && typeof value.cssVars === 'object' ? value.cssVars : {},
    capabilities: value.capabilities || { preview: true, editable: value.source === 'account-custom', duplicable: true, publishable: false },
  } as SettingsTheme;
}

/** Apply the account's active cms_themes record to the host shell without
 * triggering draft migration or loading the full Theme Studio inventory. */
export async function applyActiveStudioTheme(): Promise<SettingsTheme | null> {
  if (typeof window === 'undefined') return null;
  const registry = await registryRequest('/api/studio/themes');
  const activeId = registry?.activeThemeId ? String(registry.activeThemeId) : '';
  if (!activeId || !Array.isArray(registry?.themes)) {
    applyThemeVariables(undefined);
    return null;
  }
  const activeTheme = registry.themes.map(apiTheme).find((theme: SettingsTheme) => theme.id === activeId) || null;
  applyThemeVariables(activeTheme || undefined);
  return activeTheme;
}

/** The live DB registry is authoritative. A failed project-draft endpoint must
 * never take the entire Settings snapshot down; bundled packages remain a safe fallback. */
export async function listStudioThemes(): Promise<SettingsTheme[]> {
  if (typeof window === 'undefined') return bundled as SettingsTheme[];

  const [registryResult, projectsResult, localActiveResult] = await Promise.allSettled([
    registryRequest('/api/studio/themes'),
    themeProjectStore.list(),
    getActiveThemeId(),
  ]);
  const registry = registryResult.status === 'fulfilled' ? registryResult.value : null;
  const projects = projectsResult.status === 'fulfilled' ? projectsResult.value : [];
  const localActiveId = localActiveResult.status === 'fulfilled' ? localActiveResult.value : undefined;
  const registryActiveId = registry?.activeThemeId ? String(registry.activeThemeId) : undefined;

  const catalogThemes: SettingsTheme[] = Array.isArray(registry?.themes)
    ? registry.themes.map(apiTheme)
    : [];
  if (registryResult.status === 'fulfilled') {
    applyThemeVariables(registryActiveId ? catalogThemes.find(theme => theme.id === registryActiveId) : undefined);
  }
  const installedBySource = new Map<string, any>();
  for (const project of projects) {
    if (!project.sourceThemeId) continue;
    const preferredId = 'theme_' + project.sourceThemeId;
    if (project.id === preferredId || !installedBySource.has(project.sourceThemeId)) {
      installedBySource.set(project.sourceThemeId, project);
    }
  }
  const packages = (bundled as BundledTheme[]).map((theme) => ({
    ...theme,
    draftId: installedBySource.get(theme.id)?.id,
  }));
  const drafts: SettingsTheme[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    packageName: project.sourcePackage || 'Local theme project',
    version: `Draft · r${Number(project.revision || 0)}`,
    previewUrl: draftPreview(project),
    category: project.sourceThemeId ? 'Installed draft' : 'Draft',
    source: 'cms-draft' as const,
    status: `Saved in CMS · revision ${Number(project.revision || 0)}`,
    swatches: Object.values(project.tokens || {}).filter((v): v is string => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)),
    capabilities: { preview: true, editable: true, duplicable: true, publishable: false },
  }));
  const all = [...catalogThemes, ...packages, ...drafts];
  return all.map((theme) => ({
    ...theme,
    active: theme.id === registryActiveId || theme.id === localActiveId || Boolean(theme.active),
  }));
}

async function buildThemeProject(descriptor: BundledTheme, name: string, id: string) {
  if (!descriptor.pages?.length) throw new Error('This package has no editable page source');
  const tokens: Record<string, string> = {};
  const pages = await Promise.all(descriptor.pages.map(async (page, i) => {
    const response = await fetch(page.url);
    if (!response.ok) throw new Error(`Theme source unavailable: ${page.url}`);
    const html = await response.text();
    for (const match of html.matchAll(/(--[a-zA-Z0-9-]+)\\s*:\\s*([^;{}]+)[;]/g)) {
      if (!tokens[match[1]]) tokens[match[1]] = match[2].trim();
    }
    return extractThemePage(html, {
      slug: page.slug.replace(/[^a-zA-Z0-9_-]/g, '_') || `page_${i}`,
      title: page.title,
      baseUrl: new URL('.', new URL(page.url, location.href)).pathname,
    });
  }));
  const now = new Date().toISOString();
  return validateThemeProject({
    schema: THEME_PROJECT_SCHEMA,
    id,
    name,
    pages,
    tokens,
    sourceThemeId: descriptor.id,
    sourcePackage: descriptor.packageName,
    sourcePackageVersion: descriptor.version,
    sourcePreviewUrl: descriptor.previewUrl,
    version: '0.1.0',
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export async function installThemeDraft(id: string, name?: string) {
  const descriptor = (bundled as BundledTheme[]).find((theme) => theme.id === id);
  if (!descriptor) throw new Error('theme_package_not_found');
  const project = await buildThemeProject(descriptor, name || descriptor.name, 'theme_' + descriptor.id);
  return themeProjectStore.install(descriptor.id, project, {
    packageName: descriptor.packageName,
    packageVersion: descriptor.version || '1.0.0',
    previewUrl: descriptor.previewUrl,
  });
}

export async function createThemeDraft(id: string | null, name: string) {
  let source = id ? await themeProjectStore.get(id) : undefined;
  if (!source && id) {
    const descriptor = (bundled as BundledTheme[]).find((theme) => theme.id === id);
    if (!descriptor) throw new Error('This package has no editable page source');
    source = await buildThemeProject(descriptor, descriptor.name, 'theme_' + descriptor.id);
  }
  if (!source) {
    const now = new Date().toISOString();
    source = {
      schema: THEME_PROJECT_SCHEMA,
      id: 'theme_' + crypto.randomUUID().replaceAll('-', ''),
      name,
      version: '0.1.0',
      revision: 0,
      createdAt: now,
      updatedAt: now,
      tokens: {},
      pages: [extractThemePage('<!doctype html><html><head><title>New theme</title></head><body><main><section><h1>New theme</h1><p>Start with your content.</p></section></main></body></html>', { slug: 'home', title: 'Home' })],
    };
    return themeProjectStore.save(source, { expectedVersion: 0 });
  }
  const now = new Date().toISOString();
  const project = validateThemeProject({
    ...source,
    id: 'theme_' + crypto.randomUUID().replaceAll('-', ''),
    name,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });
  return themeProjectStore.save(project, { expectedVersion: 0 });
}

export function openThemeProject(id: string) {
  // Open the existing CMS editor directly. The app-shell wrapper was a second
  // navigation layer and obscured the canonical installed-project URL.
  const params = new URLSearchParams({ project: id });
  window.location.assign('/admin/theme-project-editor?' + params.toString());
}

export const themeManagement = {
  async installTheme(id: string) {
    const descriptor = (bundled as BundledTheme[]).find((theme) => theme.id === id);
    const project = await installThemeDraft(id, descriptor?.name);
    openThemeProject(project.id);
  },
  async activateTheme(id: string) {
    const project = await themeProjectStore.get(id);
    if (!project) throw new Error('theme_not_found');
    await setActiveThemeId(project.id);
  },
  async applyTheme(id: string) {
    const payload = await registryRequest('/api/studio/themes/' + encodeURIComponent(id) + '/apply', 'POST', {});
    applyThemeVariables(apiTheme(payload.theme));
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
  },
  async editTheme(id: string) {
    const project = await themeProjectStore.get(id) || await installThemeDraft(id);
    openThemeProject(project.id);
  },
  async duplicateTheme(id: string, name: string, style: { themeFamily?: string; cssVars?: Record<string, string> } = {}) {
    const payload = await registryRequest('/api/studio/themes', 'POST', {
      name,
      source_theme_id: id,
      theme_family: style.themeFamily,
      css_vars: style.cssVars,
    });
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
    return apiTheme(payload.theme);
  },
  async createTheme(name: string, style: { themeFamily?: string; cssVars?: Record<string, string> } = {}) {
    const payload = await registryRequest('/api/studio/themes', 'POST', {
      name,
      theme_family: style.themeFamily,
      css_vars: style.cssVars,
    });
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
    return apiTheme(payload.theme);
  },
  async updateTheme(id: string, style: { name?: string; themeFamily?: string; cssVars?: Record<string, string> }) {
    const payload = await registryRequest(`/api/studio/themes/${encodeURIComponent(id)}`, 'PUT', {
      name: style.name,
      theme_family: style.themeFamily,
      css_vars: style.cssVars,
    });
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
    return apiTheme(payload.theme);
  },
  async archiveTheme(id: string) {
    await registryRequest(`/api/studio/themes/${encodeURIComponent(id)}`, 'DELETE');
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
  },
  async restoreTheme(id: string) {
    await registryRequest(`/api/studio/themes/${encodeURIComponent(id)}/restore`, 'POST', {});
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
  },
  async importTheme(value: unknown) {
    const project = validateThemeProject(value);
    project.id = 'theme_' + crypto.randomUUID().replaceAll('-', '');
    project.revision = 0;
    project.createdAt = new Date().toISOString();
    project.updatedAt = project.createdAt;
    await themeProjectStore.save(project, { expectedVersion: 0 });
  },
  async exportTheme(id: string) {
    const project = await themeProjectStore.get(id);
    if (!project) throw new Error('theme_draft_not_found');
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.id}.theme.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
