import { describe, expect, it } from 'vitest';
import { builtinQuickAddCatalog, categoryLabel, sectionsFor } from './catalog';

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
});
