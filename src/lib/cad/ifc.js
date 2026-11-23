import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../../security/process.js';
import { discoverFreeCadPython } from './freecad.js';

/**
 * Local IFC lane: runs the one IfcOpenShell adapter (services/cad/ifc/adapter.py)
 * with any Python that can import it. The adapter is the single engine; the CAD
 * service container runs the same file. Nothing here parses or writes IFC itself.
 */
const sdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const IFC_ADAPTER_PATH = path.join(sdkRoot, 'services/cad/ifc/adapter.py');
export const IFC_RESULT_PREFIX = 'AGENTSAM_RESULT=';
export const IFC_EDIT_OPERATIONS = Object.freeze([
  'attribute.set', 'property.set', 'property.remove', 'placement.move',
  'solid.extrusion_depth', 'element.remove',
]);
const PROBE = 'import json,ifcopenshell,ifcopenshell.api,ifcopenshell.validate,ifcopenshell.util.placement as p;'
  + 'print(json.dumps({"version":ifcopenshell.version}))';
const CONTAINER_VENV = '/opt/agentsam-venv/bin/python';

const isFile = value => { try { return fs.statSync(value).isFile(); } catch { return false; } };
export const sha256File = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function pythonCandidates({ python, env, platform }) {
  const list = [];
  const add = (bin, source) => { if (bin && !list.some(c => c.bin === bin)) list.push({ bin, source }); };
  add(python, 'option');
  add(env.AGENTSAM_CAD_PYTHON, 'AGENTSAM_CAD_PYTHON');
  if (platform !== 'win32') add(CONTAINER_VENV, 'container-venv');
  add(platform === 'win32' ? 'python' : 'python3', 'path');
  if (platform !== 'win32') add('python', 'path');
  try { add(discoverFreeCadPython({ env, platform })?.pythonBin, 'freecad-bundled'); } catch { /* optional */ }
  return list;
}

let cached = null;

/** First interpreter that really imports ifcopenshell (+ api, validate, placement). */
export async function discoverIfcPython({ python, env = process.env, platform = process.platform, runProcessImpl = runProcess, fresh = false } = {}) {
  if (cached && !fresh && !python) return cached;
  const searched = [];
  for (const candidate of pythonCandidates({ python, env, platform })) {
    if (candidate.bin.includes(path.sep) && !isFile(candidate.bin)) { searched.push(`${candidate.bin} (missing)`); continue; }
    try {
      const proc = await runProcessImpl(candidate.bin, ['-c', PROBE], { timeoutMs: 20_000, maxBytes: 64 * 1024 });
      if (proc.code === 0) {
        const found = { available: true, python: candidate.bin, source: candidate.source, ifcopenshell: JSON.parse(proc.stdout.trim().split('\n').pop()).version };
        if (!python) cached = found;
        return found;
      }
      searched.push(`${candidate.bin} (no ifcopenshell)`);
    } catch { searched.push(`${candidate.bin} (not runnable)`); }
  }
  return {
    available: false, searched,
    guidance: 'Install IfcOpenShell into any Python 3 (pip install ifcopenshell), or install FreeCAD, which bundles it. '
      + 'Pass python to point at a specific interpreter.',
  };
}

export async function ifcStatus(options = {}) {
  const found = await discoverIfcPython({ ...options, fresh: true });
  return { capability: 'cad.bim.ifc.status', adapter: fs.existsSync(IFC_ADAPTER_PATH), ...found };
}

function resolveIfc(value, label, cwd, { mustExist }) {
  if (!String(value || '').trim()) throw Object.assign(new Error(`${label} path is required`), { code: 'sam_invalid_input' });
  const resolved = path.resolve(cwd, String(value));
  if (path.extname(resolved).toLowerCase() !== '.ifc') throw Object.assign(new Error(`${label} must be an .ifc file`), { code: 'sam_invalid_input' });
  if (mustExist && !isFile(resolved)) throw Object.assign(new Error(`${label} file not found: ${resolved}`), { code: 'sam_invalid_input' });
  return resolved;
}

export function parseIfcResult(stdout) {
  const line = String(stdout || '').split(/\r?\n/).reverse().find(v => v.startsWith(IFC_RESULT_PREFIX));
  if (!line) throw new Error('IFC adapter did not return an AgentSam result envelope');
  try { return JSON.parse(line.slice(IFC_RESULT_PREFIX.length)); } catch { throw new Error('IFC adapter returned malformed JSON'); }
}

async function runAdapter({ operation, request, python, timeoutSeconds = 120, cwd, runProcessImpl = runProcess }) {
  const runtime = await discoverIfcPython({ python, runProcessImpl });
  if (!runtime.available) {
    throw Object.assign(new Error(`IfcOpenShell is not available (looked in: ${runtime.searched.join(', ') || 'no interpreters'}). ${runtime.guidance}`),
      { code: 'sam_ifc_runtime_unavailable' });
  }
  if (!fs.existsSync(IFC_ADAPTER_PATH)) throw new Error('IFC adapter is not installed with this SDK build');
  const timeout = Number(timeoutSeconds);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600) throw new Error('timeout must be an integer from 1 to 600 seconds');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-ifc-'));
  const requestPath = path.join(dir, 'request.json');
  fs.writeFileSync(requestPath, JSON.stringify({ schema_version: 1, ...request }), { mode: 0o600 });
  try {
    const proc = await runProcessImpl(runtime.python, [IFC_ADAPTER_PATH, '--operation', operation, '--request', requestPath],
      { cwd, timeoutMs: timeout * 1000, maxBytes: 32 * 1024 * 1024 });
    let envelope;
    try { envelope = parseIfcResult(proc.stdout); } catch (error) {
      throw new Error(proc.code === 0 ? error.message : `IFC ${operation} failed (exit ${proc.code}): ${(proc.stderr || proc.stdout || '').slice(-2000)}`);
    }
    if (proc.code !== 0 || envelope.ok === false) {
      const message = String(envelope.error || `IFC ${operation} failed`);
      throw Object.assign(new Error(message), { code: message.includes('ifc_edit_base_conflict') ? 'sam_revision_conflict' : 'sam_ifc_operation_failed' });
    }
    return { envelope, runtime, dir, requestDir: dir };
  } catch (error) { fs.rmSync(dir, { recursive: true, force: true }); throw error; }
}

const finish = ({ dir }) => fs.rmSync(dir, { recursive: true, force: true });
const receipt = (runtime, started) => ({ python: runtime.python, python_source: runtime.source, ifcopenshell: runtime.ifcopenshell, duration_ms: Date.now() - started });

export async function ifcInspect({ input, maxElements, python, timeoutSeconds, cwd = process.cwd(), runProcessImpl } = {}) {
  const source = resolveIfc(input, 'input', cwd, { mustExist: true });
  const started = Date.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-ifc-out-'));
  try {
    const output = path.join(dir, 'model.json');
    const run = await runAdapter({ operation: 'inspect', request: { input: source, output, ...(maxElements ? { max_elements: maxElements } : {}) }, python, timeoutSeconds, cwd, runProcessImpl });
    try {
      const model = JSON.parse(fs.readFileSync(output, 'utf8'));
      return { schema_version: 1, capability: 'cad.bim.ifc.inspect', input: { path: source, sha256: sha256File(source) }, model, metrics: run.envelope.metrics, ...receipt(run.runtime, started) };
    } finally { finish(run); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

export async function ifcValidate({ input, python, timeoutSeconds, cwd = process.cwd(), runProcessImpl } = {}) {
  const source = resolveIfc(input, 'input', cwd, { mustExist: true });
  const started = Date.now();
  const run = await runAdapter({ operation: 'validate', request: { input: source }, python, timeoutSeconds, cwd, runProcessImpl });
  try { return { schema_version: 1, capability: 'cad.bim.ifc.validate', input: { path: source }, ...run.envelope.data, ...receipt(run.runtime, started) }; } finally { finish(run); }
}

export async function ifcDiff({ input, other, python, timeoutSeconds, cwd = process.cwd(), runProcessImpl } = {}) {
  const a = resolveIfc(input, 'input', cwd, { mustExist: true });
  const b = resolveIfc(other, 'other', cwd, { mustExist: true });
  const started = Date.now();
  const run = await runAdapter({ operation: 'diff', request: { input: a, other: b }, python, timeoutSeconds, cwd, runProcessImpl });
  try { return { schema_version: 1, capability: 'cad.bim.ifc.diff', ...run.envelope.data, ...receipt(run.runtime, started) }; } finally { finish(run); }
}

/** Edits a COPY. `base` (sha256 of the source you read) is the revision precondition; it defaults to the file as it is now. */
export async function ifcEdit({ input, output, edits, base, python, timeoutSeconds, cwd = process.cwd(), runProcessImpl } = {}) {
  const source = resolveIfc(input, 'input', cwd, { mustExist: true });
  const target = resolveIfc(output, 'output', cwd, { mustExist: false });
  if (!Array.isArray(edits) || edits.length === 0) throw Object.assign(new Error('edits must be a non-empty array'), { code: 'sam_invalid_input' });
  if (base != null && !/^[a-f0-9]{64}$/.test(String(base))) throw Object.assign(new Error('base must be a sha256 hex digest'), { code: 'sam_invalid_input' });
  const started = Date.now();
  const run = await runAdapter({ operation: 'edit', request: { input: source, output: target, base_sha256: base ?? sha256File(source), edits }, python, timeoutSeconds, cwd, runProcessImpl });
  try { return { schema_version: 1, capability: 'cad.bim.ifc.edit', ...run.envelope.data, ...receipt(run.runtime, started) }; } finally { finish(run); }
}
