import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverBlender } from './discovery';
import { probeDockerServiceHealth, executeBlenderDocker } from './docker-executor';

const execFileAsync = promisify(execFile);

export interface BlenderBuildOptions {
  operation?: 'build' | 'inspect' | 'render_preview' | 'export';
  recipe?: any;
  operations?: any[];
  format?: 'glb' | 'stl' | 'obj' | 'png';
  filename?: string;
  timeoutMs?: number;
}

export interface BlenderBuildResult {
  success: boolean;
  engine: 'blender-native' | 'blender-docker';
  operation: string;
  format: string;
  filename: string;
  artifactBase64?: string | null;
  sizeBytes: number;
  sha256?: string | null;
  durationMs: number;
  result?: any;
  logs: string[];
}

export async function executeBlenderBuild({
  operation = 'build',
  recipe,
  operations,
  format = 'glb',
  filename,
  timeoutMs = 45000,
}: BlenderBuildOptions): Promise<BlenderBuildResult> {
  const startTime = Date.now();
  const outFilename = filename || `scene.${format}`;
  const sdkRoot = path.resolve(process.cwd(), '../..');
  const adapterPath = path.join(sdkRoot, 'services/cad/blender/adapter.py');

  const { binary, source: discoverySource } = discoverBlender(process.env);

  if (binary && fs.existsSync(adapterPath)) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-creator-blender-'));
    const requestPath = path.join(tmpDir, 'request.json');
    const outputPath = path.join(tmpDir, outFilename);

    const fullRecipe = recipe || (operations ? { schema_version: 1, operations } : { schema_version: 1, operations: [] });
    const requestData = {
      ...fullRecipe,
      schema_version: 1,
      output: outputPath,
      format,
    };

    fs.writeFileSync(requestPath, JSON.stringify(requestData, null, 2), 'utf8');

    const args = ['-b', '--python', adapterPath, '--', '--operation', operation, '--request', requestPath];

    try {
      const { stdout, stderr } = await execFileAsync(binary, args, {
        cwd: tmpDir,
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
      });

      const allLogs = ((stdout || '') + '\n' + (stderr || '')).trim();

      let resultEnvelope: any = null;
      for (const line of (stdout || '').split(/\r?\n/).reverse()) {
        if (line.startsWith('AGENTSAM_RESULT=')) {
          try {
            resultEnvelope = JSON.parse(line.slice('AGENTSAM_RESULT='.length));
            break;
          } catch {}
        }
      }

      let artifactBase64: string | null = null;
      let sizeBytes = 0;
      if (fs.existsSync(outputPath)) {
        const buf = fs.readFileSync(outputPath);
        sizeBytes = buf.length;
        artifactBase64 = buf.toString('base64');
      }

      const durationMs = Date.now() - startTime;

      return {
        success: true,
        engine: 'blender-native',
        operation,
        format,
        filename: outFilename,
        artifactBase64,
        sizeBytes,
        durationMs,
        result: resultEnvelope,
        logs: [
          `[KERNEL] Blender Native Renderer (${discoverySource})`,
          `[SCENE] Executed headless pipeline via ${binary}`,
          `[OUTPUT] Emitted ${outFilename} (${sizeBytes} bytes) in ${durationMs}ms`,
          ...allLogs.split(/\r?\n/).slice(-20),
        ],
      };
    } catch (err: any) {
      // Fall through to docker service probe on error
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // If local Blender is missing or failed, delegate to containerized Docker service
  try {
    const dockerHealth = await probeDockerServiceHealth();
    if (dockerHealth.available && dockerHealth.tools?.blender?.installed) {
      const dockerRes = await executeBlenderDocker({
        operation,
        recipe,
        operations,
        format,
        filename: outFilename,
        timeoutMs,
      });

      return {
        success: true,
        engine: 'blender-docker',
        operation: dockerRes.operation,
        format: dockerRes.format,
        filename: dockerRes.filename || outFilename,
        artifactBase64: dockerRes.artifactBase64,
        sizeBytes: dockerRes.sizeBytes,
        sha256: dockerRes.sha256,
        durationMs: dockerRes.durationMs,
        result: dockerRes.result,
        logs: dockerRes.logs,
      };
    }
  } catch {}

  throw new Error('Blender runtime environment is not installed on this system and Docker service is unavailable');
}
