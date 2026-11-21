import { ARCHITECTURAL_STOCK } from '../FurniturePicker';
import { TEMPLATE_METADATA_LIST } from '../../lib/templates';
import type { QuickAddItem } from './types';

export const QUICK_ADD_CATALOG_URL = '/api/work/cad/catalog';

const TABS = new Set(['objects', 'scenes']);
const isItem = (v: unknown): v is QuickAddItem => {
  const o = v as QuickAddItem;
  return !!o && typeof o.id === 'string' && typeof o.title === 'string' && typeof o.category === 'string' && TABS.has(o.tab);
};

/** "social_media" / "seating" -> "Social media" / "Seating". Idempotent on labels. */
export const categoryLabel = (raw: string): string => {
  const text = String(raw || 'Other').replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export async function fetchQuickAddCatalog(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<QuickAddItem[]> {
  const res = await fetcher(QUICK_ADD_CATALOG_URL, { credentials: 'same-origin', signal });
  if (!res.ok) throw new Error(`catalog_${res.status}`);
  const body = (await res.json()) as { items?: unknown };
  return Array.isArray(body.items) ? body.items.filter(isItem) : [];
}

/** Same shape the DB serves, so the menu works offline, in local studio and for any SDK install. */
export function builtinQuickAddCatalog(): QuickAddItem[] {
  const objects: QuickAddItem[] = ARCHITECTURAL_STOCK.map((s) => ({
    id: `tpl_cad_stock_${s.type}`,
    tab: 'objects',
    kind: 'cad_stock_object',
    category: s.category,
    pack: 'Architectural stock',
    title: s.name,
    description: s.description,
    specs: { type: s.type, unit: 'in', w: s.w, d: s.d, h: s.h, color: s.color },
  }));
  const scenes: QuickAddItem[] = TEMPLATE_METADATA_LIST.map((t) => ({
    id: `tpl_cad_${t.id}`,
    tab: 'scenes',
    kind: 'cad_project_template',
    category: t.category,
    pack: 'Starter layouts',
    title: t.name,
    description: t.description,
    ref: t.id,
  }));
  return [...objects, ...scenes];
}

export interface QuickAddSection { category: string; items: QuickAddItem[] }

export function sectionsFor(items: QuickAddItem[], tab: QuickAddItem['tab'], query = ''): QuickAddSection[] {
  const q = query.trim().toLowerCase();
  const order: string[] = [];
  const by = new Map<string, QuickAddItem[]>();
  for (const item of items) {
    if (item.tab !== tab) continue;
    if (q && !`${item.title} ${item.description || ''} ${item.category} ${item.pack || ''}`.toLowerCase().includes(q)) continue;
    const label = categoryLabel(item.category);
    if (!by.has(label)) { by.set(label, []); order.push(label); }
    by.get(label)!.push(item);
  }
  return order.map((category) => ({ category, items: by.get(category)! }));
}
