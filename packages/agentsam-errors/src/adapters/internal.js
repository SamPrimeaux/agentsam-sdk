import { createErrorEnvelope } from '../envelope.js';
import { ERROR_REASON } from '../vocabulary.js';

const INTERNAL_REASONS = new Set([
  ERROR_REASON.INTERNAL,
  ERROR_REASON.INTERNAL_INVARIANT_VIOLATION,
  ERROR_REASON.INTERNAL_CONFIGURATION_INVALID,
  ERROR_REASON.INTERNAL_CONTRACT_VIOLATION,
  ERROR_REASON.INTERNAL_ADAPTER_FAILED,
  ERROR_REASON.INTERNAL_DEPENDENCY_FAILED,
  ERROR_REASON.IDENTITY_RESOLUTION_FAILED,
  ERROR_REASON.IDENTITY_MISMATCH,
  ERROR_REASON.PERSISTENCE_FAILED,
  ERROR_REASON.DATA_CORRUPT,
  ERROR_REASON.DATA_LOSS,
]);

export function classifyInternalFailure(evidence = {}, context = {}) {
  const reason = context.reason && INTERNAL_REASONS.has(context.reason) ? context.reason : ERROR_REASON.INTERNAL;
  return createErrorEnvelope({
    reason,
    message: context.message || evidence.message || 'AgentSam encountered an internal failure.',
    source: context.source || { kind: 'agentsam', name: context.system || 'agentsam-sdk', service: context.service || null },
    resolution_owner: 'agentsam',
    severity: 'blocking_internal',
    retryable: false,
    remediation: { action: 'inspect_platform', message: context.remediation_message || 'AgentSam must inspect this platform failure.' },
    domain: context.domain || 'runtime',
    tool: context.tool || null,
    stage: context.stage || 'execute',
    resource: context.resource || null,
    provider: context.provider || null,
    provider_code: evidence.provider_code || evidence.code || null,
    request_id: evidence.request_id || null,
    trace_id: evidence.trace_id || context.trace_id || null,
    native: { code: evidence.code, exception_type: evidence.exception_type || evidence.name, exit_code: evidence.exit_code, signal: evidence.signal, stderr: evidence.stderr, stdout: evidence.stdout, stack: evidence.stack },
    environment: context.environment || null,
    details: evidence.details || null,
  });
}
