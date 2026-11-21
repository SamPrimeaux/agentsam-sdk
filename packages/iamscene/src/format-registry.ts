/**
 * IAMScene format registry. A recognized suffix is NOT proof of a working
 * importer/exporter. Each operation is independently registered and reported.
 * Portable: no implicit filesystem, network, or external process access.
 */
import { createSceneDocument, parseSceneDocument, serializeSceneDocument } from './document.js';
import { parseIAMGeometry, serializeIAMGeometry, type IAMGeometryDocument } from './geometry.js';
import { encodeGltfAsset, importGltfScene, parseGltfAsset, projectSceneToGltf, type GltfSource } from './gltf.js';
import type { SceneDocument } from './types.js';
import { importTriangleMesh } from './mesh-interchange.js';

export type FormatOperation = 'import' | 'export' | 'live-reference' | 'round-trip';
export type FormatStatus = 'implemented' | 'unavailable';
export type FormatFamily = 'native' | 'gltf' | 'cad' | 'fabrication' | 'bim' | 'usd' | 'dcc' | 'vfx' | 'drawings' | 'scan' | 'image' | 'media' | 'editorial';
export type FormatDocument = { kind: 'scene'; value: SceneDocument } | { kind: 'geometry'; value: IAMGeometryDocument };
export interface FormatRegistration {
  id: string;
  family: FormatFamily;
  extensions: string[];
  limitations?: string[];
  /** Canonical source-type identities; discovery and codec support remain separate. */
  sourceTypeIds?: string[];
}
export interface FormatDescriptor {
  id: string;
  family: FormatFamily;
  extensions: readonly string[];
  operations: Record<FormatOperation, FormatStatus>;
  /** Specific constraints for this format, never a promise of feature parity. */
  limitations: readonly string[];
  /** References root source-types.v2 identities, not an imported second catalog. */
  sourceTypeIds?: readonly string[];
}
export interface FormatImport {
  format: string;
  document: FormatDocument;
  /** Original source is always retained by the caller; do not flatten it. */
  source: Uint8Array;
  warnings: string[];
  /** Materialized output files which the caller must persist alongside the scene. */
  generatedFiles?: Array<{ uri: string; bytes: Uint8Array; mediaType: string }>;
}
export interface FormatExport {
  format: string;
  bytes: Uint8Array;
  warnings: string[];
}
export interface FormatReference {
  uri: string;
  /** Selected format is a filename candidate, not semantic identification. */
  identification: 'extension-hint';
  format: string;
  sha256: string;
  byteLength: number;
  /** Caller-supplied immutable revision, if one exists. */
  revision?: string;
}
export interface FormatLossReport {
  format: string;
  passed: boolean;
  preserved: string[];
  lost: string[];
  warnings: string[];
}
export interface FormatImportOptions { id: string; name?: string; assetUri: string; sourceUnits?: 'm' | 'cm' | 'mm' | 'in' | 'ft'; }
export interface FormatExportOptions {
  /** Original source is required for patch-based glTF export. */
  original?: Uint8Array | string;
  resolveUri?: (uri: string) => Promise<Uint8Array>;
}
export interface FormatAdapter {
  import?: (source: Uint8Array, options: FormatImportOptions) => Promise<FormatImport> | FormatImport;
  export?: (document: FormatDocument, options: FormatExportOptions) => Promise<FormatExport> | FormatExport;
  /** Semantic verifier; never equate output existence with a correct round-trip. */
  roundTrip?: (source: Uint8Array, options: FormatImportOptions & FormatExportOptions) => Promise<FormatLossReport>;
}

const te = new TextEncoder();
const td = new TextDecoder('utf-8', { fatal: true });
function bytes(value: Uint8Array | ArrayBuffer | string): Uint8Array {
  return typeof value === 'string' ? te.encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
}
function safeBytes(value: Uint8Array | ArrayBuffer | string): Uint8Array {
  const result = bytes(value);
  if (!result.length || result.length > 512 * 1024 * 1024) throw new Error('iamscene_format_source_size_invalid');
  return result;
}
function nativeImport(source: Uint8Array): FormatImport {
  return { format: 'iamscene', document: { kind: 'scene', value: parseSceneDocument(source) }, source, warnings: [] };
}
function geometryImport(source: Uint8Array): FormatImport {
  return { format: 'iamgeometry', document: { kind: 'geometry', value: parseIAMGeometry(source) }, source, warnings: [] };
}
function nativeExport(document: FormatDocument): FormatExport {
  if (document.kind !== 'scene') throw new Error('iamscene_format_document_kind_mismatch');
  return { format: 'iamscene', bytes: te.encode(serializeSceneDocument(document.value)), warnings: [] };
}
function geometryExport(document: FormatDocument): FormatExport {
  if (document.kind !== 'geometry') throw new Error('iamscene_format_document_kind_mismatch');
  return { format: 'iamgeometry', bytes: te.encode(serializeIAMGeometry(document.value)), warnings: [] };
}
function sameJSON(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
async function nativeRoundTrip(source: Uint8Array, geometry: boolean): Promise<FormatLossReport> {
  const a = geometry ? geometryImport(source) : nativeImport(source);
  const b = geometry ? geometryExport(a.document) : nativeExport(a.document);
  const c = geometry ? geometryImport(b.bytes) : nativeImport(b.bytes);
  const passed = sameJSON(a.document.value, c.document.value);
  return { format: geometry ? 'iamgeometry' : 'iamscene', passed, preserved: passed ? ['canonical editable document', 'object identity', 'asset references'] : [], lost: passed ? [] : ['document fields differ'], warnings: [] };
}
function gltfAdapter(format: 'gltf' | 'glb'): FormatAdapter {
  return {
    import(source, options) {
      const parsed = parseGltfAsset(source);
      if (parsed.format !== format) throw new Error('iamscene_format_content_mismatch');
      return { format, document: { kind: 'scene', value: importGltfScene(source, options) }, source, warnings: [
        'Original mesh, animation, skin, extension, texture and binary payloads remain in the linked glTF source. The IAMScene editing API does not expose all of them.'
      ] };
    },
    async export(document, options) {
      if (document.kind !== 'scene') throw new Error('iamscene_format_document_kind_mismatch');
      if (!options.original) throw new Error('iamscene_gltf_original_required_for_lossless_patch');
      const original = parseGltfAsset(options.original);
      const projected = projectSceneToGltf(document.value, original);
      return { format, bytes: bytes(await encodeGltfAsset(projected, { format, resolveUri: options.resolveUri })), warnings: [
        'Original opaque glTF payloads are patched and preserved; editing native-only materials, geometry and additional nodes may be unsupported.'
      ] };
    },
    async roundTrip(source, options) {
      const imported = await gltfAdapter(format).import!(source, options);
      const exported = await gltfAdapter(format).export!(imported.document, { ...options, original: source });
      const initial = parseGltfAsset(source), last = parseGltfAsset(exported.bytes);
      const semantic = sameJSON(initial.json, last.json);
      // GLB encoding may repack buffers and images while retaining content.
      const retained = imported.document.kind === 'scene' && imported.document.value.scene.nodes.length > 0;
      return { format, passed: semantic && retained,
        preserved: semantic && retained ? ['glTF JSON structure', 'scene hierarchy', 'original mesh and extension references'] : [],
        lost: semantic ? [] : ['glTF JSON changed or buffer packing differed; requires scoped semantic verification'],
        warnings: exported.warnings };
    },
  };
}
const formats: FormatRegistration[] = [
  { id:'iamscene', sourceTypeIds:['model.iamscene'], family:'native', extensions:['.iamscene', '.iamscene.json'] },
  { id:'iamgeometry', sourceTypeIds:['model.iamgeometry'], family:'native', extensions:['.iamgeometry'] },
  { id:'gltf', sourceTypeIds:['model.gltf'], family:'gltf', extensions:['.gltf'], limitations:['Preserves opaque source payloads; not all mesh and animation internals are directly editable'] },
  { id:'glb', sourceTypeIds:['model.glb'], family:'gltf', extensions:['.glb'], limitations:['Preserves opaque source payloads; not all mesh and animation internals are directly editable'] },
  { id:'step', sourceTypeIds:['cad.step'], family:'cad', extensions:['.step','.stp'] },
  { id:'iges', sourceTypeIds:['cad.iges'], family:'cad', extensions:['.iges','.igs'] },
  { id:'brep', sourceTypeIds:['cad.opencascade-brep'], family:'cad', extensions:['.brep'] },
  { id:'stl', sourceTypeIds:['model.stl'], family:'fabrication', extensions:['.stl'], limitations:['Triangles only; requires source units; no parametric topology round-trip'] },
  { id:'3mf', sourceTypeIds:['model.3mf'], family:'fabrication', extensions:['.3mf'] },
  { id:'obj', sourceTypeIds:['model.wavefront-obj'], family:'fabrication', extensions:['.obj'], limitations:['Triangle mesh conversion; MTL and texture sidecars are not resolved'] },
  { id:'ply', sourceTypeIds:['model.ply'], family:'fabrication', extensions:['.ply'], limitations:['Triangle mesh conversion; point cloud without faces is not supported'] },
  { id:'ifc', sourceTypeIds:['bim.ifc'], family:'bim', extensions:['.ifc'] },
  { id:'ifczip', sourceTypeIds:['bim.ifczip'], family:'bim', extensions:['.ifczip'] },
  { id:'usd', sourceTypeIds:['model.usd','model.usda','model.usdc','model.usdz'], family:'usd', extensions:['.usd','.usda','.usdc','.usdz'] },
  { id:'blend', sourceTypeIds:['model.blender'], family:'dcc', extensions:['.blend'] },
  { id:'fbx', sourceTypeIds:['model.fbx'], family:'dcc', extensions:['.fbx'] },
  { id:'dae', sourceTypeIds:['model.collada'], family:'dcc', extensions:['.dae'] },
  { id:'abc', sourceTypeIds:['model.alembic'], family:'vfx', extensions:['.abc'] },
  { id:'vdb', sourceTypeIds:['model.openvdb'], family:'vfx', extensions:['.vdb'] },
  { id:'dxf', sourceTypeIds:['cad.dxf'], family:'drawings', extensions:['.dxf'] },
  { id:'dwg', sourceTypeIds:['cad.dwg'], family:'drawings', extensions:['.dwg'] },
  { id:'svg', sourceTypeIds:['image.svg'], family:'drawings', extensions:['.svg'] },
  { id:'las', sourceTypeIds:['pointcloud.las','pointcloud.laz'], family:'scan', extensions:['.las','.laz'] },
  { id:'e57', sourceTypeIds:['pointcloud.e57'], family:'scan', extensions:['.e57'] },
  { id:'png', sourceTypeIds:['image.png'], family:'image', extensions:['.png'] },
  { id:'jpg', sourceTypeIds:['image.jpeg'], family:'image', extensions:['.jpg','.jpeg'] },
  { id:'exr', sourceTypeIds:['image.exr'], family:'image', extensions:['.exr'] },
  { id:'hdr', sourceTypeIds:['image.hdr'], family:'image', extensions:['.hdr'] },
  { id:'ktx2', sourceTypeIds:['game.texture-ktx2'], family:'image', extensions:['.ktx2'] },
  { id:'mp4', sourceTypeIds:['video.mp4'], family:'media', extensions:['.mp4','.m4v'] },
  { id:'mov', sourceTypeIds:['video.quicktime'], family:'media', extensions:['.mov'] },
  { id:'mkv', sourceTypeIds:['video.matroska'], family:'media', extensions:['.mkv'] },
  { id:'wav', sourceTypeIds:['audio.wav'], family:'media', extensions:['.wav'] },
  { id:'flac', sourceTypeIds:['audio.flac'], family:'media', extensions:['.flac'] },
  { id:'otio', sourceTypeIds:['media.otio','media.otioz'], family:'editorial', extensions:['.otio','.otioz'] },
];

/** Adapter registration is explicit. A format listing is not an adapter. */
export class IAMSceneFormatRegistry {
  readonly #entries = new Map<string, (typeof formats)[number]>();
  readonly #extensions = new Map<string, string>();
  readonly #adapters = new Map<string, FormatAdapter>();
  constructor() {
    for (const entry of formats) this.registerFormat(entry);
    this.registerAdapter('iamscene', { import: source => nativeImport(source), export: doc => nativeExport(doc), roundTrip: source => nativeRoundTrip(source, false) });
    this.registerAdapter('iamgeometry', { import: source => geometryImport(source), export: doc => geometryExport(doc), roundTrip: source => nativeRoundTrip(source, true) });
    this.registerAdapter('gltf', gltfAdapter('gltf'));
    this.registerAdapter('glb', gltfAdapter('glb'));
    for (const format of ['stl','obj','ply'] as const) this.registerAdapter(format,{ import:(source,options)=>importTriangleMesh(format,source,options) });
  }
  /** Extension registration is data, not evidence that its codec exists. */
  registerFormat(entry: FormatRegistration): void {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id) || !entry.extensions.length || this.#entries.has(entry.id))
      throw new Error('iamscene_format_registration_invalid');
    const normalized = entry.extensions.map(x=>x.toLowerCase());
    for (const ext of normalized) {
      if (!/^\.[a-z0-9.]+$/.test(ext) || this.#extensions.has(ext) || normalized.filter(x=>x===ext).length!==1)
        throw new Error('iamscene_format_duplicate_or_invalid_extension:' + ext);
    }
    if (entry.sourceTypeIds && (entry.sourceTypeIds.some(id=>!/^[-a-z0-9.]+$/.test(id)) || new Set(entry.sourceTypeIds).size !== entry.sourceTypeIds.length))
      throw new Error('iamscene_format_source_types_invalid');
    this.#entries.set(entry.id,{...entry,extensions:normalized});
    for (const ext of normalized) this.#extensions.set(ext,entry.id);
  }
  registerAdapter(id: string, adapter: FormatAdapter): void {
    if (!this.#entries.has(id)) throw new Error('iamscene_format_unknown:' + id);
    if (this.#adapters.has(id)) throw new Error('iamscene_format_adapter_already_registered:' + id);
    if (!adapter.import && !adapter.export && !adapter.roundTrip) throw new Error('iamscene_format_adapter_empty');
    this.#adapters.set(id, adapter);
  }
  /** Filename suffix hint only; semantic identification belongs to source-types evidence. */
  identify(input: string): FormatDescriptor {
    const stripped = input.split(/[?#]/)[0].toLowerCase();
    const extension = [...this.#extensions.keys()].sort((a,b)=>b.length-a.length).find(x => stripped.endsWith(x));
    if (!extension) throw new Error('iamscene_format_extension_unknown:' + input);
    return this.describe(this.#extensions.get(extension)!);
  }
  describe(id: string): FormatDescriptor {
    const entry = this.#entries.get(id);
    if (!entry) throw new Error('iamscene_format_unknown:' + id);
    const adapter = this.#adapters.get(id);
    return { id, family: entry.family, extensions: [...entry.extensions],
      ...(entry.sourceTypeIds ? {sourceTypeIds:[...entry.sourceTypeIds]} : {}),
      operations: { import: adapter?.import ? 'implemented' : 'unavailable', export: adapter?.export ? 'implemented' : 'unavailable',
        'live-reference': 'implemented', 'round-trip': adapter?.roundTrip ? 'implemented' : 'unavailable' },
      limitations: [...(entry.limitations || []), ...(!adapter?.import ? ['No native semantic importer registered; linked source bytes are not editable scene elements'] : [])] };
  }
  list(): FormatDescriptor[] { return [...this.#entries.keys()].map(id=>this.describe(id)); }
  async import(filename: string, source: Uint8Array | ArrayBuffer | string, options: FormatImportOptions): Promise<FormatImport> {
    const descriptor = this.identify(filename);
    const adapter = this.#adapters.get(descriptor.id)?.import;
    if (!adapter) throw new Error('iamscene_format_import_unavailable:' + descriptor.id);
    return adapter(safeBytes(source), options);
  }
  async export(filename: string, document: FormatDocument, options: FormatExportOptions = {}): Promise<FormatExport> {
    const descriptor = this.identify(filename);
    const adapter = this.#adapters.get(descriptor.id)?.export;
    if (!adapter) throw new Error('iamscene_format_export_unavailable:' + descriptor.id);
    return adapter(document, options);
  }
  async roundTrip(filename: string, source: Uint8Array | ArrayBuffer | string, options: FormatImportOptions & FormatExportOptions): Promise<FormatLossReport> {
    const descriptor = this.identify(filename);
    const adapter = this.#adapters.get(descriptor.id)?.roundTrip;
    if (!adapter) throw new Error('iamscene_format_round_trip_unavailable:' + descriptor.id);
    return adapter(safeBytes(source), options);
  }
  /** Verify that linked bytes exist and match the expected content hash. Does not imply semantic import or display support. */
  async reference(uri: string, content: Uint8Array | ArrayBuffer | string, options: { expectedSha256?: string; revision?: string } = {}): Promise<FormatReference> {
    const descriptor = this.identify(uri);
    const raw = safeBytes(content);
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw as Uint8Array<ArrayBuffer>)))
      .map(n=>n.toString(16).padStart(2,'0')).join('');
    if (options.expectedSha256 && sha256 !== options.expectedSha256.toLowerCase()) throw new Error('iamscene_format_reference_hash_mismatch');
    return { uri, identification: 'extension-hint', format: descriptor.id, sha256, byteLength: raw.byteLength, ...(options.revision ? { revision: options.revision } : {}) };
  }
  /** Caller re-resolves bytes on access; the format registry never silently fetches URLs or runs programs. */
  async refreshReference(reference: FormatReference, resolve: (uri: string) => Promise<Uint8Array>): Promise<{ reference: FormatReference; changed: boolean }> {
    const content = await resolve(reference.uri);
    const updated = await this.reference(reference.uri, content, { revision: reference.revision });
    return { reference: updated, changed: updated.sha256 !== reference.sha256 };
  }
}
export function createIAMSceneFormatRegistry(): IAMSceneFormatRegistry { return new IAMSceneFormatRegistry(); }
