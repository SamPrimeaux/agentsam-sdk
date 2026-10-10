import { createMediaHandlers } from './raster.js';
import { createScriptHandlers } from './scripts.js';
import { OPERATION_CATALOG } from './catalog.js';

function reject(code) { const e = new Error(code); e.code = code; throw e; }
function validate(value, schema, label = 'input') {
  if (!schema) return;
  if (schema.not) {
    try { validate(value, schema.not, label); } catch { /* matches negative constraint: allowed */ return; }
    reject(`${label}:forbidden_combination`);
  }
  if (schema.oneOf) {
    const valid = schema.oneOf.filter(v => { try { validate(value, v, label); return true; } catch { return false; } });
    if (valid.length !== 1) reject(`${label}:exactly_one_source_required`);
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.type && !types.some(t => t === 'null' ? value === null : t === 'array' ? Array.isArray(value) : t === 'object' ? value && typeof value === 'object' && !Array.isArray(value) : t === 'integer' ? Number.isInteger(value) : t === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === t)) reject(`${label}:invalid_type`);
  if (schema.enum && !schema.enum.includes(value)) reject(`${label}:invalid_enum`);
  if (typeof value === 'string' && schema.minLength != null && value.length < schema.minLength) reject(`${label}:too_short`);
  if (typeof value === 'string' && schema.maxLength != null && value.length > schema.maxLength) reject(`${label}:too_long`);
  if (typeof value === 'number' && schema.minimum != null && value < schema.minimum) reject(`${label}:below_minimum`);
  if (typeof value === 'number' && schema.maximum != null && value > schema.maximum) reject(`${label}:above_maximum`);
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) reject(`${label}:too_few_items`);
    if (schema.maxItems != null && value.length > schema.maxItems) reject(`${label}:too_many_items`);
    if (schema.items) value.forEach((v, i) => validate(v, schema.items, `${label}[${i}]`));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) if (value[key] === undefined) reject(`${label}.${key}:required`);
    if (schema.type !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (!Object.prototype.hasOwnProperty.call(schema.properties || {}, key)) {
        if (schema.additionalProperties === false) reject(`${label}.${key}:unknown_field`);
      } else validate(child, schema.properties[key], `${label}.${key}`);
    }
  }
}
export { validate as validateSamInput };

function mapExecution(policy) {
  const write = !['read', 'platform_read'].includes(policy.effect);
  return {
    lanes: policy.pack === 'sam' && policy.effect === 'shell_execution' ? ['local', 'remote', 'sandbox'] : ['platform', 'local', 'remote'],
    model: 'never', network: 'optional',
    sideEffects: write ? (policy.pack === 'sam' ? 'local_write' : 'remote_write') : 'none',
  };
}

/**
 * The host supplies the authoritative identity and permission decision.
 * This never installs an unresolved or fake handler into the SAM registry.
 * CMS/Cloudflare tools bind their existing domain command handlers via `handlers`.
 */
export function createGeneratedSamOperations({
  defineSamOperation, registerSamOperation, getSamOperation,
  handlers = {}, assetStore, sharp, subjectSegmenter, imageProvider, imageEditEnabled,
  scriptStore, processRuntime,
  resolveTrustedContext, authorize, extra = {},
} = {}) {
  if (typeof defineSamOperation !== 'function' || typeof registerSamOperation !== 'function') reject('sam_kernel_registry_required');
  if (typeof resolveTrustedContext !== 'function' || typeof authorize !== 'function') reject('trusted_identity_and_policy_required');
  const native = createMediaHandlers({ assetStore, sharp, subjectSegmenter, imageProvider, imageEditEnabled });
  const nativeScripts = createScriptHandlers({ scriptStore, processRuntime });
  const all = { ...native, ...nativeScripts, ...handlers };
  const installed = [], unavailable = [];
  for (const record of OPERATION_CATALOG) {
    if (record.aliasFor) { unavailable.push({ name: record.name, reason: 'alias_not_independently_advertised' }); continue; }
    const fn = all[record.name];
    if (typeof fn !== 'function') { unavailable.push({ name: record.name, reason: 'handler_not_bound' }); continue; }
    if (getSamOperation?.(record.name)) { installed.push({ name: record.name, status: 'existing' }); continue; }
    const operation = defineSamOperation({
      id: record.name, version: 1, module: record.name.split('.')[0],
      action: record.name.split('.').slice(1).join('.'),
      summary: record.description, description: record.description,
      capabilities: [record.capability_key],
      execution: mapExecution(record.policy),
      risk: ['read','platform_read'].includes(record.policy.effect) ? 'read_only'
        : ['live_publish','shell_execution'].includes(record.policy.effect) ? 'privileged' : 'write',
      input_schema: record.input_schema, output_schema: record.output_schema,
      status: 'stable',
      async handler(input, sdkCtx) {
        validate(input, record.input_schema);
        const trusted = await resolveTrustedContext(sdkCtx);
        if (!trusted?.accountId || !trusted?.actorId || !trusted?.installationId) reject('missing_trusted_identity');
        const decision = await authorize({ operation: record.name, policy: record.policy, input, identity: trusted });
        if (decision !== true && decision?.allow !== true) reject('capability_or_resource_denied');
        const result = await fn(input, { ...trusted, signal: sdkCtx?.signal, execution: sdkCtx?.execution, ...extra });
        if (result?.ok === false) reject(result.error || 'handler_returned_failure');
        return result;
      },
    });
    registerSamOperation(operation);
    installed.push({ name: record.name, status: 'registered' });
  }
  return { registered: installed, unavailable };
}
