import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp } from 'node:fs/promises';
import { createIAMSceneFormatRegistry, type IAMSceneFormatRegistry } from './format-registry.js';
import { createOcctSession } from '@inneranimalmedia/agentsam-occt/session';
import { parseSceneDocument, serializeSceneDocument } from './document.js';
import type { OcctGeometrySource, SceneDocument } from './types.js';

export type OcctExportFormat = 'gltf' | 'step' | 'brep' | 'ifc';
export interface CreateOcctSceneAssetOptions {
  binary: string;
  projectId: string;
  elementId: string;
  operations: OcctGeometrySource['operations'];
  outputDir: string;
  fileStem?: string;
  deflection?: number;
  formats?: OcctExportFormat[];
}

export interface OcctSceneAssetResult {
  engine: 'occt';
  projectId: string;
  elementId: string;
  revision: number;
  fingerprint: string;
  volumeMm3: number;
  assets: Array<{ id: string; uri: string; mediaType: string; role: 'presentation' | 'geometry-source'; units: 'm' | 'mm'; sha256: string; bytes: number; receipt: unknown }>;
}

const MIME: Record<OcctExportFormat, string> = {
  gltf: 'model/gltf+json',
  step: 'model/step',
  brep: 'application/vnd.opencascade.brep',
  ifc: 'application/x-step',
};

function safeStem(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value)) throw new Error('iamscene_asset_stem_invalid');
  return value;
}

export async function createOcctSceneAsset(options: CreateOcctSceneAssetOptions): Promise<OcctSceneAssetResult> {
  if (!path.isAbsolute(options.binary)) throw new Error('iamscene_occt_absolute_binary_required');
  if (!path.isAbsolute(options.outputDir)) throw new Error('iamscene_occt_absolute_output_dir_required');
  if (!options.operations.length) throw new Error('iamscene_occt_operations_required');
  if (!options.operations.some(operation => operation.id === options.elementId)) throw new Error('iamscene_occt_element_not_in_feature_history');
  const outputDir = await realpath(options.outputDir).catch(async () => {
    await mkdir(options.outputDir, { recursive: true });
    return realpath(options.outputDir);
  });
  const stem = safeStem(options.fileStem ?? options.elementId);
  const formats: OcctExportFormat[] = [...new Set<OcctExportFormat>(options.formats ?? ['gltf', 'step', 'brep'])];
  const session = createOcctSession({ binary: options.binary });
  const createdFiles: string[] = [];
  try {
    await session.request({ action: 'open', projectId: options.projectId });
    for (const operation of options.operations) await session.request({ action: 'apply', operation });
    const mesh = await session.request({ action: 'mesh', id: options.elementId, deflection: options.deflection ?? 0.25 });
    if (!Number.isFinite(mesh.volume_mm3) || mesh.volume_mm3 <= 0 || !Array.isArray(mesh.indices) || mesh.indices.length < 3) {
      throw new Error('iamscene_occt_mesh_receipt_invalid');
    }
    const assets: OcctSceneAssetResult['assets'] = [];
    for (const format of formats) {
      const filename = `${stem}.${format}`;
      const target = path.join(outputDir, filename);
      const receipt = await session.request({ action: 'export', format, id: options.elementId, path: target, deflection: options.deflection ?? 0.25 });
      const fileStat = await stat(target);
      if (!fileStat.isFile() || fileStat.size < 100) throw new Error(`iamscene_occt_export_invalid:${format}`);
      const bytes = await readFile(target);
      createdFiles.push(target);
      assets.push({
        id: `${options.elementId}-${format}`,
        uri: `./${filename}`,
        mediaType: MIME[format],
        role: format === 'gltf' ? 'presentation' : 'geometry-source',
        units: format === 'gltf' ? 'm' : 'mm',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
        receipt,
      });
    }
    return {
      engine: 'occt',
      projectId: options.projectId,
      elementId: options.elementId,
      revision: Number(mesh.revision),
      fingerprint: String(mesh.fingerprint),
      volumeMm3: Number(mesh.volume_mm3),
      assets,
    };
  } catch (error) {
    await Promise.all(createdFiles.map(file => rm(file, { force: true }).catch(() => undefined)));
    throw error;
  } finally {
    session.close();
  }
}

export async function loadSceneFile(filePath: string): Promise<SceneDocument> {
  const absolute = path.resolve(filePath);
  return parseSceneDocument(await readFile(absolute));
}

export async function saveSceneFile(filePath: string, document: SceneDocument): Promise<void> {
  const absolute = path.resolve(filePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, serializeSceneDocument(document), 'utf8');
    await rename(temporary, absolute);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Native format adapters are opt-in for Node/desktop hosts. This keeps the
 * browser registry honest; a published npm package is not proof that a native
 * OCCT executable has been installed on every consumer's machine.
 */
export async function createIAMSceneNativeFormatRegistry(options: { binary: string }): Promise<IAMSceneFormatRegistry> {
  if (!path.isAbsolute(options.binary)) throw new Error('iamscene_native_binary_absolute_path_required');
  const execFileAsync = promisify(execFile);
  const result = await execFileAsync(options.binary, ['--doctor'], { timeout: 8000, maxBuffer: 1024*1024 });
  const receiptLine = result.stdout.split(/\r?\n/).find(line=>line.startsWith('AGENTSAM_RESULT='));
  if (!receiptLine) throw new Error('iamscene_occt_doctor_receipt_missing');
  const doctor = JSON.parse(receiptLine.slice('AGENTSAM_RESULT='.length));
  if (!doctor.ok || doctor.engine !== 'occt' || !Array.isArray(doctor.capabilities)) throw new Error('iamscene_occt_doctor_unverified');
  const registry = createIAMSceneFormatRegistry();
  const requirements = {
    step:'solid.export.step',brep:'solid.export.brep',ifc:'bim.export.ifc4',
  } as const;
  for (const [format, capability] of Object.entries(requirements) as Array<[keyof typeof requirements, string]>) {
    if (!doctor.capabilities.includes(capability)) continue;
    registry.registerAdapter(format, { async export(document) {
      if (document.kind !== 'scene') throw new Error('iamscene_native_scene_document_required');
      const target = document.value.scene.nodes.filter(node=>node.geometry?.type === 'occt');
      if (target.length !== 1) throw new Error('iamscene_native_single_geometry_required');
      const node = target[0];
      if (!node.geometry || node.geometry.type !== 'occt') throw new Error('iamscene_native_geometry_missing');
      const tempDir = await mkdtemp(path.join(os.tmpdir(),'iamscene-export-'));
      try {
        const built = await createOcctSceneAsset({ binary: options.binary, projectId: document.value.metadata.id,
          elementId: node.id, operations: node.geometry.operations, outputDir: tempDir, formats:[format] });
        const item = built.assets[0];
        const output = new Uint8Array(await readFile(path.join(tempDir,item.uri)));
        if (createHash('sha256').update(output).digest('hex') !== item.sha256) throw new Error('iamscene_native_export_hash_mismatch');
        if (format==='ifc' && !new TextDecoder().decode(output.subarray(0,100)).includes('ISO-10303-21'))
          throw new Error('iamscene_native_ifc_header_invalid');
        return { format, bytes: output, warnings:[
          'Verified OCCT geometry export. This does not claim semantic round-trip or full IFC building-model authoring.',
        ] };
      } finally { await rm(tempDir,{recursive:true,force:true}); }
    }});
  }
  return registry;
}

export { createIAMSceneCadBuildingHost } from './cad-host.js';
export type { CadFileResourceRef, CadBuildingRequest, CadBuildingExportReceipt, CadBuildingHostHandler, CadHostAvailability } from './cad-host.js';
