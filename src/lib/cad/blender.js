import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../../security/process.js';
import { probeDockerServiceHealth, executeBlenderDocker } from './docker-executor.js';

const sdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const BLENDER_ADAPTER_PATH = path.join(sdkRoot, 'services/cad/blender/adapter.py');
export const BLENDER_RESULT_PREFIX = 'AGENTSAM_RESULT=';
export const BLENDER_EXPORT_FORMATS = Object.freeze(['glb', 'stl', 'obj']);
export const BLENDER_RECIPE_OPS = Object.freeze([
  'clear_scene',
  'add',
  'transform',
  'duplicate',
  'delete',
  'join',
  'bevel',
  'solidify',
  'array',
  'mirror',
  'boolean',
  'material',
  'assign_material',
  'add_camera',
  'add_light',
]);

function isFile(value, existsSync = fs.existsSync) {
  try { return Boolean(value) && existsSync(value) && fs.statSync(value).isFile(); }
  catch { return false; }
}

function canonicalExecutable(value) {
  try { return fs.realpathSync.native ? fs.realpathSync.native(value) : fs.realpathSync(value); }
  catch { return value; }
}

function pathCandidates(pathEnv, platform) {
  const names = platform === 'win32' ? ['blender.exe', 'blender'] : ['blender'];
  return String(pathEnv || '')
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap(dir => names.map(name => path.join(dir, name)));
}

function windowsInstallCandidates(env = process.env, readdirSync = fs.readdirSync) {
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA]
    .filter(Boolean)
    .flatMap(root => [
      path.join(root, 'Blender Foundation'),
      path.join(root, 'Programs', 'Blender Foundation'),
    ]);
  const found = [];
  for (const root of roots) {
    try {
      const entries = readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && /^Blender(?:\s|$)/i.test(entry.name))
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
      for (const entry of entries) found.push(path.join(root, entry.name, 'blender.exe'));
      found.push(path.join(root, 'blender.exe'));
    } catch { /* optional search root */ }
  }
  return found;
}

export function discoverBlender({
  blenderBin,
  env = process.env,
  platform = process.platform,
  existsSync = fs.existsSync,
  readdirSync = fs.readdirSync,
} = {}) {
  const explicit = String(blenderBin || '').trim();
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!isFile(resolved, existsSync)) throw new Error(`Blender binary not found: ${resolved}`);
    return canonicalExecutable(resolved);
  }

  const configured = String(env.AGENTSAM_BLENDER_BIN || '').trim();
  if (configured) {
    const resolved = path.resolve(configured);
    if (!isFile(resolved, existsSync)) throw new Error(`AGENTSAM_BLENDER_BIN does not exist: ${resolved}`);
    return canonicalExecutable(resolved);
  }

  const candidates = [
    ...pathCandidates(env.PATH, platform),
    ...(platform === 'win32' ? windowsInstallCandidates(env, readdirSync) : []),
    ...(platform === 'darwin' ? ['/Applications/Blender.app/Contents/MacOS/Blender'] : []),
    ...(platform === 'linux' ? ['/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender'] : []),
  ];
  const found = candidates.find(candidate => isFile(candidate, existsSync));
  return found ? canonicalExecutable(found) : null;
}

export function sha256File(file) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function boundedInteger(value, fallback, min, max, label) {
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function resolveInputBlend(input, cwd = process.cwd()) {
  const resolved = path.resolve(cwd, String(input || ''));
  if (!String(input || '').trim()) throw new Error('Blender input file is required');
  if (path.extname(resolved).toLowerCase() !== '.blend') throw new Error('Blender input must be a .blend file');
  if (!isFile(resolved)) throw new Error(`Blender input file not found: ${resolved}`);
  return resolved;
}

function resolveOutput(output, expectedExt, cwd = process.cwd(), input = null) {
  if (!String(output || '').trim()) throw new Error('Output path is required');
  const resolved = path.resolve(cwd, output);
  if (path.extname(resolved).toLowerCase() !== expectedExt) {
    throw new Error(`Output must end in ${expectedExt}`);
  }
  if (input && path.resolve(input) === resolved) throw new Error('Blender operations never overwrite the source .blend file');
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

export function validateBlenderRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) throw new Error('Blender recipe must be a JSON object');
  if (recipe.schema_version !== 1) throw new Error('Blender recipe schema_version must be 1');
  if (!Array.isArray(recipe.operations) || recipe.operations.length < 1) throw new Error('Blender recipe operations must be a non-empty array');
  if (recipe.operations.length > 256) throw new Error('Blender recipe may contain at most 256 operations');
  for (let index = 0; index < recipe.operations.length; index += 1) {
    const operation = recipe.operations[index];
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error(`recipe operation ${index} must be an object`);
    const op = String(operation.op || '').trim();
    if (!BLENDER_RECIPE_OPS.includes(op)) throw new Error(`unsupported Blender recipe operation at ${index}: ${op || '<empty>'}`);
  }
  return structuredClone(recipe);
}

export function parseBlenderResult(stdout) {
  const line = String(stdout || '').split(/\r?\n/).reverse().find(value => value.startsWith(BLENDER_RESULT_PREFIX));
  if (!line) throw new Error('Blender did not return an AgentSam result envelope');
  let value;
  try { value = JSON.parse(line.slice(BLENDER_RESULT_PREFIX.length)); }
  catch { throw new Error('Blender returned malformed AgentSam JSON'); }
  if (!value || typeof value !== 'object') throw new Error('Blender returned an invalid AgentSam result envelope');
  return value;
}

export function createBlenderInvocation({ operation, input, requestPath, blenderBin, factoryStartup = false }) {
  const args = ['--background'];
  if (factoryStartup) args.push('--factory-startup');
  if (input) args.push(input);
  args.push('--python', BLENDER_ADAPTER_PATH, '--', '--operation', operation, '--request', requestPath);
  return { command: blenderBin, args };
}

async function invokeBlender({
  operation,
  input = null,
  request = {},
  blenderBin,
  timeoutSeconds = 120,
  cwd = process.cwd(),
  factoryStartup = false,
  runProcessImpl = runProcess,
}) {
  const binary = discoverBlender({ blenderBin });
  const timeout = boundedInteger(timeoutSeconds, 120, 1, 600, 'timeout');

  if (!binary || !fs.existsSync(BLENDER_ADAPTER_PATH)) {
    try {
      const dockerHealth = await probeDockerServiceHealth();
      if (dockerHealth.available && dockerHealth.tools?.blender?.installed) {
        const dockerRes = await executeBlenderDocker({
          operation,
          recipe: request.recipe || (request.operations ? { schema_version: 1, operations: request.operations } : undefined),
          format: request.format || 'glb',
          filename: request.output ? path.basename(request.output) : undefined,
          timeoutMs: timeout * 1000,
        });

        if (request.output && dockerRes.artifactBase64) {
          const outputPath = path.resolve(cwd, request.output);
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, Buffer.from(dockerRes.artifactBase64, 'base64'));
        }

        return {
          result: dockerRes.result || { ok: true, blender_version: dockerHealth.tools.blender.version },
          binary: `docker://${dockerHealth.service || 'agentsam-cad'}/blender`,
          duration_ms: dockerRes.durationMs,
          execution_lane: 'docker_service',
        };
      }
    } catch {}

    throw new Error('Blender is not installed or could not be discovered; use --blender-bin, AGENTSAM_BLENDER_BIN, or launch AgentSam CAD Docker service');
  }
  const requestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-blender-'));
  const requestPath = path.join(requestDir, 'request.json');
  fs.writeFileSync(requestPath, JSON.stringify({ schema_version: 1, ...request }, null, 2), { mode: 0o600 });
  const invocation = createBlenderInvocation({ operation, input, requestPath, blenderBin: binary, factoryStartup });
  const started = Date.now();
  try {
    const proc = await runProcessImpl(invocation.command, invocation.args, {
      cwd,
      timeoutMs: timeout * 1000,
      maxBytes: 4 * 1024 * 1024,
    });
    let result;
    try { result = parseBlenderResult(proc.stdout); }
    catch (error) {
      if (proc.code !== 0) throw new Error(`Blender ${operation} failed with exit ${proc.code}: ${(proc.stderr || proc.stdout || '').slice(-4000)}`);
      throw error;
    }
    if (proc.code !== 0 || result.ok === false) throw new Error(result.error || `Blender ${operation} failed with exit ${proc.code}`);
    return {
      result,
      binary,
      duration_ms: Date.now() - started,
      logs: String(proc.stderr || '').slice(-8000),
    };
  } finally {
    fs.rmSync(requestDir, { recursive: true, force: true });
  }
}

export async function blenderStatus({ blenderBin, runProcessImpl = runProcess } = {}) {
  let binary;
  try { binary = discoverBlender({ blenderBin }); }
  catch (error) {
    return { schema_version: 1, capability: 'blender.status', available: false, binary: null, version: null, execution_lane: 'native', error: error.message };
  }
  if (!binary) return { schema_version: 1, capability: 'blender.status', available: false, binary: null, version: null, execution_lane: 'native' };
  const proc = await runProcessImpl(binary, ['--version'], { timeoutMs: 10_000, maxBytes: 256 * 1024 });
  const version = String(proc.stdout || proc.stderr || '').split(/\r?\n/).find(Boolean)?.trim() || null;
  return { schema_version: 1, capability: 'blender.status', available: proc.code === 0, binary, version, execution_lane: 'native' };
}

function inputReceipt(input) {
  return input ? { path: input, sha256: sha256File(input) } : null;
}

function artifactReceipt(file, format) {
  const stat = fs.statSync(file);
  return { path: file, format, size_bytes: stat.size, sha256: sha256File(file) };
}

export async function blenderInspect({ input, blenderBin, timeoutSeconds, cwd = process.cwd(), runProcessImpl } = {}) {
  const source = resolveInputBlend(input, cwd);
  const inputInfo = inputReceipt(source);
  const run = await invokeBlender({ operation: 'inspect', input: source, blenderBin, timeoutSeconds, cwd, runProcessImpl });
  return {
    schema_version: 1,
    capability: 'blender.inspect',
    ok: true,
    execution_lane: 'native',
    input: inputInfo,
    blender: { binary: run.binary, version: run.result.blender_version || null },
    scene: run.result.scene,
    duration_ms: run.duration_ms,
    warnings: run.result.warnings || [],
  };
}

export async function blenderBuild({ input, output, recipe, blenderBin, timeoutSeconds, cwd = process.cwd(), runProcessImpl } = {}) {
  const source = input ? resolveInputBlend(input, cwd) : null;
  const target = resolveOutput(output, '.blend', cwd, source);
  const normalizedRecipe = validateBlenderRecipe(recipe);
  const run = await invokeBlender({
    operation: 'build',
    input: source,
    request: { output: target, recipe: normalizedRecipe },
    blenderBin,
    timeoutSeconds,
    cwd,
    factoryStartup: !source,
    runProcessImpl,
  });
  if (!isFile(target)) throw new Error(`Blender build did not create output: ${target}`);
  return {
    schema_version: 1,
    capability: 'blender.build',
    ok: true,
    execution_lane: 'native',
    input: inputReceipt(source),
    blender: { binary: run.binary, version: run.result.blender_version || null },
    artifact: artifactReceipt(target, 'blend'),
    operations_applied: run.result.operations_applied ?? normalizedRecipe.operations.length,
    objects: run.result.objects || [],
    duration_ms: run.duration_ms,
    warnings: run.result.warnings || [],
  };
}

export async function blenderRenderPreview({ input, output, scene, camera, width = 1024, height = 1024, engine, blenderBin, timeoutSeconds, cwd = process.cwd(), runProcessImpl } = {}) {
  const source = resolveInputBlend(input, cwd);
  const target = resolveOutput(output, '.png', cwd, source);
  const request = {
    output: target,
    scene: scene || null,
    camera: camera || null,
    width: boundedInteger(width, 1024, 64, 4096, 'width'),
    height: boundedInteger(height, 1024, 64, 4096, 'height'),
    engine: engine || null,
  };
  const run = await invokeBlender({ operation: 'render_preview', input: source, request, blenderBin, timeoutSeconds, cwd, runProcessImpl });
  if (!isFile(target)) throw new Error(`Blender render did not create output: ${target}`);
  return {
    schema_version: 1,
    capability: 'blender.render_preview',
    ok: true,
    execution_lane: 'native',
    input: inputReceipt(source),
    blender: { binary: run.binary, version: run.result.blender_version || null },
    artifact: artifactReceipt(target, 'png'),
    scene: run.result.scene || null,
    camera: run.result.camera || null,
    duration_ms: run.duration_ms,
    warnings: run.result.warnings || [],
  };
}

export async function blenderExport({ input, output, format, scene, objects, collection, applyModifiers = true, blenderBin, timeoutSeconds, cwd = process.cwd(), runProcessImpl } = {}) {
  const source = resolveInputBlend(input, cwd);
  const normalizedFormat = String(format || '').toLowerCase().replace(/^\./, '');
  if (!BLENDER_EXPORT_FORMATS.includes(normalizedFormat)) throw new Error(`Unsupported Blender export format: ${normalizedFormat || '<empty>'}. Expected ${BLENDER_EXPORT_FORMATS.join(', ')}`);
  const target = resolveOutput(output, `.${normalizedFormat}`, cwd, source);
  const selectedObjects = Array.isArray(objects)
    ? objects.map(String).filter(Boolean)
    : String(objects || '').split(',').map(value => value.trim()).filter(Boolean);
  const run = await invokeBlender({
    operation: 'export',
    input: source,
    request: {
      output: target,
      format: normalizedFormat,
      scene: scene || null,
      objects: selectedObjects,
      collection: collection || null,
      apply_modifiers: Boolean(applyModifiers),
    },
    blenderBin,
    timeoutSeconds,
    cwd,
    runProcessImpl,
  });
  if (!isFile(target)) throw new Error(`Blender export did not create output: ${target}`);
  return {
    schema_version: 1,
    capability: 'blender.export',
    ok: true,
    execution_lane: 'native',
    input: inputReceipt(source),
    blender: { binary: run.binary, version: run.result.blender_version || null },
    artifact: artifactReceipt(target, normalizedFormat),
    selected_objects: run.result.selected_objects || [],
    duration_ms: run.duration_ms,
    warnings: run.result.warnings || [],
  };
}
