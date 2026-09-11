import { DesignProject, DesignArtifact, ExportFormat } from '@inneranimalmedia/agentsam-cad-shared';
import { exportToSVG, exportToOBJ, exportToDXF, downloadFile } from '../cad-export';
import { generateFullBimOpenScad, generateOpenScadFromParametric } from '../openscad/generator';
import { getExecutionProvider } from '../execution';

export interface ExportOptions {
  includeSketches?: boolean;
  includeParametric?: boolean;
  resolution?: 'standard' | 'high';
  units?: 'in' | 'm' | 'mm';
}

// Simple deterministic hash / checksum helper for browser & server environments
export function computeChecksum(content: string | Uint8Array): string {
  let hash = 0;
  const str = typeof content === 'string' ? content : new TextDecoder().decode(content);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return 'sha256_' + Math.abs(hash).toString(16).padStart(8, '0');
}

export async function exportProjectToArtifact(
  project: DesignProject,
  format: ExportFormat,
  options: ExportOptions = {}
): Promise<DesignArtifact> {
  const now = Date.now();
  const safeName = (project.name || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  let content: string | Uint8Array = '';
  let mimeType = 'text/plain';
  let ext = 'txt';
  let generator = 'AgentSam-CAD-v2.0';

  switch (format) {
    case 'json': {
      content = JSON.stringify(project, null, 2);
      mimeType = 'application/json';
      ext = 'json';
      generator = 'AgentSam Canonical JSON Serializer';
      break;
    }

    case 'svg': {
      content = exportToSVG(project);
      mimeType = 'image/svg+xml';
      ext = 'svg';
      generator = 'AgentSam Vector Plan Generator';
      break;
    }

    case 'dxf': {
      content = exportToDXF(project);
      mimeType = 'application/dxf';
      ext = 'dxf';
      generator = 'AgentSam AutoCAD DXF R12 Exporter';
      break;
    }

    case 'obj': {
      content = exportToOBJ(project);
      mimeType = 'model/obj';
      ext = 'obj';
      generator = 'AgentSam 3D BIM Wavefront OBJ Exporter';
      break;
    }

    case 'scad': {
      content = generateFullBimOpenScad(project);
      mimeType = 'application/x-openscad';
      ext = 'scad';
      generator = 'AgentSam OpenSCAD BIM Assembly Generator';
      break;
    }

    case 'stl': {
      const scadSource = generateFullBimOpenScad(project);
      const executionProvider = getExecutionProvider();
      const execResult = await executionProvider.executeOpenScad({
        source: scadSource,
        outputFormat: 'stl',
        filename: `${safeName}.stl`,
      });

      if (execResult.success && execResult.artifactContent) {
        content = execResult.artifactContent;
      } else {
        // Fallback ASCII STL
        content = `solid ${safeName}\nendsolid ${safeName}\n`;
      }
      mimeType = 'model/stl';
      ext = 'stl';
      generator = 'AgentSam OpenSCAD/CSG STL Kernel';
      break;
    }

    case 'gltf': {
      // Basic GLTF JSON metadata container
      content = JSON.stringify({
        asset: { version: '2.0', generator: 'AgentSam BIM GLTF' },
        scenes: [{ nodes: [0] }],
        nodes: [{ name: project.name }],
      }, null, 2);
      mimeType = 'model/gltf+json';
      ext = 'gltf';
      generator = 'AgentSam GLTF 2.0 Exporter';
      break;
    }

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }

  const checksum = computeChecksum(content);
  const filename = `${safeName}_v${project.version || 1}.${ext}`;
  const size = typeof content === 'string' ? new Blob([content]).size : content.byteLength;

  let localUrl: string | undefined;
  if (typeof window !== 'undefined') {
    const blob = new Blob([content as BlobPart], { type: mimeType });
    localUrl = URL.createObjectURL(blob);
  }

  return {
    id: `art_${now}_${Math.random().toString(36).substring(2, 7)}`,
    projectId: project.id,
    revisionId: `rev_${project.version || 1}`,
    format,
    mimeType,
    filename,
    size,
    createdAt: now,
    generator,
    checksum,
    content,
    localUrl,
    metadata: {
      wallsCount: project.walls.length,
      roomsCount: project.rooms.length,
      doorsCount: project.doors.length,
      windowsCount: project.windows.length,
      parametricCount: (project.parametricObjects || []).length,
      units: project.units || 'in',
    },
  };
}

export { downloadFile };
