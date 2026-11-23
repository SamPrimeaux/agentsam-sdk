import { describe, expect, it } from 'vitest';
import { addLandform, addSculptStroke, createTerrainDocument, terrainHeight, validateTerrainDocument } from './world-terrain';
import { createTerrainProjection } from './world-terrain-three';

describe('metric editable landscape', () => {
  it('creates a project-neutral blank site without baked-in project content', () => {
    const document = createTerrainDocument();
    expect(document).toMatchObject({ width: 100, depth: 100, resolution: 64, protectedRadius: 0, cover: 'meadow', treeCount: 0, rockCount: 0 });
    expect(document.landforms).toEqual([]);
    expect(document.strokes).toEqual([]);
    expect(terrainHeight(document, 0, 0)).toBe(0);
  });

  it('keeps registered terrain documents explicit and independently editable', () => {
    const document = validateTerrainDocument({
      ...createTerrainDocument(),
      width: 420,
      depth: 420,
      resolution: 96,
      protectedRadius: 73,
      cover: 'woodland',
      seed: 12571,
      treeCount: 110,
      rockCount: 80,
    });
    expect(document).toMatchObject({ width: 420, depth: 420, resolution: 96, protectedRadius: 73, cover: 'woodland', seed: 12571, treeCount: 110, rockCount: 80 });
    expect(createTerrainDocument().treeCount).toBe(0);
  });

  it('hill height and footprint respond to numeric edits', () => {
    const source = createTerrainDocument();
    const document = addLandform(source, 'hill');
    const ridge = document.landforms[0];
    const original = terrainHeight(document, ridge.x, ridge.z);
    const raised = { ...document, landforms: [{ ...ridge, elevation: ridge.elevation * 2 }] };
    expect(terrainHeight(raised, ridge.x, ridge.z)).toBeGreaterThan(original);
    const moved = { ...document, landforms: [{ ...ridge, x: 1000, z: 1000 }] };
    expect(terrainHeight(moved, ridge.x, ridge.z)).toBeCloseTo(0);
  });

  it('adds and reverses sculpt strokes without modifying BIM object geometry', () => {
    const source = createTerrainDocument();
    const document = addLandform(source, 'hill');
    const ridge = document.landforms[0];
    const height = terrainHeight(document, ridge.x, ridge.z);
    const next = addSculptStroke(document, ridge.x, ridge.z, 10, 4, 'raise');
    expect(terrainHeight(next, ridge.x, ridge.z)).toBeCloseTo(height + 4);
    expect(document.strokes).toHaveLength(0);
    expect(terrainHeight({ ...next, strokes: next.strokes.slice(0, -1) }, ridge.x, ridge.z)).toBeCloseTo(height);
    const flatter = addSculptStroke(next, ridge.x, ridge.z, 10, 1, 'flatten');
    expect(terrainHeight(flatter, ridge.x, ridge.z)).toBeCloseTo(document.baseElevation);
  });

  it('validates native terrain artifacts and imports elevation grids', () => {
    const document = createTerrainDocument();
    const json = JSON.stringify({ ...document, imported: { columns: 2, rows: 2, heights: [0, 2, 4, 6] } });
    const imported = validateTerrainDocument(JSON.parse(json));
    expect(imported.imported?.heights).toEqual([0, 2, 4, 6]);
    expect(terrainHeight({ ...imported, protectedRadius: 0, landforms: [] }, -210, -210)).toBeCloseTo(0);
    expect(terrainHeight({ ...imported, protectedRadius: 0, landforms: [] }, 209, 209)).toBeGreaterThan(5);
    expect(() => validateTerrainDocument({ ...document, resolution: 1000000 })).toThrow();
    expect(() => validateTerrainDocument({ ...document, landforms: [{ ...document.landforms[0], radiusX: -1 }] })).toThrow();
    expect(() => validateTerrainDocument({ ...document, imported: { columns: 1024, rows: 1024, heights: [] } })).toThrow();
  });

  it('creates vertex geometry, normals and instanced scenery from explicit terrain data', () => {
    const document = validateTerrainDocument({ ...createTerrainDocument(), treeCount: 2, rockCount: 2 });
    const projection = createTerrainProjection(document);
    const positions = projection.surface.geometry.getAttribute('position');
    const heights = Array.from({ length: positions.count }, (_, index) => positions.getY(index));
    expect(Math.max(...heights)).toBeGreaterThanOrEqual(0);
    expect(projection.root.children.some((child) => child.name.includes('tree'))).toBe(true);
    expect(projection.root.children.some((child) => child.name.includes('rock'))).toBe(true);
    projection.dispose();
  });

  it('supports explicit new landforms and stable serialization', () => {
    const source = createTerrainDocument();
    const next = addLandform(source, 'valley');
    const target = next.landforms.at(-1)!;
    expect(target.elevation).toBeLessThan(0);
    expect(validateTerrainDocument(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
});
