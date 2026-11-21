import { describe, expect, it } from 'vitest';
import { builtinQuickAddCatalog, cadCanAct, categoryLabel, fetchQuickAddCatalog, sectionsFor } from './catalog';

describe('quick-add catalog', () => {
  it('builtin catalog mirrors the database shape: stock objects plus starter scenes', () => {
    const items = builtinQuickAddCatalog();
    expect(items.filter((i) => i.tab === 'objects').length).toBe(20);
    expect(items.filter((i) => i.tab === 'scenes').length).toBeGreaterThanOrEqual(5);
    expect(items.find((i) => i.id === 'tpl_cad_stock_desk')?.specs).toMatchObject({ type: 'desk', unit: 'in' });
    expect(items.filter((i) => i.tab === 'scenes').every((i) => !!i.ref)).toBe(true);
  });

  it('labels raw categories and leaves labels alone', () => {
    expect(categoryLabel('social_media')).toBe('Social media');
    expect(categoryLabel('Social media')).toBe('Social media');
  });

  it('groups by tab and category, then filters by search', () => {
    const items = builtinQuickAddCatalog();
    const objects = sectionsFor(items, 'objects');
    expect(objects.map((s) => s.category)).toEqual(['Seating', 'Tables', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Decor']);
    expect(sectionsFor(items, 'objects', 'sofa').flatMap((s) => s.items).length).toBe(2);
    expect(sectionsFor(items, 'scenes', 'zzzz')).toEqual([]);
  });

  it('asks the registry for the host app and keeps only what the host can act on', async () => {
    const items = [
      { id: 'a', tab: 'objects', kind: 'cad_stock_object', category: 'seating', title: 'Sofa', specs: { type: 'sofa' } },
      { id: 'b', tab: 'objects', kind: 'cad_stock_object', category: 'models', title: 'Glb', specs: { format: 'glb' } },
      { id: 'c', tab: 'scenes', kind: 'scene_composition', category: 'sky', title: 'Sky' },
      { id: 'd', tab: 'scenes', kind: 'cad_project_template', category: 'homes', title: 'Villa', ref: 'modern_villa' },
    ];
    let url = '';
    const fake = (async (u: string) => { url = u; return { ok: true, json: async () => ({ items }) }; }) as unknown as typeof fetch;
    const out = await fetchQuickAddCatalog(fake, undefined, { app: 'cad-creator', accepts: cadCanAct });
    expect(url).toBe('/api/work/cad/catalog?app=cad-creator');
    expect(out.map((i) => i.id)).toEqual(['a', 'd']);
  });
});
