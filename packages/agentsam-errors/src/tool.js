import { createErrorEnvelope } from './envelope.js';
import { AgentSamError } from './error.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function nativeFromCause(cause) {
  if (!cause || typeof cause !== 'object') return null;
  return {
    code: cause.code || null,
    exception_type: cause.name || null,
    exit_code: cause.exit_code ?? cause.exitCode ?? null,
    signal: cause.signal || null,
    stderr: cause.stderr || null,
    stdout: cause.stdout || null,
    stack: cause.stack || null,
  };
}

/**
 * Build the canonical AgentSam error envelope for any tool/capability.
 *
 * Tool implementations should supply an existing ERROR_REASON plus tool/stage
 * context. Do not mint tool-specific error taxonomies when the shared
 * vocabulary already describes the failure.
 */
export function createToolErrorEnvelope(input = {}, options = {}) {
  const tool = clean(input.tool);
  if (!tool) throw new TypeError('tool is required');

  const cause = options.cause || input.cause || null;
  const { cause: _ignoredCause, ...envelopeInput } = input;

  return createErrorEnvelope({
    ...envelopeInput,
    domain: input.domain || 'tool',
    tool,
    stage: clean(input.stage) || 'execute',
    source: input.source || {
      kind: 'agentsam',
      name: 'agentsam-sdk',
      service: tool,
    },
    native: input.native || nativeFromCause(cause),
  });
}

/**
 * Throwable view over createToolErrorEnvelope().
 */
export function createToolError(input = {}, options = {}) {
  const cause = options.cause || input.cause || null;
  const envelope = createToolErrorEnvelope(input, { cause });
  return new AgentSamError(envelope, cause ? { cause } : {});
}
