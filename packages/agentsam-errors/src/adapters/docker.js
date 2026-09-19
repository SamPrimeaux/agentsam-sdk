import { createErrorEnvelope } from '../envelope.js';
import { ERROR_REASON } from '../vocabulary.js';

export function classifyDockerFailure(evidence = {}, context = {}) {
  const text = `${evidence.code || ''} ${evidence.message || ''} ${evidence.stderr || ''}`.toLowerCase();
  let reason = context.reason;
  if (!reason && /cannot connect to the docker daemon|is the docker daemon running|docker daemon is not running/.test(text)) reason = ERROR_REASON.DOCKER_DAEMON_UNAVAILABLE;
  else if (!reason && /toomanyrequests|pull rate limit/.test(text)) reason = ERROR_REASON.DOCKER_PULL_RATE_LIMITED;
  else if (!reason && /unauthorized|authentication required|pull access denied|denied: requested access/.test(text)) reason = ERROR_REASON.DOCKER_REGISTRY_AUTH_FAILED;
  else if (!reason && /no such image|manifest unknown|image.*not found/.test(text)) reason = ERROR_REASON.DOCKER_IMAGE_NOT_FOUND;
  else if (!reason && (context.stage === 'build' || /build failed|failed to solve/.test(text))) reason = ERROR_REASON.DOCKER_BUILD_FAILED;
  else if (!reason && (context.stage === 'run' || context.stage === 'container')) reason = ERROR_REASON.DOCKER_CONTAINER_FAILED;
  else reason ||= ERROR_REASON.EXECUTION_FAILED;
  return createErrorEnvelope({
    reason,
    message: context.message || evidence.message || evidence.stderr || 'Docker operation failed',
    source: { kind: 'runtime', name: 'docker', service: context.service || null },
    domain: context.domain || 'runtime',
    tool: 'docker',
    stage: context.stage || 'execute',
    retry_after_ms: evidence.retry_after_ms,
    provider: context.provider || (reason === ERROR_REASON.DOCKER_PULL_RATE_LIMITED ? 'docker_registry' : null),
    native: { code: evidence.code, exit_code: evidence.exit_code, signal: evidence.signal, stderr: evidence.stderr, stdout: evidence.stdout, stack: evidence.stack },
    environment: context.environment || null,
    resource: context.resource || null,
    details: evidence.details || null,
  });
}
