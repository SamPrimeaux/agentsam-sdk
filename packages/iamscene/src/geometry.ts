/**
 * IAMGeometry is a versioned asset manifest, not a competing geometry kernel.
 * CAD sources stay owned by cad.project.v2 / OCCT, and glTF/GLB remain the
 * mesh-delivery formats. A single manifest can refer to both representations.
 *
 * Plain UTF-8 JSON may be saved as *.iamgeometry.
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../schema/iamgeometry.v1.schema.json' with { type: 'json' };

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
const validateSchema = ajv.compile(schema);

export const IAMGEOMETRY_FORMAT_VERSION = '1.0.0' as const;
export const IAMGEOMETRY_MEDIA_TYPE = 'application/vnd.inneranimalmedia.iamgeometry+json';
export type GeometryRole = 'render' | 'source' | 'collision' | 'lod';
export type GeometryFormat = 'glb' | 'gltf' | 'step' | 'brep' | 'ifc' | 'stl' | 'obj' | 'ply';
export interface GeometryRepresentation {
  id: string;
  role: GeometryRole;
  format: GeometryFormat;
  uri: string;
  sha256?: string;
  lod?: number;
  mediaType?: string;
  /** Units of this representation; glTF and GLB are always authored in metres. */
  units?: IAMGeometryDocument['units'];
}
export interface IAMGeometryDocument {
  format: 'iamgeometry';
  formatVersion: typeof IAMGEOMETRY_FORMAT_VERSION;
  id: string;
  name: string;
  units: 'm' | 'cm' | 'mm' | 'in' | 'ft';
  representations: GeometryRepresentation[];
  /** Preferred representation for interactive display, must reference render/lod glTF or GLB. */
  defaultRenderId: string;
  /** Native CAD authority; this references it instead of copying its feature history. */
  source?: {
    schema: string;
    uri: string;
    elementId?: string;
    revision?: string | number;
  };
  metadata?: Record<string, unknown>;
}

export function parseIAMGeometry(value: string | Uint8Array | IAMGeometryDocument): IAMGeometryDocument {
  let candidate: unknown;
  try {
    candidate = typeof value === 'string'
      ? JSON.parse(value)
      : value instanceof Uint8Array
        ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value))
        : value;
  } catch {
    throw new Error('iamgeometry_json_invalid');
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('iamgeometry_document_invalid');
  const obj = candidate as Partial<IAMGeometryDocument>;
  if (obj.format !== 'iamgeometry' || obj.formatVersion !== IAMGEOMETRY_FORMAT_VERSION)
    throw new Error('iamgeometry_version_unsupported');
  if (!validateSchema(candidate)) {
    const invalidRepresentation = (validateSchema.errors || []).some(error => error.instancePath.startsWith('/representations/'));
    throw new Error(invalidRepresentation ? 'iamgeometry_representation_invalid' : 'iamgeometry_document_invalid');
  }
  const ids = new Set<string>();
  for (const r of obj.representations!) {
    if (ids.has(r.id)) throw new Error('iamgeometry_representation_invalid');
    ids.add(r.id);
  }
  if (!obj.representations!.some(r => r.id === obj.defaultRenderId
      && (r.role === 'render' || r.role === 'lod') && (r.format === 'gltf' || r.format === 'glb')))
    throw new Error('iamgeometry_render_representation_invalid');
  return structuredClone(obj as IAMGeometryDocument);
}

export function serializeIAMGeometry(document: IAMGeometryDocument): string {
  return JSON.stringify(parseIAMGeometry(document), null, 2) + '\n';
}

export function getIAMGeometryRender(document: IAMGeometryDocument): GeometryRepresentation {
  const checked = parseIAMGeometry(document);
  return checked.representations.find(r => r.id === checked.defaultRenderId)!;
}
