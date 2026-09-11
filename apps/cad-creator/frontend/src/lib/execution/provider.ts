import { ExportFormat, DesignArtifact } from '@inneranimalmedia/agentsam-cad-shared';
import {
  ExecutionCapabilities,
  OpenScadExecutionRequest,
  OpenScadExecutionResult,
  ConvertArtifactRequest,
  ExecutionHealth,
  DesignExecutionProvider,
} from './types';

/**
 * LocalBrowserProvider is a mock/client-side implementation of DesignExecutionProvider
 * that handles OpenSCAD compilation requests in-browser by generating simulated geometry data.
 */
export class LocalBrowserProvider implements DesignExecutionProvider {
  id = 'local-browser';
  displayName = 'Local Browser CAD Execution Kernel';

  async capabilities(): Promise<ExecutionCapabilities> {
    return {
      supportsNativeOpenScad: false,
      supportsClientSideCsg: true,
      supportedFormats: ['stl', 'dxf', 'obj', 'scad'],
      maxTimeoutMs: 15000,
      environmentName: 'Browser Client Execution Environment',
    };
  }

  async health(): Promise<ExecutionHealth> {
    return {
      status: 'healthy',
      version: 'AgentSam-Browser-CSG-v1.0',
      backend: 'local-browser',
      message: 'Simulated client-side CSG geometry kernel active and responsive',
    };
  }

  async executeOpenScad(request: OpenScadExecutionRequest): Promise<OpenScadExecutionResult> {
    const startTime = performance.now();
    const logs: string[] = [
      `[${new Date().toISOString()}] Initializing LocalBrowserProvider compilation...`,
      `[PARSE] Analyzing OpenSCAD source (${request.source.length} chars)`,
    ];

    try {
      const format = request.outputFormat || 'stl';
      const filename = request.filename || `compiled_model_${Date.now()}.${format}`;
      let artifactContent = '';
      let mimeType = 'model/stl';

      const w = Number(request.parameters?.width || request.parameters?.deskWidth || request.parameters?.unitWidth || 48) * 0.0254;
      const d = Number(request.parameters?.depth || request.parameters?.deskDepth || request.parameters?.unitDepth || 24) * 0.0254;
      const h = Number(request.parameters?.height || request.parameters?.deskHeight || request.parameters?.unitHeight || 30) * 0.0254;

      logs.push(`[PARAMETERS] Bounding box: ${w.toFixed(2)}m x ${d.toFixed(2)}m x ${h.toFixed(2)}m`);

      if (format === 'stl') {
        mimeType = 'model/stl';
        const name = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
        artifactContent = this.generateSimulatedStl(name, w, d, h);
        logs.push(`[CSG] Generated simulated triangulated ASCII STL mesh`);
      } else if (format === 'obj') {
        mimeType = 'model/obj';
        artifactContent = this.generateSimulatedObj(w, d, h);
        logs.push(`[MESH] Generated simulated Wavefront OBJ mesh`);
      } else if (format === 'dxf') {
        mimeType = 'application/dxf';
        artifactContent = this.generateSimulatedDxf(w, d);
        logs.push(`[2D] Generated simulated AutoCAD DXF R12 entities`);
      } else {
        mimeType = 'text/plain';
        artifactContent = request.source;
        logs.push(`[PASSTHROUGH] Output raw OpenSCAD source`);
      }

      const durationMs = performance.now() - startTime;
      logs.push(`[SUCCESS] Geometry compilation completed in ${durationMs.toFixed(1)}ms`);

      return {
        success: true,
        artifactContent,
        mimeType,
        filename,
        sizeBytes: new Blob([artifactContent]).size,
        durationMs,
        logs,
      };
    } catch (err: any) {
      const durationMs = performance.now() - startTime;
      logs.push(`[ERROR] Compilation failed: ${err.message}`);
      return {
        success: false,
        filename: request.filename || 'error.log',
        mimeType: 'text/plain',
        sizeBytes: 0,
        durationMs,
        logs,
        error: err.message || 'Unknown compilation error',
      };
    }
  }

  async convertArtifact(request: ConvertArtifactRequest): Promise<DesignArtifact> {
    const rawContent = typeof request.sourceArtifact.content === 'string'
      ? request.sourceArtifact.content
      : new TextDecoder().decode(request.sourceArtifact.content);

    const baseName = request.sourceArtifact.filename.replace(/\.[^/.]+$/, '');
    const newFilename = `${baseName}.${request.targetFormat}`;

    return {
      id: `art_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      projectId: request.sourceArtifact.projectId || 'proj_active',
      revisionId: request.sourceArtifact.revisionId || 'rev_1',
      format: request.targetFormat,
      filename: newFilename,
      mimeType: 'text/plain',
      content: rawContent,
      size: new Blob([rawContent]).size,
      createdAt: Date.now(),
      generator: 'LocalBrowserProvider',
      checksum: `sim_${Date.now()}`,
    };
  }

  private generateSimulatedStl(name: string, w: number, d: number, h: number): string {
    const facets = [
      // Top face
      `  facet normal 0 0 1\n    outer loop\n      vertex 0 0 ${h}\n      vertex ${w} 0 ${h}\n      vertex ${w} ${d} ${h}\n    endloop\n  endfacet`,
      `  facet normal 0 0 1\n    outer loop\n      vertex 0 0 ${h}\n      vertex ${w} ${d} ${h}\n      vertex 0 ${d} ${h}\n    endloop\n  endfacet`,
      // Bottom face
      `  facet normal 0 0 -1\n    outer loop\n      vertex 0 0 0\n      vertex ${w} ${d} 0\n      vertex ${w} 0 0\n    endloop\n  endfacet`,
      `  facet normal 0 0 -1\n    outer loop\n      vertex 0 0 0\n      vertex 0 ${d} 0\n      vertex ${w} ${d} 0\n    endloop\n  endfacet`,
      // Front face
      `  facet normal 0 -1 0\n    outer loop\n      vertex 0 0 0\n      vertex ${w} 0 0\n      vertex ${w} 0 ${h}\n    endloop\n  endfacet`,
      `  facet normal 0 -1 0\n    outer loop\n      vertex 0 0 0\n      vertex ${w} 0 ${h}\n      vertex 0 0 ${h}\n    endloop\n  endfacet`,
      // Back face
      `  facet normal 0 1 0\n    outer loop\n      vertex 0 ${d} 0\n      vertex ${w} ${d} ${h}\n      vertex ${w} ${d} 0\n    endloop\n  endfacet`,
      `  facet normal 0 1 0\n    outer loop\n      vertex 0 ${d} 0\n      vertex 0 ${d} ${h}\n      vertex ${w} ${d} ${h}\n    endloop\n  endfacet`,
      // Left face
      `  facet normal -1 0 0\n    outer loop\n      vertex 0 0 0\n      vertex 0 0 ${h}\n      vertex 0 ${d} ${h}\n    endloop\n  endfacet`,
      `  facet normal -1 0 0\n    outer loop\n      vertex 0 0 0\n      vertex 0 ${d} ${h}\n      vertex 0 ${d} 0\n    endloop\n  endfacet`,
      // Right face
      `  facet normal 1 0 0\n    outer loop\n      vertex ${w} 0 0\n      vertex ${w} ${d} ${h}\n      vertex ${w} 0 ${h}\n    endloop\n  endfacet`,
      `  facet normal 1 0 0\n    outer loop\n      vertex ${w} 0 0\n      vertex ${w} ${d} 0\n      vertex ${w} ${d} ${h}\n    endloop\n  endfacet`,
    ];

    return `solid ${name}\n${facets.join('\n')}\nendsolid ${name}\n`;
  }

  private generateSimulatedObj(w: number, d: number, h: number): string {
    return `# AgentSam CAD Studio Wavefront OBJ
o SimulatedParametricAssembly
v 0 0 0
v ${w} 0 0
v ${w} ${d} 0
v 0 ${d} 0
v 0 0 ${h}
v ${w} 0 ${h}
v ${w} ${d} ${h}
v 0 ${d} ${h}
f 1 2 3 4
f 5 8 7 6
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 5 1 4 8
`;
  }

  private generateSimulatedDxf(w: number, d: number): string {
    return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1009
0
ENDSEC
0
SECTION
2
ENTITIES
0
POLYLINE
8
OUTLINE
66
1
70
1
0
VERTEX
8
OUTLINE
10
0.0
20
0.0
30
0.0
0
VERTEX
8
OUTLINE
10
${(w * 39.37).toFixed(2)}
20
0.0
30
0.0
0
VERTEX
8
OUTLINE
10
${(w * 39.37).toFixed(2)}
20
${(d * 39.37).toFixed(2)}
30
0.0
0
VERTEX
8
OUTLINE
10
0.0
20
${(d * 39.37).toFixed(2)}
30
0.0
0
SEQEND
0
ENDSEC
0
EOF
`;
  }
}
