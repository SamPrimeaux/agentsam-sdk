import type { FurnitureCategory } from '@inneranimalmedia/agentsam-cad-shared';
import type { FurniturePreset, QuickAddItem, QuickAddTab } from './types';

export const QUICK_ADD_CATALOG_URL = '/api/work/cad/catalog';

export interface QuickAddFetchOptions {
  app: string;
  accepts?: (item: QuickAddItem) => boolean;
}

export function categoryLabel(value: string): string {
  const label = String(value || 'Other').replace(/[_-]+/g, ' ').trim();
  return label.replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Other';
}

export function cadCanAct(item: QuickAddItem): boolean {
  if (item.kind === 'cad_project_template') return item.tab === 'templates' && Boolean(item.payloadUrl);
  if (item.kind === 'cad_stock_object') {
    const specs = item.specs;
    return item.tab === 'objects'
      && typeof specs.type === 'string'
      && Number(specs.w) > 0
      && Number(specs.d) > 0
      && Number(specs.h) > 0;
  }
  if (item.kind === 'cad_terrain_preset') {
    return (item.tab === 'objects' || item.tab === 'scenes')
      && item.renderer === 'cad.terrain.v1'
      && Boolean(item.payloadUrl);
  }
  if (item.kind === 'cad_parametric_template') {
    return item.tab === 'objects'
      && item.renderer === 'openscad.template.v1'
      && Boolean(item.payloadUrl);
  }
  if (item.kind === 'model_3d') return (item.tab === 'objects' || item.tab === 'scenes') && Boolean(item.assetUrl);
  return false;
}

export function furniturePresetFromItem(item: QuickAddItem): FurniturePreset | null {
  if (item.kind !== 'cad_stock_object') return null;
  const specs = item.specs;
  const type = typeof specs.type === 'string' ? specs.type : '';
  const w = Number(specs.w), d = Number(specs.d), h = Number(specs.h);
  if (!type || !(w > 0) || !(d > 0) || !(h > 0)) return null;
  return {
    type,
    name: item.title,
    category: item.category as FurnitureCategory,
    w,
    d,
    h,
    color: typeof specs.color === 'string' ? specs.color : undefined,
    description: item.description,
  };
}

export function furniturePresetsFromCatalog(items: QuickAddItem[]): FurniturePreset[] {
  return items.map(furniturePresetFromItem).filter((item): item is FurniturePreset => item !== null);
}

export async function fetchQuickAddCatalog(
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
  options: QuickAddFetchOptions = { app: 'cad-creator', accepts: cadCanAct },
): Promise<QuickAddItem[]> {
  const response = await fetcher(`${QUICK_ADD_CATALOG_URL}?app=${encodeURIComponent(options.app)}`, {
    credentials: 'same-origin',
    signal,
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Studio catalog request failed (${response.status})`);
  const body = await response.json() as { items?: QuickAddItem[] };
  const items = Array.isArray(body.items) ? body.items : [];
  return options.accepts ? items.filter(options.accepts) : items;
}

export interface QuickAddSection {
  category: string;
  items: QuickAddItem[];
}

export function sectionsFor(items: QuickAddItem[], tab: QuickAddTab, query = ''): QuickAddSection[] {
  const q = query.trim().toLowerCase();
  const by = new Map<string, QuickAddItem[]>();
  for (const item of items) {
    if (item.tab !== tab) continue;
    const haystack = `${item.title} ${item.description} ${item.category} ${item.pack || ''}`.toLowerCase();
    if (q && !haystack.includes(q)) continue;
    const label = categoryLabel(item.category);
    const section = by.get(label) || [];
    section.push(item);
    by.set(label, section);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, sectionItems]) => ({ category, items: sectionItems }));
}
