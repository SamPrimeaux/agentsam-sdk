import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_CATALOG_ROOT = path.resolve(fileURLToPath(new URL('../procedures/', import.meta.url)));
const ID_RE = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const EFFECTS = new Set(['read', 'local_write', 'project_write', 'export', 'external_action']);
const VERIFICATION_KINDS = new Set(['output_schema', 'fixture_suite', 'native_validation']);
const PYTHON_EXECUTABLE_RE = /^python3(?:\.\d+)?$/;

export class PrimetechProcedureError extends Error {
  constructor(code, message = code, details = undefined) {
    super(message);
    this.name = 'PrimetechProcedureError';
    this.code = code;
    this.details = details;
  }
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = value => createHash('sha256').update(value).digest('hex');
function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (isObject(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const jsonHash = value => hash(Buffer.from(stableStringify(value), 'utf8'));
const iso = ms => new Date(ms).toISOString();

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function safeProcedureId(value) {
  return typeof value === 'string' && ID_RE.test(value) && !value.includes('..');
}

function validateValue(value, schema, location = '$', errors = []) {
  if (!isObject(schema)) {
    errors.push({ path: location, code: 'schema_object_required' });
    return errors;
  }
  const types = Array.isArray(schema.type) ? schema.type : (schema.type ? [schema.type] : []);
  const matches = type => {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return isObject(value);
    if (type === 'integer') return Number.isInteger(value) && typeof value === 'number';
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'boolean') return typeof value === 'boolean';
    if (type === 'string') return typeof value === 'string';
    return true;
  };
  if (types.length && !types.some(matches)) {
    errors.push({ path: location, code: 'schema_type_mismatch', expected: types });
    return errors;
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    errors.push({ path: location, code: 'schema_const_mismatch' });
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push({ path: location, code: 'schema_enum_mismatch' });
  }
  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) errors.push({ path: location, code: 'schema_min_length' });
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) errors.push({ path: location, code: 'schema_max_length' });
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) errors.push({ path: location, code: 'schema_pattern_mismatch' });
  }
  if (typeof value === 'number') {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) errors.push({ path: location, code: 'schema_minimum' });
    if (Number.isFinite(schema.maximum) && value > schema.maximum) errors.push({ path: location, code: 'schema_maximum' });
  }
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) errors.push({ path: location, code: 'schema_min_items' });
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) errors.push({ path: location, code: 'schema_max_items' });
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) errors.push({ path: location, code: 'schema_items_not_unique' });
    if (schema.items) value.forEach((item, index) => validateValue(item, schema.items, location + '[' + index + ']', errors));
  }
  if (isObject(value)) {
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) errors.push({ path: location + '.' + key, code: 'schema_required_property_missing' });
    }
    if (isObject(schema.properties)) {
      for (const [key, item] of Object.entries(value)) {
        if (Object.hasOwn(schema.properties, key)) validateValue(item, schema.properties[key], location + '.' + key, errors);
        else if (schema.additionalProperties === false) errors.push({ path: location + '.' + key, code: 'schema_additional_property_not_allowed' });
      }
    } else if (schema.additionalProperties === false && Object.keys(value).length) {
      errors.push({ path: location, code: 'schema_additional_property_not_allowed' });
    }
  }
  return errors;
}

const SUPPORTED_SCHEMA_KEYS = new Set([
  'type', 'const', 'enum', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum',
  'minItems', 'maxItems', 'uniqueItems', 'items', 'required', 'properties', 'additionalProperties',
]);
const SUPPORTED_SCHEMA_TYPES = new Set(['object', 'array', 'string', 'integer', 'number', 'boolean', 'null']);

function validateSchemaDefinition(schema, location, errors) {
  if (!isObject(schema)) {
    errors.push({ path: location, code: 'procedure_json_schema_object_required' });
    return;
  }
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYS.has(key)) errors.push({ path: location + '.' + key, code: 'procedure_json_schema_keyword_not_supported' });
  }
  const types = Array.isArray(schema.type) ? schema.type : (schema.type ? [schema.type] : []);
  if (types.some(type => !SUPPORTED_SCHEMA_TYPES.has(type))) errors.push({ path: location + '.type', code: 'procedure_json_schema_type_not_supported' });
  if (schema.properties !== undefined) {
    if (!isObject(schema.properties)) errors.push({ path: location + '.properties', code: 'procedure_json_schema_properties_invalid' });
    else for (const [key, child] of Object.entries(schema.properties)) validateSchemaDefinition(child, location + '.properties.' + key, errors);
  }
  if (schema.items !== undefined) validateSchemaDefinition(schema.items, location + '.items', errors);
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== 'string'))) {
    errors.push({ path: location + '.required', code: 'procedure_json_schema_required_invalid' });
  }
  if (schema.enum !== undefined && !Array.isArray(schema.enum)) errors.push({ path: location + '.enum', code: 'procedure_json_schema_enum_invalid' });
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') {
    errors.push({ path: location + '.additionalProperties', code: 'procedure_json_schema_additional_properties_invalid' });
  }
}

export function validateProcedureManifest(manifest) {
  const errors = [];
  if (!isObject(manifest)) return { ok: false, errors: [{ path: '$', code: 'procedure_manifest_object_required' }] };
  const required = ['schema', 'id', 'version', 'summary', 'effect', 'capabilities', 'runtime', 'input_schema', 'output_schema', 'verification', 'flags'];
  for (const key of required) if (!Object.hasOwn(manifest, key)) errors.push({ path: '$.' + key, code: 'procedure_manifest_required_property_missing' });
  const allowed = new Set(required);
  for (const key of Object.keys(manifest)) if (!allowed.has(key)) errors.push({ path: '$.' + key, code: 'procedure_manifest_additional_property_not_allowed' });
  if (manifest.schema !== 'inneranimalmedia.primetech.procedure.v1') errors.push({ path: '$.schema', code: 'procedure_schema_unsupported' });
  if (!safeProcedureId(manifest.id)) errors.push({ path: '$.id', code: 'procedure_id_invalid' });
  if (typeof manifest.version !== 'string' || !VERSION_RE.test(manifest.version)) errors.push({ path: '$.version', code: 'procedure_version_invalid' });
  if (typeof manifest.summary !== 'string' || !manifest.summary.trim() || manifest.summary.length > 280) errors.push({ path: '$.summary', code: 'procedure_summary_invalid' });
  if (!EFFECTS.has(manifest.effect)) errors.push({ path: '$.effect', code: 'procedure_effect_invalid' });
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.some(item => typeof item !== 'string' || !/^[a-z][a-z0-9_.-]+$/.test(item)) || new Set(manifest.capabilities).size !== manifest.capabilities.length) {
    errors.push({ path: '$.capabilities', code: 'procedure_capabilities_invalid' });
  }
  if (!isObject(manifest.runtime)) {
    errors.push({ path: '$.runtime', code: 'procedure_runtime_object_required' });
  } else {
    const runtime = manifest.runtime;
    if (!['python', 'bash', 'sam_operation', 'native_tool'].includes(runtime.kind)) errors.push({ path: '$.runtime.kind', code: 'procedure_runtime_kind_invalid' });
    if (typeof runtime.entrypoint !== 'string' || !runtime.entrypoint || path.isAbsolute(runtime.entrypoint) || runtime.entrypoint.split(/[\\/]/).includes('..') || runtime.entrypoint.includes('\0')) {
      errors.push({ path: '$.runtime.entrypoint', code: 'procedure_entrypoint_invalid' });
    }
    if (typeof runtime.min_python !== 'string' || !/^\d+\.\d+$/.test(runtime.min_python)) errors.push({ path: '$.runtime.min_python', code: 'procedure_min_python_invalid' });
    if (!Array.isArray(runtime.dependencies) || runtime.dependencies.some(item => typeof item !== 'string')) errors.push({ path: '$.runtime.dependencies', code: 'procedure_dependencies_invalid' });
    if (runtime.interpreter_candidates !== undefined && (
      !Array.isArray(runtime.interpreter_candidates) || runtime.interpreter_candidates.length < 1 ||
      runtime.interpreter_candidates.length > 8 ||
      runtime.interpreter_candidates.some(item => typeof item !== 'string' || !PYTHON_EXECUTABLE_RE.test(item)) ||
      new Set(runtime.interpreter_candidates).size !== runtime.interpreter_candidates.length
    )) errors.push({ path: '$.runtime.interpreter_candidates', code: 'procedure_interpreter_candidates_invalid' });
    const runtimeAllowed = new Set(['kind', 'entrypoint', 'min_python', 'dependencies', 'interpreter_candidates']);
    for (const key of Object.keys(runtime)) if (!runtimeAllowed.has(key)) errors.push({ path: '$.runtime.' + key, code: 'procedure_runtime_additional_property_not_allowed' });
  }
  if (!isObject(manifest.input_schema) || !isObject(manifest.output_schema) || manifest.input_schema.type !== 'object' || manifest.output_schema.type !== 'object') {
    errors.push({ path: '$.input_schema', code: 'procedure_json_schemas_required' });
  } else {
    validateSchemaDefinition(manifest.input_schema, '$.input_schema', errors);
    validateSchemaDefinition(manifest.output_schema, '$.output_schema', errors);
  }
  if (!isObject(manifest.verification) || !VERIFICATION_KINDS.has(manifest.verification.kind)) {
    errors.push({ path: '$.verification', code: 'procedure_verification_invalid' });
  } else {
    for (const key of Object.keys(manifest.verification)) {
      if (!['kind', 'expected', 'fixture_id'].includes(key)) errors.push({ path: '$.verification.' + key, code: 'procedure_verification_additional_property_not_allowed' });
    }
  }
  if (!isObject(manifest.flags)) {
    errors.push({ path: '$.flags', code: 'procedure_flags_required' });
  } else {
    for (const key of ['network', 'physical_hardware', 'requires_operator_review']) {
      if (typeof manifest.flags[key] !== 'boolean') errors.push({ path: '$.flags.' + key, code: 'procedure_flag_boolean_required' });
    }
    for (const key of Object.keys(manifest.flags)) {
      if (!['network', 'physical_hardware', 'requires_operator_review'].includes(key)) errors.push({ path: '$.flags.' + key, code: 'procedure_flags_additional_property_not_allowed' });
    }
  }
  return { ok: errors.length === 0, errors };
}

function loadProcedure(root, id, requestedVersion = undefined) {
  if (!safeProcedureId(id)) throw new PrimetechProcedureError('primetech_procedure_id_invalid');
  const catalogRoot = fs.realpathSync(root);
  const procedureDir = path.resolve(catalogRoot, id);
  if (!inside(catalogRoot, procedureDir)) throw new PrimetechProcedureError('primetech_procedure_path_outside_catalog');
  let realDir;
  try { realDir = fs.realpathSync(procedureDir); }
  catch { throw new PrimetechProcedureError('primetech_procedure_not_found'); }
  if (!inside(catalogRoot, realDir)) throw new PrimetechProcedureError('primetech_procedure_path_outside_catalog');
  const manifestPath = path.join(realDir, 'procedure.json');
  let raw;
  let manifest;
  try {
    raw = fs.readFileSync(manifestPath);
    manifest = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    throw new PrimetechProcedureError('primetech_procedure_manifest_invalid', 'Procedure manifest is missing or invalid JSON.');
  }
  const validation = validateProcedureManifest(manifest);
  if (!validation.ok || manifest.id !== id) {
    throw new PrimetechProcedureError('primetech_procedure_manifest_invalid', 'Procedure manifest failed contract validation.', validation.errors);
  }
  if (requestedVersion !== undefined && requestedVersion !== manifest.version) {
    throw new PrimetechProcedureError('primetech_procedure_version_not_found');
  }
  const lexicalEntry = path.resolve(realDir, manifest.runtime.entrypoint);
  if (!inside(realDir, lexicalEntry)) throw new PrimetechProcedureError('primetech_procedure_entrypoint_outside_package');
  let entrypointPath;
  try { entrypointPath = fs.realpathSync(lexicalEntry); }
  catch { throw new PrimetechProcedureError('primetech_procedure_entrypoint_not_found'); }
  if (!inside(realDir, entrypointPath) || !fs.statSync(entrypointPath).isFile()) {
    throw new PrimetechProcedureError('primetech_procedure_entrypoint_outside_package');
  }
  return {
    manifest,
    manifestPath,
    procedureDir: realDir,
    entrypointPath,
    manifestSha256: hash(raw),
    entrypointSha256: hash(fs.readFileSync(entrypointPath)),
  };
}

export function createProcedureCatalog({ root = DEFAULT_CATALOG_ROOT } = {}) {
  const catalogRoot = path.resolve(root);
  return Object.freeze({
    list() {
      let dirs;
      try { dirs = fs.readdirSync(catalogRoot, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort(); }
      catch { throw new PrimetechProcedureError('primetech_procedure_catalog_unavailable'); }
      return dirs.map(id => {
        try {
          const row = loadProcedure(catalogRoot, id);
          return { id, version: row.manifest.version, summary: row.manifest.summary, effect: row.manifest.effect, available: true };
        } catch (error) {
          return { id, available: false, error: error.code || 'primetech_procedure_manifest_invalid' };
        }
      });
    },
    get(id, version) {
      return loadProcedure(catalogRoot, id, version);
    },
    root: catalogRoot,
  });
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function buildPythonCommand(manifest, entrypointPath, input) {
  const candidates = manifest.runtime.interpreter_candidates || ['python3.12', 'python3.11', 'python3.10', 'python3'];
  if (candidates.some(candidate => !PYTHON_EXECUTABLE_RE.test(candidate))) {
    throw new PrimetechProcedureError('primetech_procedure_interpreter_invalid');
  }
  const lines = ['set -euo pipefail'];
  for (const candidate of candidates) {
    lines.push('if command -v ' + shellQuote(candidate) + ' >/dev/null 2>&1; then');
    lines.push('  exec ' + shellQuote(candidate) + ' -B -I -S ' + shellQuote(entrypointPath) + ' ' + shellQuote(JSON.stringify(input)));
    lines.push('fi');
  }
  lines.push("printf '%s\\n' '{\"schema\":\"inneranimalmedia.primetech.asset-inventory.v1\",\"ok\":false,\"error\":\"python_interpreter_not_found\"}' >&2");
  lines.push('exit 127');
  return lines.join('\n');
}

function writeJsonAtomic(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = target + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    try { fs.chmodSync(temporary, 0o600); } catch {}
    fs.renameSync(temporary, target);
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
}

export function summarizeProcedureRuns({ receiptDir, procedureId = null, limit = 1000 } = {}) {
  if (typeof receiptDir !== 'string' || !receiptDir) throw new PrimetechProcedureError('primetech_receipt_directory_required');
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new PrimetechProcedureError('primetech_receipt_limit_invalid');
  let root;
  try { root = fs.realpathSync(receiptDir); }
  catch { throw new PrimetechProcedureError('primetech_receipt_directory_unavailable'); }
  const files = fs.readdirSync(root)
    .filter(name => /^receipt-primetech\.procedure\.run-ptr_[a-f0-9]+\.json$/.test(name))
    .sort()
    .slice(-limit);
  const groups = new Map();
  let scanned = 0;
  let ignored = 0;
  for (const name of files) {
    let row;
    try { row = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); }
    catch { ignored++; continue; }
    if (row?.schema !== 'agentsam.primetech.procedure-receipt.v1' || !isObject(row.procedure) ||
        typeof row.procedure.id !== 'string' || typeof row.procedure.version !== 'string') {
      ignored++;
      continue;
    }
    if (procedureId && row.procedure.id !== procedureId) continue;
    scanned++;
    const key = row.procedure.id + '@' + row.procedure.version;
    if (!groups.has(key)) groups.set(key, {
      id: row.procedure.id, version: row.procedure.version, run_count: 0, completed: 0, failed: 0,
      durations: [], failures: new Map(), last_run_at: null,
    });
    const group = groups.get(key);
    group.run_count++;
    if (row.status === 'completed') group.completed++;
    else {
      group.failed++;
      const code = row.error?.code || 'unknown';
      group.failures.set(code, (group.failures.get(code) || 0) + 1);
    }
    if (Number.isFinite(row.duration_ms) && row.duration_ms >= 0) group.durations.push(row.duration_ms);
    const at = row.completed_at || row.started_at || null;
    if (at && (!group.last_run_at || at > group.last_run_at)) group.last_run_at = at;
  }
  const percentile = (values, p) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  };
  const by_procedure = [...groups.values()].map(group => {
    const durations = group.durations;
    return {
      id: group.id,
      version: group.version,
      run_count: group.run_count,
      completed: group.completed,
      failed: group.failed,
      success_rate: group.run_count ? Number((group.completed / group.run_count).toFixed(4)) : 0,
      mean_duration_ms: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      p50_duration_ms: percentile(durations, 0.5),
      p95_duration_ms: percentile(durations, 0.95),
      last_run_at: group.last_run_at,
      failures: [...group.failures.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => ({ code, count })),
    };
  }).sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
  return { schema: 'inneranimalmedia.primetech.procedure-performance.v1', scanned, ignored, by_procedure };
}

export function createPrimeTechProcedureHandler({
  catalog = createProcedureCatalog(),
  projectRoot,
  receiptDir = null,
  invokeSamOperation,
  isCapabilityAvailable = () => false,
  authorizeProcedure = null,
  now = () => Date.now(),
} = {}) {
  return async function runPrimeTechProcedure(input = {}) {
    const started = now();
    const runId = 'ptr_' + randomUUID().replaceAll('-', '');
    let procedure = null;
    let execution = null;
    let output = null;
    let outputSha256 = null;
    let artifactRef = null;
    let artifactBytes = 0;
    let verification = { kind: 'output_schema', ok: false };
    let errorCode = null;
    let errorMessage = null;
    const data = isObject(input) ? input : {};
    const receiptRoot = receiptDir
      ? path.resolve(receiptDir)
      : (projectRoot ? path.resolve(projectRoot, '.agentsam', 'receipts') : null);
    const record = {
      schema: 'agentsam.primetech.procedure-receipt.v1',
      id: runId,
      status: 'running',
      started_at: iso(started),
      procedure: null,
      input_sha256: jsonHash(data),
      manifest_sha256: null,
      entrypoint_sha256: null,
      output_sha256: null,
      output_bytes: null,
      artifact_bytes: 0,
      timings_ms: { preflight: 0, execution: 0, verification: 0, persistence: 0 },
      verification,
      execution: null,
    };
    const persistReceipt = status => {
      if (!receiptRoot) return null;
      record.status = status;
      record.completed_at = iso(now());
      record.duration_ms = Math.max(0, now() - started);
      record.procedure = procedure ? { id: procedure.manifest.id, version: procedure.manifest.version, effect: procedure.manifest.effect } : null;
      record.manifest_sha256 = procedure?.manifestSha256 || null;
      record.entrypoint_sha256 = procedure?.entrypointSha256 || null;
      record.output_sha256 = outputSha256;
      record.verification = verification;
      record.execution = execution ? {
        execution_id: execution.executionId || execution.execution_id || null,
        script_sha256: execution.scriptHash || execution.script_sha256 || null,
        status: execution.status || null,
        exit_code: execution.exitCode ?? execution.exit_code ?? null,
        duration_ms: execution.durationMs ?? execution.duration_ms ?? null,
        script_bytes: execution.scriptBytes ?? execution.script_bytes ?? null,
      } : null;
      record.output_bytes = output ? Buffer.byteLength(stableStringify(output), 'utf8') : null;
      record.artifact_bytes = artifactBytes;
      record.artifact_ref = artifactRef;
      record.error = errorCode ? { code: errorCode, message: errorMessage } : null;
      try {
        const relative = 'receipt-primetech.procedure.run-' + runId + '.json';
        const target = path.resolve(receiptRoot, relative);
        if (!inside(receiptRoot, target)) throw new Error('receipt_path_outside_root');
        writeJsonAtomic(target, record);
        return { ref: relative, sha256: hash(fs.readFileSync(target)) };
      } catch {
        return null;
      }
    };

    try {
      if (!isObject(input)) throw new PrimetechProcedureError('primetech_procedure_input_object_required');
      const allowed = new Set(['id', 'version', 'input']);
      if (Object.keys(input).some(key => !allowed.has(key))) throw new PrimetechProcedureError('primetech_procedure_input_additional_property_not_allowed');
      if (!safeProcedureId(input.id) || typeof input.version !== 'string' || !VERSION_RE.test(input.version) || !isObject(input.input)) {
        throw new PrimetechProcedureError('primetech_procedure_input_invalid');
      }
      if (!projectRoot || typeof invokeSamOperation !== 'function') throw new PrimetechProcedureError('primetech_procedure_host_binding_required');
      const canonicalProjectRoot = fs.realpathSync(projectRoot);
      if (!fs.statSync(canonicalProjectRoot).isDirectory()) throw new PrimetechProcedureError('primetech_procedure_project_root_invalid');
      procedure = catalog.get(input.id, input.version);
      const manifest = procedure.manifest;
      record.procedure = { id: manifest.id, version: manifest.version, effect: manifest.effect };
      const inputErrors = validateValue(input.input, manifest.input_schema);
      if (inputErrors.length) throw new PrimetechProcedureError('primetech_procedure_input_schema_invalid', 'Procedure input did not match its schema.', inputErrors);
      if (manifest.flags.physical_hardware) throw new PrimetechProcedureError('primetech_physical_hardware_not_supported');
      for (const capability of manifest.capabilities) {
        if (await isCapabilityAvailable(capability) !== true) {
          throw new PrimetechProcedureError('primetech_required_capability_unavailable', 'A required SAM capability is not bound: ' + capability);
        }
      }
      if (manifest.effect !== 'read' || manifest.flags.network || manifest.flags.requires_operator_review) {
        if (typeof authorizeProcedure !== 'function' || await authorizeProcedure({
          id: manifest.id, version: manifest.version, effect: manifest.effect,
          network: manifest.flags.network, requires_operator_review: manifest.flags.requires_operator_review,
          input_sha256: record.input_sha256,
        }) !== true) {
          throw new PrimetechProcedureError('primetech_procedure_operator_approval_required');
        }
      }
      if (manifest.runtime.kind !== 'python') throw new PrimetechProcedureError('primetech_procedure_runtime_kind_not_supported');
      if (manifest.verification.kind !== 'output_schema') throw new PrimetechProcedureError('primetech_verification_kind_not_supported');
      const script = buildPythonCommand(manifest, procedure.entrypointPath, input.input);
      record.timings_ms.preflight = Math.max(0, now() - started);
      const executionStarted = now();
      const samResult = await invokeSamOperation('sam.superbash', {
        script,
        relativeCwd: '.',
        idempotencyKey: 'primetech:' + manifest.id + ':' + manifest.version + ':' + record.input_sha256,
      });
      if (!samResult || samResult.ok !== true) {
        const code = samResult?.error?.code || samResult?.error || 'primetech_procedure_execution_failed';
        throw new PrimetechProcedureError(code, 'The existing SAM process operation did not complete successfully.');
      }
      execution = samResult.data || samResult;
      record.timings_ms.execution = Math.max(0, now() - executionStarted);
      if (execution.ok === false || execution.status !== 'completed' || (execution.exitCode ?? execution.exit_code) !== 0) {
        const code = execution.error?.code || 'primetech_procedure_execution_failed';
        throw new PrimetechProcedureError(code, 'The existing SAM process operation did not complete successfully.');
      }
      const stdout = String(execution.stdout || '').trim();
      try { output = JSON.parse(stdout); }
      catch { throw new PrimetechProcedureError('primetech_procedure_output_invalid', 'Procedure stdout was not one valid JSON document.'); }
      if (!isObject(output) || output.ok !== true) throw new PrimetechProcedureError('primetech_procedure_output_failed');
      const verificationStarted = now();
      const outputErrors = validateValue(output, manifest.output_schema);
      if (outputErrors.length) throw new PrimetechProcedureError('primetech_procedure_output_verification_failed', 'Procedure output failed schema verification.', outputErrors);
      if (manifest.verification.kind === 'output_schema' && manifest.verification.expected && output.schema !== manifest.verification.expected) {
        throw new PrimetechProcedureError('primetech_procedure_output_verification_failed');
      }
      verification = { kind: manifest.verification.kind, ok: true };
      record.timings_ms.verification = Math.max(0, now() - verificationStarted);
      outputSha256 = jsonHash(output);
      const warnings = [];
      let artifactSha256 = null;
      const artifact = JSON.stringify(output, null, 2) + '\n';
      const persistenceStarted = now();
      if (receiptRoot) {
        artifactRef = path.join('artifacts', 'primetech', manifest.id, manifest.version, runId + '.json').split(path.sep).join('/');
        const artifactPath = path.resolve(receiptRoot, artifactRef);
        if (!inside(receiptRoot, artifactPath)) throw new PrimetechProcedureError('primetech_artifact_path_outside_receipts');
        try {
          writeJsonAtomic(artifactPath, output);
          const bytes = fs.readFileSync(artifactPath);
          artifactSha256 = hash(bytes);
          artifactBytes = bytes.length;
        } catch {
          artifactRef = null;
          artifactBytes = 0;
          warnings.push({ code: 'primetech_artifact_write_failed', message: 'The procedure succeeded, but its JSON artifact could not be persisted.' });
        }
      }
      record.timings_ms.persistence = Math.max(0, now() - persistenceStarted);
      const receipt = persistReceipt('completed');
      if (!receipt) warnings.push({ code: 'sam_receipt_write_failed', message: 'The procedure succeeded, but its local receipt could not be persisted.' });
      const response = {
        schema: 'inneranimalmedia.primetech.procedure-run.v1',
        id: manifest.id,
        version: manifest.version,
        status: 'completed',
        effect: manifest.effect,
        output,
        artifact: artifactRef ? { ref: artifactRef, sha256: artifactSha256, bytes: artifactBytes } : null,
        verification,
        execution: {
          operation: 'sam.superbash',
          execution_id: execution.executionId || execution.execution_id || null,
          script_sha256: execution.scriptHash || execution.script_sha256 || null,
          status: execution.status,
          exit_code: execution.exitCode ?? execution.exit_code ?? null,
          duration_ms: execution.durationMs ?? execution.duration_ms ?? null,
          script_bytes: execution.scriptBytes ?? execution.script_bytes ?? null,
        },
        receipt: receipt ? { id: runId, ...receipt } : { id: runId, written: false },
        duration_ms: Math.max(0, now() - started),
      };
      if (warnings.length) response.warnings = warnings;
      return response;
    } catch (error) {
      errorCode = error.code || 'primetech_procedure_failed';
      errorMessage = error.message || errorCode;
      const receipt = persistReceipt('failed');
      const wrapped = new PrimetechProcedureError(errorCode, errorMessage, {
        receipt: receipt ? { id: runId, ...receipt } : { id: runId, written: false },
        ...(!receipt ? { warnings: [{ code: 'sam_receipt_write_failed', message: 'The failed procedure could not persist its receipt.' }] } : {}),
        ...(error.details ? { details: error.details } : {}),
      });
      throw wrapped;
    }
  };
}

export { DEFAULT_CATALOG_ROOT };
