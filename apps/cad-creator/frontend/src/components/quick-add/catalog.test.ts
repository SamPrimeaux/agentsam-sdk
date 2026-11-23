import { describe, expect, it, vi } from 'vitest';
import { cadCanAct, fetchQuickAddCatalog, furniturePresetFromItem, sectionsFor } from './catalog';
import type { QuickAddItem } from './types';

const item = (overrides: Partial<QuickAddItem>): QuickAddItem => ({
  id: 'registered-id',
  app: 'cad-creator',
  compatibleApps: ['cad-creator'],
  kind: 'cad_stock_object',
  tab: 'objects',
  title: 'Registered tree',
  description: 'A registered tree object',
  category: 'nature',
  pack: 'DreamHouse',
  renderer: 'cad.stock.v1',
  specs: { type: 'tree-oak', w: 18, d: 18, h: 96, color: '#4b7d4b' },
  payloadUrl: null,
  assetUrl: null,
  previewUrl: null,
  ref: null,
  ...overrides,
});

describe('CAD Studio catalog', () => {
  it('accepts only catalog records with a supported CAD operation', () => {
    expect(cadCanAct(item({}))).toBe(true);
    expect(cadCanAct(item({ kind: 'cad_project_template', tab: 'templates', payloadUrl: '/payload.json' }))).toBe(true);
    expect(cadCanAct(item({ kind: 'cad_terrain_preset', tab: 'objects', renderer: 'cad.terrain.v1', payloadUrl: '/terrain.json' }))).toBe(true);
    expect(cadCanAct(item({ kind: 'model_3d', tab: 'objects', assetUrl: '/model.glb' }))).toBe(true);
    expect(cadCanAct(item({ kind: 'unknown' as QuickAddItem['kind'] }))).toBe(false);
  });

  it('never substitutes a local fallback when the registered catalog is empty', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
    await expect(fetchQuickAddCatalog(fetcher as unknown as typeof fetch)).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledWith('/api/work/cad/catalog?app=cad-creator', expect.any(Object));
  });

  it('normalizes stock placement from registered dimensions and material data', () => {
    expect(furniturePresetFromItem(item({}))).toMatchObject({
      type: 'tree-oak',
      name: 'Registered tree',
      w: 18,
      d: 18,
      h: 96,
      color: '#4b7d4b',
    });
    expect(furniturePresetFromItem(item({ specs: { type: 'bad', w: 0, d: 18, h: 96 } }))).toBeNull();
  });

  it('groups catalog records by tab and registered category', () => {
    const items = [
      item({ id: 'tree-1', title: 'Oak tree' }),
      item({ id: 'sofa-1', title: 'Sofa', category: 'seating' }),
      item({ id: 'template-1', title: 'Villa', kind: 'cad_project_template', tab: 'templates' }),
    ];
    expect(sectionsFor(items, 'objects').map(section => section.category)).toEqual(['Nature', 'Seating']);
    expect(sectionsFor(items, 'templates').flatMap(section => section.items).map(value => value.title)).toEqual(['Villa']);
    expect(sectionsFor(items, 'objects', 'oak').flatMap(section => section.items).map(value => value.title)).toEqual(['Oak tree']);
  });
});
