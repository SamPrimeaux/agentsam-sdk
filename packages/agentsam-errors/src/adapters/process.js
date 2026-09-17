import { createErrorEnvelope } from '../envelope.js';
import { ERROR_REASON } from '../vocabulary.js';

export function classifyProcessFailure(evidence = {}, context = {}) {
  const code = String(evidence.code || '').toUpperCase();
  let reason = context.reason;
  if (!reason && (evidence.cancelled || code === 'ABORT_ERR' || code === 'PROCESS_CANCELLED')) reason = ERROR_REASON.CANCELLED;
  else if (!reason && (evidence.timeout || code === 'ETIMEDOUT' || code === 'PROCESS_TIMEOUT')) reason = ERROR_REASON.EXECUTION_TIMEOUT;
  else if (!reason && (evidence.output_limit || code === 'PROCESS_OUTPUT_LIMIT')) reason = ERROR_REASON.PROCESS_OUTPUT_LIMIT;
  else if (!reason && (code === 'ENOENT' || code === 'EACCES' || evidence.spawn_failed)) reason = ERROR_REASON.PROCESS_SPAWN_FAILED;
  else if (!reason && Number.isInteger(evidence.exit_code) && evidence.exit_code !== 0) reason = ERROR_REASON.PROCESS_CRASHED;
  else reason ||= ERROR_REASON.EXECUTION_FAILED;
  return createErrorEnvelope({
    reason,
    message: context.message || evidence.message || 'Process failed',
    source: context.source || { kind: 'runtime', name: context.tool || 'process' },
    resolution_owner: context.resolution_owner,
    severity: context.severity,
    remediation: context.remediation,
    domain: context.domain || 'runtime',
    tool: context.tool || null,
    stage: context.stage || 'execute',
    retryable: context.retryable,
    resource: context.resource || null,
    environment: context.environment || null,
    native: { code: evidence.code, exception_type: evidence.exception_type, exit_code: evidence.exit_code, signal: evidence.signal, stderr: evidence.stderr, stdout: evidence.stdout, stack: evidence.stack },
    details: evidence.details || null,
  });
}
