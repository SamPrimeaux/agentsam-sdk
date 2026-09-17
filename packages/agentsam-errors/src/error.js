import { createErrorEnvelope, isErrorEnvelope } from './envelope.js';

export class AgentSamError extends Error {
  constructor(envelope, options = {}) {
    const normalized = isErrorEnvelope(envelope) ? envelope : createErrorEnvelope(envelope);
    super(normalized.message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AgentSamError';
    this.envelope = normalized;
    // Compatibility alias for pre-v1 callers. It points at the canonical
    // envelope; it is not a second diagnostic vocabulary.
    this.diagnostic = normalized;
    this.code = normalized.code;
    this.reason = normalized.reason;
    this.severity = normalized.severity;
    this.retryable = normalized.retryable;
    this.status = normalized.http_status;
    this.fingerprint = normalized.fingerprint;
  }
}

export function asAgentSamError(value, options = {}) {
  if (value instanceof AgentSamError) return value;
  return new AgentSamError(value, options);
}
