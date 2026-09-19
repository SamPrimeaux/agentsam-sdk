import { createErrorEnvelope } from '../envelope.js';
import { classifyProviderFailure } from './provider.js';
import { ERROR_REASON } from '../vocabulary.js';

function text(evidence) {
  return `${evidence.code || ''} ${evidence.exception_type || evidence.type || ''} ${evidence.message || ''} ${evidence.stderr || ''}`.toLowerCase();
}

function commonCadReason(tool, evidence = {}, context = {}) {
  if (context.reason) return context.reason;
  if (evidence.available === false || evidence.installed === false) return ERROR_REASON.CAD_TOOL_NOT_INSTALLED;
  if (evidence.executable === false) return ERROR_REASON.CAD_TOOL_NOT_EXECUTABLE;
  if (evidence.version_compatible === false) return ERROR_REASON.CAD_TOOL_VERSION_INCOMPATIBLE;
  if (evidence.component_missing) return ERROR_REASON.CAD_COMPONENT_MISSING;
  if (evidence.dependency_missing) return ERROR_REASON.CAD_DEPENDENCY_MISSING;
  if (evidence.dependency_version_compatible === false) return ERROR_REASON.CAD_DEPENDENCY_VERSION_INCOMPATIBLE;
  if (evidence.output_missing) return ERROR_REASON.CAD_OUTPUT_MISSING;
  if (evidence.output_invalid) return ERROR_REASON.CAD_OUTPUT_INVALID;
  if (evidence.warning_escalated) return ERROR_REASON.CAD_WARNING_ESCALATED;
  if (evidence.timeout) return ERROR_REASON.EXECUTION_TIMEOUT;
  const value = text(evidence);
  if (/memoryerror|out of memory|memory exception|bad_alloc/.test(value)) return ERROR_REASON.CAD_MEMORY_EXHAUSTED;
  if (/unsupported.*format|format.*unsupported/.test(value)) return context.stage === 'export' ? ERROR_REASON.CAD_EXPORT_FORMAT_UNSUPPORTED : ERROR_REASON.CAD_INPUT_FORMAT_UNSUPPORTED;
  if (/gpu.*(?:unavailable|not found|unsupported)|no compatible gpu/.test(value)) return ERROR_REASON.CAD_GPU_UNAVAILABLE;
  if (/render engine.*(?:unavailable|not found|unsupported)|unknown render engine/.test(value)) return ERROR_REASON.CAD_RENDER_ENGINE_UNAVAILABLE;
  if (context.stage === 'render') return ERROR_REASON.CAD_RENDER_FAILED;
  if (context.stage === 'export') return ERROR_REASON.CAD_EXPORT_FAILED;
  if (context.stage === 'import') return ERROR_REASON.CAD_IMPORT_FAILED;
  if (Number.isInteger(evidence.exit_code) && evidence.exit_code !== 0) return ERROR_REASON.CAD_PROCESS_CRASHED;
  return ERROR_REASON.EXECUTION_FAILED;
}

function cadEnvelope(tool, evidence = {}, context = {}, reason = commonCadReason(tool, evidence, context)) {
  return createErrorEnvelope({
    reason,
    message: context.message || evidence.message || `${tool} operation failed`,
    source: context.source || { kind: 'dependency', name: tool, service: context.service || null },
    resolution_owner: context.resolution_owner,
    severity: context.severity,
    remediation: context.remediation,
    domain: 'cad',
    tool,
    stage: context.stage || 'execute',
    retryable: context.retryable,
    retry_after_ms: evidence.retry_after_ms,
    resource: context.resource || null,
    environment: context.environment || {
      detected_version: evidence.detected_version || evidence.version || null,
      required_version: evidence.required_version || null,
      component: evidence.component || null,
      runtime: evidence.runtime || null,
      platform: evidence.platform || null,
    },
    native: {
      code: evidence.code,
      exception_type: evidence.exception_type || evidence.type,
      exit_code: evidence.exit_code,
      signal: evidence.signal,
      stderr: evidence.stderr,
      stdout: evidence.stdout,
      stack: evidence.stack,
    },
    details: evidence.details || null,
  });
}

export function classifyFreeCadFailure(evidence = {}, context = {}) {
  const value = text(evidence);
  let reason = context.reason;
  if (!reason && /part::booleanexception/.test(value)) reason = ERROR_REASON.CAD_BOOLEAN_FAILED;
  else if (!reason && /part::nullshapeexception/.test(value)) reason = ERROR_REASON.CAD_NULL_SHAPE;
  else if (!reason && /base::cadkernelerror/.test(value)) reason = ERROR_REASON.CAD_KERNEL_FAILED;
  else if (!reason && /base::memoryexception/.test(value)) reason = ERROR_REASON.CAD_MEMORY_EXHAUSTED;
  else if (!reason && /parsererror|badformaterror/.test(value)) reason = ERROR_REASON.CAD_SOURCE_PARSE_FAILED;
  else if (!reason && /abortexception/.test(value)) reason = ERROR_REASON.CANCELLED;
  else if (!reason && context.stage === 'recompute') reason = ERROR_REASON.CAD_MODEL_RECOMPUTE_FAILED;
  return cadEnvelope('freecad', evidence, context, reason || commonCadReason('freecad', evidence, context));
}

export function classifyOpenScadFailure(evidence = {}, context = {}) {
  const value = text(evidence);
  let reason = context.reason;
  if (!reason && /parser error|syntax error|parse error/.test(value)) reason = ERROR_REASON.CAD_SOURCE_PARSE_FAILED;
  else if (!reason && /no top level geometry to render|empty top level object/.test(value)) reason = ERROR_REASON.CAD_GEOMETRY_INVALID;
  else if (!reason && /warning.*treated as error|hardwarnings/.test(value)) reason = ERROR_REASON.CAD_WARNING_ESCALATED;
  return cadEnvelope('openscad', evidence, context, reason || commonCadReason('openscad', evidence, context));
}

export function classifyBlenderFailure(evidence = {}, context = {}) {
  const value = text(evidence);
  let reason = context.reason;
  if (!reason && /python.*(?:exception|traceback)|valueerror|typeerror|runtimeerror/.test(value) && context.stage === 'script') reason = ERROR_REASON.CAD_SCRIPT_FAILED;
  else if (!reason && /boolean/.test(value) && /fail|error/.test(value)) reason = ERROR_REASON.CAD_BOOLEAN_FAILED;
  return cadEnvelope('blender', evidence, context, reason || commonCadReason('blender', evidence, context));
}

export function classifyMeshyFailure(evidence = {}, context = {}) {
  return classifyProviderFailure('meshy', evidence, { ...context, domain: 'cad', tool: 'meshy' });
}

export function classifyCadFailure(tool, evidence = {}, context = {}) {
  switch (String(tool || '').toLowerCase()) {
    case 'freecad': return classifyFreeCadFailure(evidence, context);
    case 'openscad': return classifyOpenScadFailure(evidence, context);
    case 'blender': return classifyBlenderFailure(evidence, context);
    case 'meshy': return classifyMeshyFailure(evidence, context);
    default: return cadEnvelope(String(tool || 'cad').toLowerCase(), evidence, context);
  }
}
