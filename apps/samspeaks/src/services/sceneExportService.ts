import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export interface SceneExportResult {
  filename: string;
  byteLength: number;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exports one or more Three.js Object3D roots as a binary GLB (with GLTF JSON fallback).
 */
export async function exportSceneAsGlb(
  objects: THREE.Object3D | THREE.Object3D[],
  filenameBase: string
): Promise<SceneExportResult> {
  const exporter = new GLTFExporter();
  const safeBase =
    filenameBase
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'samscenes-export';

  const result = await exporter.parseAsync(objects, {
    binary: true,
    onlyVisible: true,
    embedImages: true,
  });

  if (result instanceof ArrayBuffer) {
    const filename = `${safeBase}.glb`;
    const blob = new Blob([result], { type: 'model/gltf-binary' });
    triggerBlobDownload(blob, filename);
    return { filename, byteLength: result.byteLength };
  }

  const json = JSON.stringify(result, null, 2);
  const filename = `${safeBase}.gltf`;
  const blob = new Blob([json], { type: 'model/gltf+json' });
  triggerBlobDownload(blob, filename);
  return { filename, byteLength: blob.size };
}
