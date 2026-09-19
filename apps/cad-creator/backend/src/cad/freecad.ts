import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverFreeCad } from './discovery';

const execFileAsync = promisify(execFile);

export interface FreeCadBuildOptions {
  operations: Array<{
    op: string;
    name?: string;
    length?: number;
    width?: number;
    height?: number;
    radius?: number;
    radius1?: number;
    radius2?: number;
    base?: string;
    tool?: string;
    translate?: [number, number, number];
  }>;
  format?: 'step' | 'iges' | 'brep' | 'stl';
  filename?: string;
  timeoutMs?: number;
}

export interface FreeCadBuildResult {
  success: boolean;
  engine: 'freecad-native';
  format: string;
  filename: string;
  artifactBase64: string;
  artifactText?: string;
  sizeBytes: number;
  metrics: {
    volume: number;
    surface_area: number;
    faces_count: number;
    edges_count: number;
    vertices_count: number;
    bounding_box: {
      x_min: number;
      x_max: number;
      y_min: number;
      y_max: number;
      z_min: number;
      z_max: number;
    };
  };
  durationMs: number;
  logs: string[];
}

export async function executeFreeCadBuild({
  operations,
  format = 'step',
  filename,
  timeoutMs = 30000,
}: FreeCadBuildOptions): Promise<FreeCadBuildResult> {
  const startTime = Date.now();
  const outFilename = filename || `model.${format}`;
  const sdkRoot = path.resolve(process.cwd(), '../..');
  const adapterPath = path.join(sdkRoot, 'services/cad/freecad/adapter.py');

  if (!fs.existsSync(adapterPath)) {
    throw new Error(`Bundled FreeCAD adapter missing at ${adapterPath}`);
  }

  // Find FreeCAD python environment
  let pythonBin: string | null = null;
  let libDir: string | null = null;

  const { binary } = discoverFreeCad(process.env);
  if (binary && process.platform === 'darwin') {
    const appRoot = binary.includes('.app') ? binary.split('.app')[0] + '.app' : null;
    if (appRoot) {
      const p = path.join(appRoot, 'Contents/Resources/bin/python');
      const l = path.join(appRoot, 'Contents/Resources/lib');
      if (fs.existsSync(p)) {
        pythonBin = p;
        libDir = l;
      }
    }
  }

  if (!pythonBin) {
    const candidates = [
      '/Applications/FreeCAD.app/Contents/Resources/bin/python',
      '/usr/lib/freecad/bin/python',
      '/usr/bin/python3',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        pythonBin = c;
        break;
      }
    }
  }

  if (!pythonBin) {
    throw new Error('FreeCAD runtime environment is not installed on this system');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-creator-freecad-'));
  const requestPath = path.join(tmpDir, 'request.json');
  const outputPath = path.join(tmpDir, outFilename);

  const request = {
    schema_version: 1,
    output: outputPath,
    format,
    operations,
  };

  fs.writeFileSync(requestPath, JSON.stringify(request, null, 2), 'utf8');

  const env = { ...process.env };
  if (libDir) {
    env.PYTHONPATH = [libDir, env.PYTHONPATH].filter(Boolean).join(path.delimiter);
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      pythonBin,
      [adapterPath, '--operation', 'build', '--request', requestPath],
      {
        cwd: tmpDir,
        env,
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
      }
    );

    const line = String(stdout || '').split(/\r?\n/).reverse().find(v => v.startsWith('AGENTSAM_RESULT='));
    if (!line) {
      throw new Error(`FreeCAD execution returned no result: ${stderr || stdout}`);
    }

    const envelope = JSON.parse(line.slice('AGENTSAM_RESULT='.length));
    if (!envelope.ok) {
      throw new Error(envelope.error || 'FreeCAD solid modeling failed');
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error(`FreeCAD did not produce output: ${outFilename}`);
    }

    const buffer = fs.readFileSync(outputPath);
    const durationMs = Date.now() - startTime;
    const isText = format === 'step' || format === 'iges' || format === 'brep';

    return {
      success: true,
      engine: 'freecad-native',
      format,
      filename: outFilename,
      artifactBase64: buffer.toString('base64'),
      artifactText: isText ? buffer.toString('utf8') : undefined,
      sizeBytes: buffer.length,
      metrics: envelope.metrics,
      durationMs,
      logs: [
        `[KERNEL] FreeCAD OpenCASCADE Solid Kernel 7.8`,
        `[OPERATIONS] Processed ${operations.length} solid constructive operations`,
        `[SOLID] Volume: ${envelope.metrics.volume.toFixed(2)} mm³, Surface: ${envelope.metrics.surface_area.toFixed(2)} mm²`,
        `[EXPORT] Generated ${outFilename} (${buffer.length} bytes) in ${durationMs}ms`,
        ...(stderr ? [stderr.trim()] : []),
      ],
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
