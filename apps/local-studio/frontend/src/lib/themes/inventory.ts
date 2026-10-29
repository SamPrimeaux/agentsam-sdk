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
  const url = URL.createObjectURL(new Blob([renderThemePage(project.pages[0], project.tokens, {
    baseUrl: project.pages[0].assetBase ? new URL(project.pages[0].assetBase, location.href).href : undefined,
  })], { type: 'text/html' }));
  draftPreviews.set(project.id, { stamp: project.updatedAt, url });
  return url;
}

export type BundledTheme = SettingsTheme & { pages: { slug: string; title: string; url: string }[] };
export async function listStudioThemes(): Promise<SettingsTheme[]> {
  if (typeof window === 'undefined') return bundled;
  const [projects, activeId] = await Promise.all([themeProjectStore.list(), getActiveThemeId()]);
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
  const drafts = projects.map((project) => ({
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
  return [...packages, ...drafts].map((theme) => ({ ...theme, active: theme.id === activeId }));
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
  async editTheme(id: string) {
    const project = await themeProjectStore.get(id) || await installThemeDraft(id);
    openThemeProject(project.id);
  },
  async duplicateTheme(id: string, name: string) {
    const project = await createThemeDraft(id, name);
    openThemeProject(project.id);
  },
  async createTheme(name: string) {
    const project = await createThemeDraft(null, name);
    openThemeProject(project.id);
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
