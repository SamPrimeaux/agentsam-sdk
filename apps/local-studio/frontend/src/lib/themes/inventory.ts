import type { SettingsTheme } from '@inneranimalmedia/agentsam-settings/contracts';
import { THEME_PROJECTS_CHANGED, themeProjectStore, getCmsSiteContext } from './projects';
// @ts-ignore Public portable JavaScript theme authoring contract.
import { THEME_PROJECT_SCHEMA, extractThemePage, validateThemeProject } from '@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/project';
import {
  projectStudioShellAppearance,
  applyStudioShellAppearance,
  writeStudioAppearanceCache,
} from '../../../../shared/shell-appearance.mjs';

async function registryRequest(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) throw new Error(String(payload?.error || 'theme_request_failed_' + response.status));
  return payload;
}

function apiTheme(value: any): SettingsTheme {
  return {
    ...value,
    id: String(value.id),
    name: String(value.name || 'Untitled theme'),
    packageName: String(value.packageName || 'AgentSam appearance'),
    category: String(value.category || value.themeFamily || 'Appearance'),
    swatches: Array.isArray(value.swatches) ? value.swatches : [],
    cssVars: value.cssVars && typeof value.cssVars === 'object' ? value.cssVars : {},
    capabilities: value.capabilities || { preview: true, editable: value.source === 'account-custom', duplicable: true, publishable: false },
  } as SettingsTheme;
}

const activeThemeVariableNames = new Set<string>();
function applyThemeVariables(theme: SettingsTheme | undefined) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const key of activeThemeVariableNames) root.style.removeProperty(key);
  activeThemeVariableNames.clear();
  if (theme?.cssVars) for (const [key, value] of Object.entries(theme.cssVars)) {
    if (/^--[a-zA-Z0-9_-]{1,78}$/.test(key) && typeof value === 'string' && value.length <= 120) {
      root.style.setProperty(key, value);
      activeThemeVariableNames.add(key);
    }
  }
  window.dispatchEvent(new CustomEvent('iam:invalidate-active-theme-fetch'));
}

/** The Settings theme inventory is exclusively the account-scoped cms_themes registry. */
export async function listStudioThemes(): Promise<SettingsTheme[]> {
  if (typeof window === 'undefined') return [];
  const registry = await registryRequest('/api/studio/themes');
  const themes: SettingsTheme[] = Array.isArray(registry?.themes) ? registry.themes.map(apiTheme) : [];
  const activeId = registry?.activeThemeId ? String(registry.activeThemeId) : undefined;
  applyThemeVariables(activeId ? themes.find(theme => theme.id === activeId) : undefined);
  return themes.map(theme => ({ ...theme, active: theme.id === activeId || Boolean(theme.active) }));
}

/** Apply the active cms_themes appearance record; storefront themes are not shell themes. */
export async function applyActiveStudioTheme(): Promise<SettingsTheme | null> {
  if (typeof window === 'undefined') return null;
  const registry = await registryRequest('/api/studio/themes');
  const activeId = registry?.activeThemeId ? String(registry.activeThemeId) : '';
  const themes: SettingsTheme[] = Array.isArray(registry?.themes) ? registry.themes.map(apiTheme) : [];
  const active = activeId ? themes.find(theme => theme.id === activeId) || null : null;
  applyThemeVariables(active || undefined);
  return active;
}

/** Create a blank site-scoped theme project or duplicate an existing local draft. */
export async function createThemeDraft(id: string | null, name: string) {
  const source = id ? await themeProjectStore.get(id) : undefined;
  if (id && !source) throw new Error('theme_project_not_found');
  const now = new Date().toISOString();
  const project = source
    ? validateThemeProject({ ...source, id: 'theme_' + crypto.randomUUID().replaceAll('-', ''), name, revision: 0, createdAt: now, updatedAt: now })
    : validateThemeProject({
        schema: THEME_PROJECT_SCHEMA,
        id: 'theme_' + crypto.randomUUID().replaceAll('-', ''),
        name,
        version: '0.1.0',
        revision: 0,
        createdAt: now,
        updatedAt: now,
        tokens: {},
        pages: [extractThemePage('<!doctype html><html><head><title>New theme</title></head><body><main><section><h1>New theme</h1><p>Start with your content.</p></section></main></body></html>', { slug: 'home', title: 'Home' })],
      });
  return themeProjectStore.save(project, { expectedVersion: 0 });
}

export async function openThemeProject(id: string, siteId?: string) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error('theme_project_id_invalid');
  const resolvedSiteId = siteId || (await getCmsSiteContext()).id;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(resolvedSiteId || '')) throw new Error('cms_site_context_unavailable');
  const page = '/admin/sites/' + encodeURIComponent(resolvedSiteId) + '/themes/' + encodeURIComponent(id) + '/editor/home';
  const destination = '/apps/ecommerce-cms-agentsam?' + new URLSearchParams({ page });
  if (window.location.hash.startsWith('#/')) window.location.hash = '#' + destination;
  else window.location.assign(destination);
}

async function applyCmsTheme(id: string) {
  const payload = await registryRequest('/api/studio/themes/' + encodeURIComponent(id) + '/apply', 'POST', {});
  if (!payload.theme) throw new Error('theme_apply_response_missing');
  const theme = apiTheme(payload.theme);
  applyThemeVariables(theme);
  const appearance = projectStudioShellAppearance({
    id: theme.id,
    themeFamily: String((payload.theme as { themeFamily?: string })?.themeFamily || theme.category || ''),
    cssVars: theme.cssVars,
  }, { theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', accentColor: undefined });
  applyStudioShellAppearance(appearance, document.documentElement);
  const accountId = typeof payload.accountId === 'string'
    ? payload.accountId
    : ((window as Window & { __shellUser?: { id?: string } }).__shellUser?.id || null);
  if (accountId) writeStudioAppearanceCache(accountId, appearance);
  window.dispatchEvent(new CustomEvent('agentsam:theme-applied', { detail: appearance }));
  window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
  window.dispatchEvent(new Event('agentsam:theme-registry-changed'));
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const themeManagement = {
  async activateTheme(id: string) { await applyCmsTheme(id); },
  async applyTheme(id: string) { await applyCmsTheme(id); },
  async duplicateTheme(id: string, name: string, style: { themeFamily?: string; cssVars?: Record<string, string> } = {}) {
    const payload = await registryRequest('/api/studio/themes', 'POST', {
      name, source_theme_id: id, theme_family: style.themeFamily, css_vars: style.cssVars,
    });
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
    return apiTheme(payload.theme);
  },
  async createTheme(name: string, style: { themeFamily?: string; cssVars?: Record<string, string> } = {}) {
    const payload = await registryRequest('/api/studio/themes', 'POST', {
      name, theme_family: style.themeFamily, css_vars: style.cssVars,
    });
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
    return apiTheme(payload.theme);
  },
  async updateTheme(id: string, style: { name?: string; themeFamily?: string; cssVars?: Record<string, string> }) {
    const payload = await registryRequest('/api/studio/themes/' + encodeURIComponent(id), 'PUT', {
      name: style.name, theme_family: style.themeFamily, css_vars: style.cssVars,
    });
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
    return apiTheme(payload.theme);
  },
  async archiveTheme(id: string) {
    await registryRequest('/api/studio/themes/' + encodeURIComponent(id), 'DELETE');
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
  },
  async restoreTheme(id: string) {
    await registryRequest('/api/studio/themes/' + encodeURIComponent(id) + '/restore', 'POST', {});
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
  },
  async importTheme(value: unknown) {
    const input = value as any;
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const themeFamily = typeof input?.themeFamily === 'string' ? input.themeFamily : 'custom';
    const cssVars = input?.cssVars && typeof input.cssVars === 'object' && !Array.isArray(input.cssVars) ? input.cssVars : {};
    if (!name) throw new Error('theme_name_required');
    await registryRequest('/api/studio/themes', 'POST', { name, theme_family: themeFamily, css_vars: cssVars });
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
  },
  async exportTheme(id: string) {
    const theme = (await listStudioThemes()).find(item => item.id === id);
    if (!theme) throw new Error('theme_not_found_or_not_owned');
    downloadJson(theme.id + '.appearance-theme.json', {
      name: theme.name,
      themeFamily: (theme as any).themeFamily || theme.category,
      cssVars: theme.cssVars || {},
    });
  },
};
