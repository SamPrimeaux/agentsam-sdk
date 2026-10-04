import bundled from 'virtual:agentsam-theme-inventory';
import type { SettingsTheme } from '@inneranimalmedia/agentsam-settings/contracts';
// @ts-ignore Public portable JavaScript theme authoring contract.
import { THEME_PROJECT_SCHEMA, extractThemePage, validateThemeProject, renderThemePage } from '@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/project';
import { getActiveThemeId, setActiveThemeId, themeProjectStore } from './projects';

const draftPreviews = new Map<string, { stamp: string; url: string }>();
function draftPreview(project: any) {
  const cached = draftPreviews.get(project.id);
  if (cached && cached.stamp === project.updatedAt) return cached.url;
  if (cached) URL.revokeObjectURL(cached.url);
  const url = URL.createObjectURL(new Blob([renderThemePage(project.pages[0], project.tokens)], { type: 'text/html' }));
  draftPreviews.set(project.id, { stamp: project.updatedAt, url }); return url;
}

export type BundledTheme = SettingsTheme & { pages: { slug: string; title: string; url: string }[] };
export async function listStudioThemes(): Promise<SettingsTheme[]> {
  if (typeof window === 'undefined') return bundled;
  const [projects, activeId] = await Promise.all([themeProjectStore.list(), getActiveThemeId()]);
  return [...bundled, ...projects.map((project) => ({
    id: project.id, name: project.name, packageName: project.packageName || 'Local theme project', version: project.version || 'Draft',
    previewUrl: draftPreview(project), category: 'Draft', source: 'local' as const, status: 'Editable draft · saved on this installation', swatches: Object.values(project.tokens || {}).filter((v): v is string => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)),
    capabilities: { preview: true, editable: true, duplicable: true, publishable: false },
  }))].map((theme) => ({ ...theme, active: theme.id === activeId }));
}

export async function createThemeDraft(id: string | null, name: string) {
  let source = id ? await themeProjectStore.get(id) : undefined;
  if (!source && id) {
    const descriptor = (bundled as BundledTheme[]).find((theme) => theme.id === id);
    if (!descriptor?.pages.length) throw new Error('This package has no editable page source');
    const tokens: Record<string, string> = {};
    const pages = await Promise.all(descriptor.pages.map(async (page, i) => {
      const response = await fetch(page.url);
      if (!response.ok) throw new Error(`Theme source unavailable: ${page.url}`);
      const html = await response.text();
      for (const match of html.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+)[;]/g)) if (!tokens[match[1]]) tokens[match[1]] = match[2].trim();
      return extractThemePage(html, { slug: page.slug.replace(/[^a-zA-Z0-9_-]/g, '_') || `page_${i}`, title: page.title, baseUrl: new URL('.', new URL(page.url, location.href)).href });
    }));
    source = { pages, tokens, sourceThemeId: id, sourcePackage: descriptor.packageName };
  }
  if (!source) source = { tokens: {}, pages: [extractThemePage('<!doctype html><html><head><title>New theme</title></head><body><main><section><h1>New theme</h1><p>Start with your content.</p></section></main></body></html>', { slug: 'home', title: 'Home' })] };
  const project = { ...source, schema: THEME_PROJECT_SCHEMA, id: 'theme_' + crypto.randomUUID().replaceAll('-', ''), name, version: '0.1.0', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await themeProjectStore.save(project);
  return project;
}

export function openThemeProject(id: string) {
  window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to: `/cms?view=editor&theme_project=${encodeURIComponent(id)}` } }));
}

export const themeManagement = {
  async activateTheme(id: string) {
    if (!(await listStudioThemes()).some((theme) => theme.id === id)) throw new Error('theme_not_found');
    const draft = await themeProjectStore.get(id) || await createThemeDraft(id, (bundled as BundledTheme[]).find((theme) => theme.id === id)?.name || 'Active theme');
    await setActiveThemeId(draft.id);
  },
  async editTheme(id: string) {
    const project = await themeProjectStore.get(id) || await createThemeDraft(id, (bundled as BundledTheme[]).find((theme) => theme.id === id)?.name || 'Theme draft');
    openThemeProject(project.id);
  },
  async duplicateTheme(id: string, name: string) { const project = await createThemeDraft(id, name); openThemeProject(project.id); },
  async createTheme(name: string) { const project = await createThemeDraft(null, name); openThemeProject(project.id); },
  async importTheme(value: unknown) {
    const project = validateThemeProject(value);
    // Imported projects are new editable copies; never overwrite an existing draft silently.
    project.id = 'theme_' + crypto.randomUUID().replaceAll('-', '');
    await themeProjectStore.save(project);
  },
  async exportTheme(id: string) {
    const project = await themeProjectStore.get(id);
    if (!project) throw new Error('theme_draft_not_found');
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${project.id}.theme.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
