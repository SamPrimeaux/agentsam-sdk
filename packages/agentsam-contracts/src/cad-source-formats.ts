/**
 * CAD-relevant subset of the canonical agentsam.source-types.v2 identity catalog.
 * The catalog owns extensions. Only CAD-specific roles and ambiguity policy
 * belong here. Recognition is not evidence of codec/import/export readiness.
 */
import sourceCatalog from '../schemas/source-types.v2.json' with { type: 'json' };
import type { AgentSourceFormatReference } from './source-types.js';

export type CadSourceRole = 'native-bim' | 'parametric' | 'presentation' | 'exchange' | 'verification';

const formatsById = new Map(sourceCatalog.formats.map(format => [format.id, format]));
const cadRoles: Array<[string, CadSourceRole]> = [
  ['cad.freecad', 'native-bim'],
  ['cad.openscad', 'parametric'],
  ['cad.step', 'native-bim'],
  ['cad.iges', 'native-bim'],
  ['cad.opencascade-brep', 'native-bim'],
  ['bim.ifc', 'native-bim'],
  ['bim.ifczip', 'native-bim'],
  ['bim.ifcxml', 'native-bim'],
  ['bim.revit-project', 'native-bim'],
  ['bim.revit-family', 'native-bim'],
  ['cad.dxf', 'exchange'],
  ['cad.dwg', 'exchange'],
  ['model.stl', 'exchange'],
  ['model.3mf', 'exchange'],
  ['model.wavefront-obj', 'exchange'],
  ['model.ply', 'exchange'],
  ['model.iamscene', 'presentation'],
  ['model.iamgeometry', 'exchange'],
  ['model.glb', 'presentation'],
  ['model.gltf', 'presentation'],
  ['model.blender', 'presentation'],
  ['model.fbx', 'presentation'],
  ['model.collada', 'presentation'],
  ['model.usd', 'presentation'],
  ['model.usda', 'presentation'],
  ['model.usdc', 'presentation'],
  ['model.usdz', 'presentation'],
  ['pointcloud.e57', 'exchange'],
  ['pointcloud.las', 'exchange'],
  ['pointcloud.laz', 'exchange'],
  ['pointcloud.xyz', 'exchange'],
  ['image.svg', 'exchange'],
  ['image.png', 'presentation'],
  ['image.jpeg', 'presentation'],
  ['image.webp', 'presentation'],
  ['image.tiff', 'presentation'],
  ['image.exr', 'presentation'],
  ['document.pdf', 'verification'],
  ['data.csv', 'verification'],
  ['data.json', 'verification'],
  ['archive.zip', 'exchange'],
  ['video.mp4', 'presentation'],
  ['video.quicktime', 'presentation'],
  ['video.matroska', 'presentation'],
  ['media.otio', 'exchange'],
  ['media.otioz', 'exchange'],
  ['audio.wav', 'presentation'],
  ['cam.gcode', 'exchange'],
];

/**
 * The CAD profile adds all recognized engineering, visual and document types
 * from the single canonical source-types.v2 catalog. This list defines file
 * DISCOVERY/CLASSIFICATION only, never an importer, editor or conversion engine.
 * Unknown/proprietary CAD/BIM formats are exchange-only by default.
 */
const includedIds = new Set(cadRoles.map(([id]) => id));
for (const format of sourceCatalog.formats) {
  if (includedIds.has(format.id) || !format.extensions.length) continue;
  const family = format.family;
  const role: CadSourceRole | null = family === 'document' ? 'verification'
    : family === 'image.raster' ? 'presentation'
    : family === 'image.vector' ? 'exchange'
    : family === 'model.mesh' || family === 'model.geometry' || family === 'point-cloud' ? 'exchange'
    : family === 'model.scene' ? 'presentation'
    : format.id.startsWith('cad.') || format.id.startsWith('bim.') ? 'exchange'
    : null;
  if (role) { includedIds.add(format.id); cadRoles.push([format.id, role]); }
}

// .h is a recognized G-code alias in some controllers but overwhelmingly a
// programming-language header. Do not discover all headers as CNC programs.
const excludedExtensions: Record<string, ReadonlySet<string>> = Object.freeze({ 'cam.gcode': new Set(['.h']) });
// Earlier entries in the established CAD profile retain priority. A later
// catalog family may share an extension (e.g. point-cloud .ptx and texture PTEX),
// but one extension must never silently route to two default CAD owners.
const assignedSuffixes = new Set<string>();
export const CAD_SOURCE_FORMATS = Object.freeze(cadRoles.flatMap(([id, role]) => {
  const canonical = formatsById.get(id);
  if (!canonical) throw new Error('cad_source_format_missing_from_catalog:' + id);
  const extensions = canonical.extensions.filter(ext =>
    !excludedExtensions[id]?.has(ext) && !assignedSuffixes.has(ext));
  if (!extensions.length) return [];
  for (const ext of extensions) assignedSuffixes.add(ext);
  return [Object.freeze({ id, role, extensions: Object.freeze(extensions) })];
}));

const suffixes = CAD_SOURCE_FORMATS.flatMap(entry =>
  entry.extensions.map(extension => ({ entry, extension }))
).sort((a, b) => b.extension.length - a.extension.length);

/** Longest suffix wins; returns an extension HINT, never file-content verification. */
export function identifyCadFileFormat(filename: string): { catalog: 'agentsam.source-types.v2'; id: string; extension: string; role: CadSourceRole } | null {
  if (typeof filename !== 'string' || filename.length === 0) return null;
  const basename = (filename.split(/[\\/]/).at(-1) ?? '').split(/[?#]/)[0].toLowerCase();
  const match = suffixes.find(({ extension }) => basename.endsWith(extension) && basename.length > extension.length);
  return match ? {
    catalog: 'agentsam.source-types.v2',
    id: match.entry.id,
    extension: match.extension,
    role: match.entry.role,
  } : null;
}

/**
 * Return every canonical identity for an extension. Filename detection is only
 * a hint: .obj can be a Wavefront mesh or a binary object file; .ptx has two
 * established source identities. UI/importers can request content verification
 * or an explicit user decision instead of pretending ambiguity does not exist.
 */
export function cadFormatCandidates(filename: string): AgentSourceFormatReference[] {
  if (typeof filename !== 'string' || !filename) return [];
  const basename = (filename.split(/[\\/]/).at(-1) ?? '').split(/[?#]/)[0].toLowerCase();
  const matched = suffixes.find(({ extension }) => basename.endsWith(extension) && basename.length > extension.length);
  if (!matched) return [];
  return sourceCatalog.formats.filter(format => format.extensions.includes(matched.extension))
    .map(format => ({ catalog: 'agentsam.source-types.v2' as const, id: format.id, extension: matched.extension }));
}

/** Translate a legacy delivery label into canonical format identity. */
export function cadOutputFormatReference(label: string): AgentSourceFormatReference | null {
  if (typeof label !== 'string' || !/^[a-z0-9.+-]{1,32}$/i.test(label)) return null;
  const found = identifyCadFileFormat('artifact.' + label.toLowerCase().replace(/^\./, ''));
  return found ? { catalog: found.catalog, id: found.id, extension: found.extension } : null;
}

/**
 * Generic files (README.md, LICENSE.txt, screenshots) are valid import hints,
 * but must not flood an automatic engineering workspace scan by default.
 * A user selecting one explicitly still receives its canonical identity.
 */
const explicitAttachmentFamilies = new Set(['document.markdown','document.plain-text','document.html']);
export function isCadAutoDiscoveryCandidate(formatId: string, filename: string): boolean {
  if (formatId === 'data.json') return /^(?:.*(?:receipt|provenance|manifest|iamscene))[^/\\]*\.json$/i.test(filename);
  if (explicitAttachmentFamilies.has(formatId)) return false;
  return CAD_SOURCE_FORMATS.some(format => format.id === formatId);
}

export const CAD_FORMAT_OPERATIONS = Object.freeze([
  'inspect', 'import', 'preview', 'edit', 'convert', 'export', 'round-trip',
] as const);
export type CadFormatOperation = typeof CAD_FORMAT_OPERATIONS[number];
export interface CadFormatAdapter {
  id: string;
  formatIds: readonly string[];
  operations: readonly CadFormatOperation[];
  /** Live adapter, never a metadata-only capability claim. */
  execute: (input: { operation: CadFormatOperation; format: AgentSourceFormatReference; source: unknown; options?: unknown }) => Promise<unknown>;
  ready?: () => Promise<boolean> | boolean;
}
/**
 * Executes only through an explicitly installed and healthy operation adapter.
 * Format recognition alone will NEVER return a fabricated preview or artifact.
 */
export async function runCadFormatOperation(input: {
  filename: string; operation: CadFormatOperation; source: unknown; options?: unknown;
  /** Resolution from a real content inspector or explicit application/user choice. */
  resolvedFormatId?: string;
}, adapters: readonly CadFormatAdapter[] = []): Promise<{
  adapterId: string; format: AgentSourceFormatReference; output: unknown;
}> {
  const recognized = identifyCadFileFormat(input.filename);
  if (!recognized) throw new Error('cad_format_unknown');
  if (!CAD_FORMAT_OPERATIONS.includes(input.operation)) throw new Error('cad_operation_unknown');
  const candidates = cadFormatCandidates(input.filename);
  if (input.resolvedFormatId && !candidates.some(candidate => candidate.id === input.resolvedFormatId))
    throw new Error('cad_format_resolution_invalid');
  if (candidates.length > 1 && !input.resolvedFormatId)
    throw new Error('cad_format_ambiguous:' + recognized.extension);
  const targetId = input.resolvedFormatId || recognized.id;
  for (const adapter of adapters) {
    if (!adapter || !adapter.id || typeof adapter.execute !== 'function'
      || !adapter.formatIds.includes(targetId) || !adapter.operations.includes(input.operation)) continue;
    if (adapter.ready && await adapter.ready() !== true) continue;
    const format: AgentSourceFormatReference = {
      catalog: recognized.catalog, id: targetId, extension: recognized.extension,
    };
    return { adapterId: adapter.id, format, output: await adapter.execute({
      operation: input.operation, format, source: input.source, options: input.options,
    }) };
  }
  throw new Error('cad_operation_adapter_unavailable:' + targetId + ':' + input.operation);
}
