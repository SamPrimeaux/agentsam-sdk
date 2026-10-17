import { createMediaHandlers } from './raster.js';
import { createScriptHandlers } from './scripts.js';
import { OPERATION_CATALOG } from './catalog.js';

const SCRIPT_TOOL_DOCS = Object.freeze({
  'sam.superbash': {
    description: 'Execute an explicitly authorized local Bash script for project-scoped multi-command work, testing or batch processing. Prefer a specialized SAM operation when available. This is trusted local shell access, not a filesystem sandbox. No paid cloud runner is selected automatically. Returns a verified execution receipt with status, exit code and bounded diagnostics.',
    output_schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' }, executionId: { type: 'string' },
        status: { type: 'string' }, exitCode: { type: ['integer','null'] },
        stdout: { type: 'string' }, stderr: { type: 'string' },
        scriptHash: { type: 'string' }, lane: { type: 'string' },
        durationMs: { type: 'integer' }, error: { type: 'object' },
      },
      required: ['ok','executionId','status','exitCode','stdout','stderr','scriptHash','lane','durationMs'],
    },
  },
  'sam.script.save': {
    description: 'Save a versioned local Bash script artifact for this authorized account, actor and project installation. Revisions require expectedVersion; saving does not execute the script.',
    output_schema: {
      type: 'object', properties: {
        ok: { type: 'boolean' }, scriptId: { type: 'string' },
        version: { type: 'integer' }, artifactRef: { type: 'string' },
      }, required: ['ok','scriptId','version','artifactRef'],
    },
  },
  'sam.script.get': {
    description: 'Read a saved Bash script and its immutable version from the current authorized installation. Does not execute the script or access other users scripts.',
    output_schema: {
      type: 'object', properties: {
        ok: { type: 'boolean' }, scriptId: { type: 'string' },
        version: { type: 'integer' }, script: { type: 'string' },
        artifactRef: { type: 'string' },
      }, required: ['ok','scriptId','version','script','artifactRef'],
    },
  },
});


import { validateSamInput as validate } from '../../validation.js';
export { validateSamInput } from '../../validation.js';
function reject(code) { const e = new Error(code); e.code = code; throw e; }

function mapExecution(policy) {
  const write = !['read', 'platform_read', 'script_artifact_read'].includes(policy.effect);
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
  scriptStore, processRuntime, scriptExecutionLanes = null,
  resolveTrustedContext, authorize, extra = {},
} = {}) {
  if (typeof defineSamOperation !== 'function' || typeof registerSamOperation !== 'function') reject('sam_kernel_registry_required');
  if (typeof resolveTrustedContext !== 'function' || typeof authorize !== 'function') reject('trusted_identity_and_policy_required');
  const native = createMediaHandlers({ assetStore, sharp, subjectSegmenter, imageProvider, imageEditEnabled });
  const nativeScripts = createScriptHandlers({ scriptStore, processRuntime });
  const all = { ...native, ...nativeScripts, ...handlers };
  const installed = [], unavailable = [], aliases = [];
  for (const record of OPERATION_CATALOG) {
    if (record.aliasFor) {
      aliases.push({ name: record.name, aliasFor: record.aliasFor });
      continue;
    }
    // An existing domain owner is already bound; do not misreport it as
    // unavailable solely because generated-v2 was not given a second handler.
    if (getSamOperation?.(record.name)) {
      installed.push({ name: record.name, status: 'existing' });
      continue;
    }
    const fn = all[record.name];
    if (typeof fn !== 'function') {
      unavailable.push({
        name: record.name, reason: 'handler_not_bound',
        owner: record.policy?.pack || record.name.split('.')[0],
        nextAction: 'connect_authorized_host_handler_or_implement',
      });
      continue;
    }
    if (getSamOperation?.(record.name)) { installed.push({ name: record.name, status: 'existing' }); continue; }
    const operation = defineSamOperation({
      id: record.name, version: 1, module: record.name.split('.')[0],
      action: record.name.split('.').slice(1).join('.'),
      summary: SCRIPT_TOOL_DOCS[record.name]?.description || record.description,
      description: SCRIPT_TOOL_DOCS[record.name]?.description || record.description,
      capabilities: [record.capability_key],
      execution: {
        ...mapExecution(record.policy),
        ...(record.name === 'sam.superbash' && scriptExecutionLanes
          ? { lanes: [...scriptExecutionLanes] } : {}),
      },
      risk: ['read','platform_read','script_artifact_read'].includes(record.policy.effect) ? 'read_only'
        : ['live_publish','shell_execution'].includes(record.policy.effect) ? 'privileged' : 'write',
      input_schema: record.input_schema, output_schema: SCRIPT_TOOL_DOCS[record.name]?.output_schema || record.output_schema,
      status: 'stable',
      async handler(input, sdkCtx) {
        validate(input, record.input_schema);
        const trusted = await resolveTrustedContext(sdkCtx);
        if (!trusted?.accountId || !trusted?.actorId || !trusted?.installationId) reject('missing_trusted_identity');
        const decision = await authorize({ operation: record.name, policy: record.policy, input, identity: trusted });
        if (decision !== true && decision?.allow !== true) reject('capability_or_resource_denied');
        const result = await fn(input, { ...trusted, signal: sdkCtx?.signal, execution: sdkCtx?.execution, ...extra });
        // Script failures need their stderr/exit-code receipt in the model
        // result. Preserve prior error semantics for other domain operations.
        if (result?.ok === false && record.name !== 'sam.superbash') {
          reject(result.error?.code || result.error || 'handler_returned_failure');
        }
        return result;
      },
    });
    registerSamOperation(operation);
    installed.push({ name: record.name, status: 'registered' });
  }
  return { registered: installed, unavailable, aliases };
}
