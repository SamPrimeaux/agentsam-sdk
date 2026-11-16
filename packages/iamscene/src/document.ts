import { assertValidSceneDocument, validateSceneDocument } from './validate.js';
import type { SceneDocument, SceneMetadata } from './types.js';

export const IAMSCENE_SCHEMA_URI = 'https://schemas.inneranimalmedia.com/iamscene/v1/scene.schema.json';
export const IAMSCENE_FORMAT_VERSION = '1.0.0' as const;

export interface CreateSceneDocumentOptions {
  id: string;
  name: string;
  description?: string;
  author?: string;
  assetBaseUri?: string;
  tags?: string[];
  metadata?: Partial<SceneMetadata>;
}

export function createSceneDocument(options: CreateSceneDocumentOptions): SceneDocument {
  const now = new Date().toISOString();
  const rootId = 'scene-root';
  const document: SceneDocument = {
    $schema: IAMSCENE_SCHEMA_URI,
    format: 'iamscene',
    formatVersion: IAMSCENE_FORMAT_VERSION,
    metadata: {
      id: options.id,
      name: options.name,
      ...(options.description ? { description: options.description } : {}),
      ...(options.author ? { author: options.author } : {}),
      ...(options.assetBaseUri ? { assetBaseUri: options.assetBaseUri } : {}),
      ...(options.tags ? { tags: [...options.tags] } : {}),
      createdAt: now,
      modifiedAt: now,
      ...options.metadata,
    },
    coordinateSystem: { handedness: 'right', upAxis: 'Y', distanceUnit: 'm' },
    assets: [],
    materials: [],
    scene: {
      rootNodeIds: [rootId],
      nodes: [{ id: rootId, name: 'Scene', kind: 'group', transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, visible: true }],
    },
    camera: { projection: 'perspective', position: [0, 2.5, 6], target: [0, 0, 0], fov: 40, near: 0.01, far: 1000 },
    environment: { background: '#05080d', ambientIntensity: 0.3, lights: [] },
    animations: [],
    interactions: [],
    extensionsUsed: [],
    extensionsRequired: [],
  };
  assertValidSceneDocument(document);
  return document;
}

export function cloneSceneDocument(document: SceneDocument): SceneDocument {
  return structuredClone(document);
}

export function parseSceneDocument(source: string | Uint8Array | ArrayBuffer): SceneDocument {
  const text = typeof source === 'string'
    ? source
    : new TextDecoder().decode(source instanceof Uint8Array ? source : new Uint8Array(source));
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch (error) { throw new Error(`iamscene_json_parse_failed:${error instanceof Error ? error.message : String(error)}`); }
  assertValidSceneDocument(parsed);
  return parsed;
}

export function serializeSceneDocument(document: SceneDocument, pretty = true): string {
  assertValidSceneDocument(document);
  return `${JSON.stringify(document, null, pretty ? 2 : 0)}\n`;
}

export function migrateSceneDocument(value: unknown): SceneDocument {
  const result = validateSceneDocument(value);
  if (result.valid) return cloneSceneDocument(value as SceneDocument);
  const candidate = value as { format?: unknown; formatVersion?: unknown } | null;
  if (candidate?.format !== 'iamscene') throw new Error('iamscene_format_not_supported');
  throw new Error(`iamscene_migration_not_available:${String(candidate.formatVersion ?? 'unknown')}`);
}
