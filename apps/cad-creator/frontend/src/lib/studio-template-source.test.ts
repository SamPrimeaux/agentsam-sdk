import { describe, expect, it, vi } from 'vitest';
import { createEmptyCadProject } from './create-empty-project';
import { createTerrainDocument } from './world-terrain';
import {
  createParametricObjectFromCatalog,
  loadStudioProjectTemplate,
  loadStudioTerrainPreset,
  mergeStudioTerrainPreset,
} from './studio-template-source';
import type { QuickAddItem } from '../components/quick-add/types';

function catalogItem(overrides: Partial<QuickAddItem>): QuickAddItem {
  return {
    id: 'registered-resource',
    app: 'cad-creator',
    tab: 'templates',
    kind: 'cad_project_template',
    category: 'architecture',
    pack: 'CAD Creator',
    title: 'Registered starter',
    description: 'A server-registered CAD starter',
    specs: {},
    compatibleApps: ['cad-creator'],
    renderer: null,
    ref: null,
    previewUrl: null,
    payloadUrl: '/api/work/cad/catalog/registered-resource/payload',
    assetUrl: null,
    ...overrides,
  };
}

function jsonFetcher(payload: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

describe('registered CAD studio template payloads', () => {
  it('creates a distinct unsaved project copy from a registered project payload', async () => {
    const source = createEmptyCadProject();
    source.name = 'Source payload';
    source.walls.push({ id: 'source-wall', x1: 0, y1: 0, x2: 120, y2: 0, thickness: 6, height3D: 96, material: 'wood_panel' });
    const fetcher = jsonFetcher({ project: source });
    const copy = await loadStudioProjectTemplate(catalogItem({}), fetcher);

    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe('Registered starter');
    expect(copy.walls).toHaveLength(1);
    copy.walls.pop();
    expect(source.walls).toHaveLength(1);
  });

  it('extracts the requested terrain entry from the shared payload pack', async () => {
    const terrain = { ...createTerrainDocument(), width: 420, depth: 420, cover: 'woodland' as const, treeCount: 110 };
    const item = catalogItem({
      id: 'tpl_tree_scatter',
      kind: 'cad_terrain_preset',
      tab: 'objects',
      payloadUrl: '/api/work/cad/catalog/tpl_tree_scatter/payload',
    });
    const fetcher = jsonFetcher({
      schema: 'agentsam.cad.studio-payload-pack.v1',
      version: 1,
      items: { [item.id]: { terrain } },
    });
    await expect(loadStudioTerrainPreset(item, fetcher)).resolves.toMatchObject({
      width: 420,
      depth: 420,
      cover: 'woodland',
      treeCount: 110,
    });
  });

  it('applies scenery presets without deleting the other existing scenery layer', () => {
    const current = { ...createTerrainDocument(), rockCount: 8, treeCount: 4 };
    const trees = { ...createTerrainDocument(), width: 420, depth: 420, cover: 'woodland' as const, treeCount: 110, rockCount: 0 };
    const item = catalogItem({
      id: 'tpl_tree_scatter',
      kind: 'cad_terrain_preset',
      tab: 'objects',
      specs: { apply_mode: 'scenery', preview_kind: 'nature-tree' },
    });
    const next = mergeStudioTerrainPreset(current, trees, item);
    expect(next).toMatchObject({ width: 420, depth: 420, treeCount: 110, rockCount: 8, cover: 'woodland' });
  });

  it('creates a native parametric object from the registered OpenSCAD definition', async () => {
    const item = catalogItem({
      id: 'tpl_parametric_workstation',
      kind: 'cad_parametric_template',
      tab: 'objects',
      payloadUrl: '/api/work/cad/catalog/tpl_parametric_workstation/payload',
    });
    const fetcher = jsonFetcher({
      schema: 'agentsam.cad.studio-payload-pack.v1',
      version: 1,
      items: {
        [item.id]: {
          source: 'cube([{{width}}, {{depth}}, {{height}}]);',
          defaultParams: { width: 60, depth: 24, height: 30 },
          parameterDefs: [{ name: 'width', value: 60, min: 20, max: 120, step: 1 }],
        },
      },
    });
    const object = await createParametricObjectFromCatalog(item, 2, fetcher);
    expect(object).toMatchObject({
      name: 'Registered starter',
      generator: 'openscad',
      generatorTemplate: item.id,
      transform: { x: 96, y: 48, z: 0, rotationY: 0 },
    });
    expect(object.source).toContain('cube([60, 24, 30])');
  });
});
