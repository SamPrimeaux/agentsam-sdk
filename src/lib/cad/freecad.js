import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../../security/process.js';
import { discoverFreeCad, freeCadStatus } from './discovery.js';
import { discoverFreeCadHost, freeCadAdapterCommand, freeCadHostEnvironment } from './freecad-host.js';
import { probeDockerServiceHealth, executeFreeCadDocker } from './docker-executor.js';

const sdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// The adapter ships inside the Python SDK package (wheel, sdist and npm alike): one home, no copies.
export const FREECAD_ADAPTER_PATH = path.join(sdkRoot, 'python/agentsam_sdk/cad/adapters/freecad.py');
export const FREECAD_RESULT_PREFIX = 'AGENTSAM_RESULT=';
export const FREECAD_EXPORT_FORMATS = Object.freeze(['step', 'stp', 'iges', 'brep', 'stl']);

function isFile(value) {
  try {
    return Boolean(value) && fs.existsSync(value) && fs.statSync(value).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolves the FreeCAD host (python or FreeCADCmd). An explicit `freecadBin` narrows discovery to
 * that install; everything else follows the same algorithm as the Python SDK (freecad-host.js).
 */
export function resolveFreeCadHost({ freecadBin, env = process.env, platform = process.platform } = {}) {
  const scoped = { ...env };
  if (freecadBin) {
    const bundle = String(freecadBin).match(/^(.*?\.app)[\\/]/);
    const name = path.basename(String(freecadBin));
    if (bundle) scoped.AGENTSAM_FREECAD_HOME = path.join(bundle[1], 'Contents', 'Resources');
    else if (/^freecadcmd/i.test(name)) scoped.AGENTSAM_FREECAD_CMD = freecadBin;
    else if (/^python/i.test(name)) scoped.AGENTSAM_FREECAD_PYTHON = freecadBin;
    else scoped.AGENTSAM_FREECAD_HOME = path.dirname(path.dirname(freecadBin));
  }
  return discoverFreeCadHost({ env: scoped, platform });
}

/**
 * Compatibility view of resolveFreeCadHost for callers that only want a FreeCAD-capable interpreter.
 * A FreeCADCmd-only install has no interpreter to hand back; use resolveFreeCadHost for that.
 */
export function discoverFreeCadPython({ freecadBin, env = process.env, platform = process.platform } = {}) {
  const host = resolveFreeCadHost({ freecadBin, env, platform });
  return host?.mode === 'python'
    ? { pythonBin: host.executable, libDir: host.libraryDir }
    : { pythonBin: null, libDir: null };
}

export function parseFreeCadResult(stdout) {
  const line = String(stdout || '').split(/\r?\n/).reverse().find(value => value.startsWith(FREECAD_RESULT_PREFIX));
  if (!line) throw new Error('FreeCAD did not return an AgentSam result envelope');
  let value;
  try {
    value = JSON.parse(line.slice(FREECAD_RESULT_PREFIX.length));
  } catch {
    throw new Error('FreeCAD returned malformed AgentSam JSON');
  }
  if (!value || typeof value !== 'object') throw new Error('FreeCAD returned an invalid AgentSam result envelope');
  return value;
}

/**
 * Builds a precision boundary solid geometry with OpenCASCADE kernel and exports to STEP/IGES/BREP/STL.
 */
export async function freeCadBuild({
  recipe,
  output,
  format = 'step',
  freecadBin,
  timeoutSeconds = 60,
  cwd = process.cwd(),
  runProcessImpl = runProcess,
} = {}) {
  const host = resolveFreeCadHost({ freecadBin });
  if (!host || !fs.existsSync(FREECAD_ADAPTER_PATH)) {
    try {
      const dockerHealth = await probeDockerServiceHealth();
      if (dockerHealth.available && dockerHealth.tools?.freecad?.installed) {
        const dockerRes = await executeFreeCadDocker({
          recipe,
          operations: recipe?.operations || [],
          format,
          filename: output ? path.basename(output) : undefined,
          timeoutMs: timeoutSeconds * 1000,
        });
        if (output) {
          const outputPath = path.resolve(cwd, output);
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, Buffer.from(dockerRes.artifactBase64, 'base64'));
        }
        return {
          ...dockerRes,
          engine: 'freecad-docker',
        };
      }
    } catch {}
    throw new Error('FreeCAD Python environment is not available; install FreeCAD, set AGENTSAM_FREECAD_PYTHON, or launch AgentSam CAD Docker service');
  }

  const outputPath = path.resolve(cwd, output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const requestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-freecad-'));
  const requestPath = path.join(requestDir, 'request.json');

  const request = {
    schema_version: 1,
    output: outputPath,
    format,
    operations: recipe?.operations || [],
  };

  fs.writeFileSync(requestPath, JSON.stringify(request, null, 2), { mode: 0o600 });

  const env = freeCadHostEnvironment(host);
  const [command, ...commandArgs] = freeCadAdapterCommand(host, FREECAD_ADAPTER_PATH, requestPath, 'build');

  const started = Date.now();
  try {
    const proc = await runProcessImpl(
      command,
      commandArgs,
      {
        cwd,
        env,
        timeoutMs: timeoutSeconds * 1000,
        maxBytes: 8 * 1024 * 1024,
      }
    );

    const result = parseFreeCadResult(proc.stdout);
    if (!result.ok) {
      throw new Error(result.error || `FreeCAD build failed with exit code ${proc.code}`);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error(`FreeCAD build did not create output file: ${outputPath}`);
    }

    const durationMs = Date.now() - started;
    return {
      schema_version: 1,
      capability: 'freecad.build',
      ok: true,
      execution_lane: 'native',
      format,
      output: outputPath,
      sizeBytes: fs.statSync(outputPath).size,
      metrics: result.metrics,
      durationMs,
      logs: String(proc.stderr || proc.stdout || '').slice(-8000),
    };
  } finally {
    fs.rmSync(requestDir, { recursive: true, force: true });
  }
}

/**
 * Inspects a STEP / IGES / BREP solid model and returns exact geometric volume and bounding box.
 */
export async function freeCadInspect({
  input,
  freecadBin,
  timeoutSeconds = 30,
  cwd = process.cwd(),
  runProcessImpl = runProcess,
} = {}) {
  const host = resolveFreeCadHost({ freecadBin });
  if (!host) {
    throw new Error('FreeCAD is not available; install FreeCAD or set AGENTSAM_FREECAD_PYTHON / AGENTSAM_FREECAD_CMD');
  }

  const inputPath = path.resolve(cwd, input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`FreeCAD input file not found: ${inputPath}`);
  }

  const requestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-freecad-inspect-'));
  const requestPath = path.join(requestDir, 'request.json');

  const request = {
    schema_version: 1,
    input: inputPath,
  };

  fs.writeFileSync(requestPath, JSON.stringify(request, null, 2), { mode: 0o600 });

  const env = freeCadHostEnvironment(host);
  const [command, ...commandArgs] = freeCadAdapterCommand(host, FREECAD_ADAPTER_PATH, requestPath, 'inspect');

  const started = Date.now();
  try {
    const proc = await runProcessImpl(
      command,
      commandArgs,
      {
        cwd,
        env,
        timeoutMs: timeoutSeconds * 1000,
        maxBytes: 8 * 1024 * 1024,
      }
    );

    const result = parseFreeCadResult(proc.stdout);
    if (!result.ok) {
      throw new Error(result.error || `FreeCAD inspect failed with exit code ${proc.code}`);
    }

    return {
      schema_version: 1,
      capability: 'freecad.inspect',
      ok: true,
      execution_lane: 'native',
      input: inputPath,
      metrics: result.metrics,
      durationMs: Date.now() - started,
    };
  } finally {
    fs.rmSync(requestDir, { recursive: true, force: true });
  }
}

export { freeCadStatus };
