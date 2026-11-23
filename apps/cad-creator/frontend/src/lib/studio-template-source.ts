import type { ParametricObject, ProjectState } from '@inneranimalmedia/agentsam-cad-shared';
import { renderOpenScadTemplate } from './openscad/generator';
import { createTerrainDocument, validateTerrainDocument, type TerrainDocument } from './world-terrain';
import type { QuickAddItem } from '../components/quick-add/types';

type StudioPayloadPack = {
  schema?: string;
  version?: number;
  items?: Record<string, Record<string, unknown>>;
};

function uniqueId(prefix: string): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${id}`;
}

async function readStudioPayload(item: QuickAddItem, fetcher: typeof fetch): Promise<unknown> {
  if (!item.payloadUrl) throw new Error(`The registered resource "${item.title}" has no payload.`);
  const response = await fetcher(item.payloadUrl, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Could not load "${item.title}" (${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new Error(`The registered payload for "${item.title}" is not valid JSON.`);
  }
}

async function readPackEntry(item: QuickAddItem, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  const raw = await readStudioPayload(item, fetcher) as StudioPayloadPack;
  if (raw?.schema !== 'agentsam.cad.studio-payload-pack.v1' || !raw.items || typeof raw.items !== 'object') {
    throw new Error(`The registered payload pack for "${item.title}" has an unsupported schema.`);
  }
  const entry = raw.items[item.id];
  if (!entry || typeof entry !== 'object') throw new Error(`No payload entry is registered for "${item.title}".`);
  return entry;
}

function isProjectState(value: unknown): value is ProjectState {
  if (!value || typeof value !== 'object') return false;
  const project = value as Record<string, unknown>;
  return typeof project.name === 'string'
    && Array.isArray(project.walls)
    && Array.isArray(project.doors)
    && Array.isArray(project.windows)
    && Array.isArray(project.rooms)
    && Array.isArray(project.furniture);
}

/** Loads a registered CAD project template and returns an independent, unsaved project copy. */
export async function loadStudioProjectTemplate(
  item: QuickAddItem,
  fetcher: typeof fetch = fetch,
): Promise<ProjectState> {
  if (item.kind !== 'cad_project_template' || item.tab !== 'templates') {
    throw new Error(`"${item.title}" is not a CAD project template.`);
  }
  const raw = await readStudioPayload(item, fetcher) as Record<string, unknown>;
  const projectData = raw && typeof raw === 'object' && 'project' in raw ? raw.project : raw;
  if (!isProjectState(projectData)) throw new Error(`The registered project template "${item.title}" is not a valid CAD project.`);
  const project = structuredClone(projectData);
  project.id = uniqueId('proj');
  project.name = item.title;
  project.updatedAt = Date.now();
  project.version = 1;
  project.sceneSettings = {
    ...(project.sceneSettings || {}),
    terrain: project.sceneSettings?.terrain
      ? validateTerrainDocument(project.sceneSettings.terrain)
      : createTerrainDocument(),
  };
  return project;
}

/** Loads the TerrainDocument stored inside the shared studio_templates payload pack. */
export async function loadStudioTerrainPreset(
  item: QuickAddItem,
  fetcher: typeof fetch = fetch,
): Promise<TerrainDocument> {
  if (item.kind !== 'cad_terrain_preset') throw new Error(`"${item.title}" is not a terrain preset.`);
  const entry = await readPackEntry(item, fetcher);
  return validateTerrainDocument(entry.terrain);
}

/** Applies either a scenery-only catalog item or a complete registered site scene. */
export function mergeStudioTerrainPreset(
  current: TerrainDocument,
  preset: TerrainDocument,
  item: QuickAddItem,
): TerrainDocument {
  if (item.specs.apply_mode === 'replace') return validateTerrainDocument(preset);
  const base: TerrainDocument = {
    ...current,
    width: preset.width,
    depth: preset.depth,
    resolution: preset.resolution,
    baseElevation: preset.baseElevation,
    protectedRadius: preset.protectedRadius,
    cover: preset.cover,
    seed: preset.seed,
  };
  if (item.specs.preview_kind === 'nature-tree') {
    base.treeCount = preset.treeCount;
    base.treeScale = preset.treeScale;
  } else if (item.specs.preview_kind === 'nature-rocks') {
    base.rockCount = preset.rockCount;
    base.rockScale = preset.rockScale;
  } else {
    return validateTerrainDocument(preset);
  }
  return validateTerrainDocument(base);
}

/** Creates a native project ParametricObject from the registered OpenSCAD source and definitions. */
export async function createParametricObjectFromCatalog(
  item: QuickAddItem,
  index = 0,
  fetcher: typeof fetch = fetch,
): Promise<ParametricObject> {
  if (item.kind !== 'cad_parametric_template') throw new Error(`"${item.title}" is not a parametric template.`);
  const entry = await readPackEntry(item, fetcher);
  const source = typeof entry.source === 'string' ? entry.source : '';
  const parameters = entry.defaultParams;
  const parameterDefs = entry.parameterDefs;
  if (!source || !parameters || typeof parameters !== 'object' || !Array.isArray(parameterDefs)) {
    throw new Error(`The registered parametric template "${item.title}" is incomplete.`);
  }
  const values = structuredClone(parameters) as Record<string, number | string | boolean>;
  return {
    id: uniqueId('param'),
    name: item.title,
    generator: 'openscad',
    generatorTemplate: item.id,
    parameters: values,
    parameterDefs: structuredClone(parameterDefs) as ParametricObject['parameterDefs'],
    transform: { x: 48 + index * 24, y: 48, z: 0, rotationY: 0 },
    source: renderOpenScadTemplate(source, values),
    updatedAt: Date.now(),
  };
}
