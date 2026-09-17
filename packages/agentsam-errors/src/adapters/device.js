import { createErrorEnvelope } from '../envelope.js';
import { ERROR_REASON } from '../vocabulary.js';

const STATE_REASON = Object.freeze({
  not_enrolled: ERROR_REASON.DEVICE_NOT_ENROLLED,
  credential_missing: ERROR_REASON.DEVICE_CREDENTIAL_MISSING,
  credential_invalid: ERROR_REASON.DEVICE_CREDENTIAL_INVALID,
  credential_expired: ERROR_REASON.DEVICE_CREDENTIAL_EXPIRED,
  registration_missing: ERROR_REASON.DEVICE_REGISTRATION_MISSING,
  registration_stale: ERROR_REASON.DEVICE_REGISTRATION_STALE,
  connection_revoked: ERROR_REASON.CONNECTION_REVOKED,
  connection_disabled: ERROR_REASON.CONNECTION_DISABLED,
  identity_resolution_failed: ERROR_REASON.IDENTITY_RESOLUTION_FAILED,
  identity_mismatch: ERROR_REASON.IDENTITY_MISMATCH,
});

export function classifyDeviceFailure(evidence = {}, context = {}) {
  const state = String(evidence.state || evidence.code || '').toLowerCase();
  const reason = context.reason || STATE_REASON[state] || ERROR_REASON.UNKNOWN;
  const internal = [ERROR_REASON.IDENTITY_RESOLUTION_FAILED, ERROR_REASON.IDENTITY_MISMATCH].includes(reason);
  return createErrorEnvelope({
    reason,
    message: context.message || evidence.message || (internal ? 'AgentSam could not resolve the registered device identity.' : 'This device connection needs attention.'),
    source: context.source || (internal ? { kind: 'agentsam', name: 'inneranimalmedia', service: 'terminal_control_plane' } : { kind: 'runtime', name: 'execos', service: 'device' }),
    resolution_owner: internal ? 'agentsam' : context.resolution_owner,
    severity: internal ? 'blocking_internal' : context.severity,
    remediation: internal ? { action: 'inspect_platform', message: 'AgentSam must inspect the terminal control plane.' } : context.remediation,
    domain: 'device',
    tool: context.tool || 'execos',
    stage: context.stage || 'authentication',
    resource: context.resource || { type: 'terminal_device', id: evidence.instance_id || null },
    provider_code: evidence.provider_code || null,
    request_id: evidence.request_id || null,
    trace_id: evidence.trace_id || null,
    native: { code: evidence.code || state || null, exception_type: evidence.exception_type || null, stack: evidence.stack || null },
    details: evidence.details || null,
  });
}
