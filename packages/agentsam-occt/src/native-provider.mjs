import { createOcctSession } from './native-session.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { OCCT_NATIVE_CAPABILITIES, OCCT_NATIVE_OPERATIONS, toMillimeters } from './index.js';
export { OCCT_NATIVE_OPERATIONS };

const defaultRun = promisify(execFile);
const RECEIPT_PREFIX = 'AGENTSAM_RESULT=';

function readReceipt(stdout, expectedOperation) {
  const line = String(stdout).split(/\r?\n/).filter(v => v.startsWith(RECEIPT_PREFIX)).at(-1);
  if (!line) throw new Error('occt_receipt_missing');
  let value;
  try { value = JSON.parse(line.slice(RECEIPT_PREFIX.length)); }
  catch { throw new Error('occt_receipt_invalid'); }
  if (value?.ok !== true || value?.engine !== 'occt' ||
      (expectedOperation && value.operation !== expectedOperation)) {
    throw new Error('occt_receipt_unverified');
  }
  return value;
}

function existingExecutable(binary) {
  if (typeof binary !== 'string' || !path.isAbsolute(binary)) return false;
  try {
    return fs.statSync(binary).isFile() && (fs.accessSync(binary, fs.constants.X_OK), true);
  } catch { return false; }
}

function artifactRoot(ctx) {
  if (typeof ctx?.artifactRoot !== 'string' || !path.isAbsolute(ctx.artifactRoot)) {
    throw new Error('occt_artifact_root_required');
  }
  const root = fs.realpathSync(ctx.artifactRoot);
  if (!fs.statSync(root).isDirectory()) throw new Error('occt_artifact_root_invalid');
  return root;
}

function scopedFile(file, root) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('occt_artifact_path_invalid');
  const real = fs.realpathSync(file);
  const relative = path.relative(root, real);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('occt_artifact_outside_scope');
  }
  if (!fs.statSync(real).isFile()) throw new Error('occt_artifact_not_file');
  return real;
}


/** Native-only, fail-closed implementation of a small subset of cad.project.v1 operations.
 * Engine availability is established from a real process receipt, never a UI claim.
 */
export function createOcctNativeProvider({
  binary = process.env.AGENTSAM_OCCT_BIN || path.join(os.homedir(), '.agentsam', 'bin', 'agentsam-occt'),
  runProcess = defaultRun,
  timeoutMs = 20000,
} = {}) {
  async function call(args, expectedOperation) {
    const { stdout } = await runProcess(binary, args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return readReceipt(stdout, expectedOperation);
  }

  async function doctor() {
    if (!existingExecutable(binary)) {
      return { engine: 'occt', available: false, ready: false, reason: 'occt_binary_not_configured', execution_lane: 'local' };
    }
    try {
      const receipt = await call(['--doctor']);
      if (!receipt.version || !Array.isArray(receipt.capabilities) ||
          !receipt.capabilities.includes('solid.box.create') ||
          !receipt.capabilities.includes('solid.inspect.step')) {
        throw new Error('occt_capability_receipt_invalid');
      }
      return { engine: 'occt', available: true, ready: true, version: receipt.version,
        capabilities: receipt.capabilities, operations: [...OCCT_NATIVE_OPERATIONS],
        execution_lane: 'local', binary };
    } catch (error) {
      return { engine: 'occt', available: true, ready: false,
        reason: error?.message || 'occt_probe_failed', execution_lane: 'local' };
    }
  }

  async function inspect(artifact, ctx) {
    const root = artifactRoot(ctx);
    const file = scopedFile(artifact?.path, root);
    const receipt = await call(['--inspect', file], 'solid.inspect.step');
    if (!Number.isFinite(receipt.volume_mm3) || receipt.volume_mm3 <= 0) {
      throw new Error('occt_inspection_unverified');
    }
    return { verified: true, engine: 'occt', operation: 'design_model_inspect',
      volume_mm3: receipt.volume_mm3, units: 'mm', artifact_path: file };
  }

  async function execute(operation, input = {}, ctx = {}) {
    if (!OCCT_NATIVE_OPERATIONS.includes(operation)) throw new Error('occt_operation_unsupported');
    const health = await doctor();
    if (!health.ready) throw new Error(health.reason || 'occt_engine_not_ready');
    if (operation === 'design_model_inspect') return inspect(input.artifact, ctx);
    if (input.kind === 'features') {
      if (input.units !== 'mm') throw new Error('occt_feature_units_mm_required');
      if (!Array.isArray(input.operations) || !input.operations.length || input.operations.length > 10000
          || typeof input.elementId !== 'string' || typeof ctx.projectId !== 'string') throw new Error('occt_feature_document_required');
      if (!health.capabilities.includes('engine.session.v1')) throw new Error('occt_session_capability_unavailable');
      const format = input.format || 'step';
      if (!['step','brep','gltf','ifc'].includes(format)) throw new Error('occt_export_format_invalid');
      const root = artifactRoot(ctx), target = path.join(root, `${crypto.randomUUID()}.${format}`);
      const session = createOcctSession({binary,timeoutMs});
      try {
        await session.request({action:'open',projectId:ctx.projectId,operations:input.operations,cursor:input.cursor ?? input.operations.length});
        const model = await session.request({action:'state'});
        const feature = model.features.find(f => f.id === input.elementId);
        if (!feature || !(feature.volume_mm3 > 0)) throw new Error('occt_solid_element_required');
        const exported = await session.request({action:'export',id:input.elementId,format,path:target});
        if (Math.abs(exported.volume_mm3-feature.volume_mm3)>Math.max(1e-4,feature.volume_mm3*1e-7)) throw new Error('occt_export_volume_mismatch');
        const bytes=fs.readFileSync(target);if(!bytes.length)throw new Error('occt_export_empty');
        return {engine:'occt',operation,verified:true,native_version:health.version,shape:'feature',element_id:input.elementId,
          volume_mm3:feature.volume_mm3,feature_cursor:model.cursor,operation_count:model.operationCount,
          artifact:{path:target,format,size_bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}};
      } catch (error) { try {fs.unlinkSync(target);} catch {} throw error; }
      finally {session.close();}
    }
    if (input.kind !== 'box') throw new Error('occt_shape_unsupported');
    const { width, depth, height, units } = input;
    const dimensions = [width, depth, height].map(v => toMillimeters(v, units));
    const root = artifactRoot(ctx);
    const target = path.join(root, `${crypto.randomUUID()}.step`);
    const receipt = await call(['--box', ...dimensions.map(String), target], 'solid.box.create');
    const inspected = await inspect({ path: target }, ctx);
    const expected = dimensions.reduce((a, b) => a * b, 1);
    if (Math.abs(inspected.volume_mm3 - expected) > Math.max(1e-5, expected * 1e-6) ||
        !Number.isFinite(receipt.volume_mm3) ||
        Math.abs(receipt.volume_mm3 - inspected.volume_mm3) > Math.max(1e-5, expected * 1e-6)) {
      throw new Error('occt_roundtrip_mismatch');
    }
    const artifact = fs.readFileSync(target);
    if (artifact.length === 0) throw new Error('occt_artifact_empty');
    return { engine: 'occt', operation, verified: true,
      native_version: health.version, shape: 'box', dimensions_mm: dimensions,
      volume_mm3: inspected.volume_mm3,
      artifact: { path: target, format: 'step', size_bytes: artifact.length,
        sha256: crypto.createHash('sha256').update(artifact).digest('hex') } };
  }

  return { id: 'occt-native', executionLanes: ['local'],
    capabilities: [...OCCT_NATIVE_CAPABILITIES],
    discover: doctor, doctor, execute, inspect };
}
